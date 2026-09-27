/**
 * The packet engine. One probe = an ICMP-echo pair: a request packet plus
 * a reply packet generated on delivery, both sharing the stage's MAC
 * tables so "learn then unicast" is observable across sends. Flooding
 * fans a packet out into bounded copies explored breadth-first; copies
 * die silently at non-destination NICs and loudly at decision drops.
 *
 * Deliberately not modelled (see issue #56): ARP requests (a "查邻居表"
 * step records the consult instead), STP (flood copies are capped and
 * produce a broadcast-storm verdict), CRC/encap details.
 */

import {
  formatIp,
  longestPrefixMatch,
  networkOf,
  parseIp,
  sameSubnet,
  type RouteEntry,
} from "./addressing.ts";
import {
  linkNeighbor,
  nodeById,
  ownerOfIp,
  portAddress,
  portOf,
  type NetNode,
  type NetPort,
  type NetTopology,
} from "./topology.ts";

export const DEFAULT_MAX_HOPS = 16;
export const DEFAULT_MAX_EVENTS = 512;
export const MAX_FLOOD_COPIES = 8;
export const INITIAL_TTL = 8;

export type DropReason =
  | "no-gateway"
  | "gateway-offlink"
  | "no-route"
  | "ttl-exceeded"
  | "event-limit"
  | "broadcast-storm"
  | "unlinked"
  | "no-response";

export const DROP_LABEL: Record<DropReason, string> = {
  "no-gateway": "未配置默认网关",
  "gateway-offlink": "网关不在本网段",
  "no-route": "无匹配路由",
  "ttl-exceeded": "TTL 耗尽（疑似环路）",
  "event-limit": "超出事件预算",
  "broadcast-storm": "广播风暴：泛洪副本超限",
  unlinked: "端口未接线",
  "no-response": "无应答：没有设备使用这个地址",
};

export type SimAction =
  "consult" | "send" | "learn" | "forward" | "flood" | "deliver" | "drop" | "ignore";

export type SimLeg = "request" | "reply";

export type SimStep = {
  seq: number;
  leg: SimLeg;
  nodeId: string;
  at: string;
  action: SimAction;
  detail: string;
  outPort?: string;
  ttl?: number;
  /** Forward/flood targets as "LABEL·port" strings for the trace table. */
  to?: string[];
  /** Switch MAC table snapshot after this step, for the tables view. */
  macsAfter?: Record<string, Record<string, string>>;
};

/** Learned MAC tables, one per switch: mac → port id. */
export type SimState = { macs: Map<string, Map<string, string>> };

export function freshSimState(net: NetTopology): SimState {
  const macs = new Map<string, Map<string, string>>();
  for (const node of net.nodes) {
    if (node.kind === "switch") macs.set(node.id, new Map());
  }
  return { macs };
}

function snapshotMacs(state: SimState): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [sw, table] of state.macs) {
    out[sw] = Object.fromEntries([...table.entries()].sort(([a], [b]) => a.localeCompare(b)));
  }
  return out;
}

export type SimOptions = {
  maxHops?: number;
  maxEvents?: number;
};

type Copy = {
  nodeId: string;
  inPort: string | null;
  srcMac: string;
  dstIp: number;
  dstMac: string | null;
  path: string[];
  ttl: number;
};

export type PacketResult = {
  delivered: boolean;
  reason?: DropReason;
  droppedAt?: string;
  droppedAtId?: string;
  /** Label path of the delivered (or first decisively dropped) copy. */
  path: string[];
  flooded: boolean;
  eventsUsed: number;
};

type RunCtx = {
  net: NetTopology;
  state: SimState;
  leg: SimLeg;
  trace: SimStep[];
  seq: number;
  maxEvents: number;
  copiesSpawned: number;
  overflowed: boolean;
};

function emit(ctx: RunCtx, step: Omit<SimStep, "seq" | "leg" | "macsAfter">): void {
  ctx.seq += 1;
  ctx.trace.push({ ...step, seq: ctx.seq, leg: ctx.leg, macsAfter: snapshotMacs(ctx.state) });
}

function endIp(
  net: NetTopology,
  node: NetNode,
): { port: NetPort; ip: number; prefix: number } | null {
  for (const port of node.ports) {
    const addr = portAddress(port);
    if (addr) return { port, ...addr };
  }
  return null;
}

function owns(node: NetNode, ip: number): boolean {
  return node.ports.some((p) => portAddress(p)?.ip === ip);
}

/** Resolve a next-hop IP to a MAC via the global "neighbor table" — the ARP stand-in. */
function resolveMac(net: NetTopology, ip: number): string | null {
  const owner = ownerOfIp(net, ip);
  return owner?.port.mac ?? null;
}

function targetLabel(node: NetNode, portId: string): string {
  return `${node.label}·${portId}`;
}

/**
 * Push a copy through the link leaving (nodeId, outPort). Returns the
 * next Copy, or null when the port is dangling.
 */
function traverse(
  ctx: RunCtx,
  copy: Copy,
  node: NetNode,
  outPort: string,
  srcMac: string,
  dstMac: string | null,
): Copy | null {
  const next = linkNeighbor(ctx.net, node.id, outPort);
  if (!next) return null;
  return {
    nodeId: next.node.id,
    inPort: next.port.id,
    srcMac,
    dstIp: copy.dstIp,
    dstMac,
    path: [...copy.path, next.node.label],
    ttl: copy.ttl,
  };
}

/** Host source decision: deliver / direct / via gateway / drop. */
function hostDecideSource(
  ctx: RunCtx,
  copy: Copy,
  node: NetNode,
  queue: Copy[],
  result: { dropped?: { at: string; atId: string; reason: DropReason; path: string[] } },
  deliveredPath: { path: string[] } | null,
): boolean {
  const me = endIp(ctx.net, node);
  if (!me) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "drop",
      detail: "接口没有配置地址，无法判定",
      ttl: copy.ttl,
    });
    result.dropped ??= { at: node.label, atId: node.id, reason: "no-gateway", path: copy.path };
    return false;
  }
  const outPort = me.port.id;
  emit(ctx, {
    nodeId: node.id,
    at: node.label,
    action: "consult",
    detail: `查邻居表：${formatIp(copy.dstIp)}`,
    outPort,
    ttl: copy.ttl,
  });
  if (owns(node, copy.dstIp)) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "deliver",
      detail: "目标就是本机",
      ttl: copy.ttl,
    });
    if (deliveredPath) deliveredPath.path = copy.path;
    return true;
  }
  let nextHopIp: number;
  if (sameSubnet(me.ip, me.prefix, copy.dstIp)) {
    nextHopIp = copy.dstIp;
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "send",
      detail: `${formatIp(copy.dstIp)} 在同一网段 → 直发`,
      outPort,
      ttl: copy.ttl,
    });
  } else {
    const gwText = node.gateway?.trim();
    const gwIp = gwText ? parseIp(gwText) : null;
    if (!gwText || gwIp === null) {
      emit(ctx, {
        nodeId: node.id,
        at: node.label,
        action: "drop",
        detail: "目标在网段外，但未配置默认网关",
        ttl: copy.ttl,
      });
      result.dropped ??= { at: node.label, atId: node.id, reason: "no-gateway", path: copy.path };
      return false;
    }
    if (!sameSubnet(me.ip, me.prefix, gwIp)) {
      emit(ctx, {
        nodeId: node.id,
        at: node.label,
        action: "drop",
        detail: `默认网关 ${gwText} 不在本网段`,
        ttl: copy.ttl,
      });
      result.dropped ??= {
        at: node.label,
        atId: node.id,
        reason: "gateway-offlink",
        path: copy.path,
      };
      return false;
    }
    nextHopIp = gwIp;
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "send",
      detail: `出本网段 → 交默认网关 ${formatIp(gwIp)}`,
      outPort,
      ttl: copy.ttl,
    });
  }
  copy.ttl -= 1;
  if (copy.ttl <= 0) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "drop",
      detail: "TTL 耗尽，丢弃",
      ttl: 0,
    });
    result.dropped ??= { at: node.label, atId: node.id, reason: "ttl-exceeded", path: copy.path };
    return false;
  }
  const dstMac = resolveMac(ctx.net, nextHopIp);
  const fwd = traverse(ctx, copy, node, outPort, me.port.mac ?? "", dstMac);
  if (!fwd) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "drop",
      detail: `端口 ${outPort} 未接线`,
      ttl: copy.ttl,
    });
    result.dropped ??= { at: node.label, atId: node.id, reason: "unlinked", path: copy.path };
    return false;
  }
  const peer = nodeById(ctx.net, fwd.nodeId)!;
  emit(ctx, {
    nodeId: node.id,
    at: node.label,
    action: "forward",
    detail: `从 ${outPort} 发出`,
    outPort,
    ttl: copy.ttl,
    to: [targetLabel(peer, fwd.inPort!)],
  });
  queue.push(fwd);
  return false;
}

function hostReceive(
  ctx: RunCtx,
  copy: Copy,
  node: NetNode,
  deliveredPath: { path: string[] } | null,
): boolean {
  const inPort = portOf(node, copy.inPort!);
  const macOk = copy.dstMac === null ? false : inPort?.mac === copy.dstMac;
  if (!macOk) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "ignore",
      detail: "帧不是发给我的",
      ttl: copy.ttl,
    });
    return false;
  }
  if (owns(node, copy.dstIp)) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "deliver",
      detail: "到达目标主机",
      ttl: copy.ttl,
    });
    if (deliveredPath) deliveredPath.path = copy.path;
    return true;
  }
  emit(ctx, {
    nodeId: node.id,
    at: node.label,
    action: "ignore",
    detail: "目的地址不是本机",
    ttl: copy.ttl,
  });
  return false;
}

function switchDecide(ctx: RunCtx, copy: Copy, node: NetNode, queue: Copy[]): boolean {
  const table = ctx.state.macs.get(node.id)!;
  const inPort = copy.inPort!;
  const learned = table.get(copy.srcMac);
  if (learned !== inPort) {
    table.set(copy.srcMac, inPort);
    const srcOwner = ctx.net.nodes.find((n) => n.ports.some((p) => p.mac === copy.srcMac));
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "learn",
      detail: `学习：${srcOwner?.label ?? copy.srcMac} 的 MAC 在 ${inPort}`,
      outPort: inPort,
      ttl: copy.ttl,
    });
  }
  const lookupPort = copy.dstMac !== null ? table.get(copy.dstMac) : undefined;
  const targets: { node: NetNode; port: NetPort }[] = [];
  if (lookupPort !== undefined) {
    if (lookupPort === inPort) {
      emit(ctx, {
        nodeId: node.id,
        at: node.label,
        action: "ignore",
        detail: `目的 MAC 就在入端口 ${inPort} 侧 → 不再转发`,
        ttl: copy.ttl,
      });
      return false;
    }
    const peer = linkNeighbor(ctx.net, node.id, lookupPort);
    if (peer) {
      const fwd = traverse(ctx, copy, node, lookupPort, copy.srcMac, copy.dstMac);
      if (fwd) {
        emit(ctx, {
          nodeId: node.id,
          at: node.label,
          action: "forward",
          detail: `查 MAC 表 → 从 ${lookupPort} 单播`,
          outPort: lookupPort,
          ttl: copy.ttl,
          to: [targetLabel(peer.node, fwd.inPort!)],
        });
        queue.push(fwd);
      }
    }
    return false;
  }
  // Unknown destination (or unresolved MAC): flood every wired port except the ingress.
  for (const port of node.ports) {
    if (port.id === inPort) continue;
    const peer = linkNeighbor(ctx.net, node.id, port.id);
    if (peer) targets.push(peer);
  }
  if (targets.length === 0) return false; // copy dies quietly — no one to tell
  emit(ctx, {
    nodeId: node.id,
    at: node.label,
    action: "flood",
    detail: `MAC 表无此地址 → 泛洪到 ${targets.length} 个端口`,
    ttl: copy.ttl,
    to: targets.map((t) => targetLabel(t.node, t.port.id)),
  });
  for (const target of targets) {
    ctx.copiesSpawned += 1;
    if (ctx.copiesSpawned > MAX_FLOOD_COPIES) {
      ctx.overflowed = true;
      return true;
    }
    queue.push({
      nodeId: target.node.id,
      inPort: target.port.id,
      srcMac: copy.srcMac,
      dstIp: copy.dstIp,
      dstMac: copy.dstMac,
      path: [...copy.path, target.node.label],
      ttl: copy.ttl,
    });
  }
  return true;
}

function routerDecide(
  ctx: RunCtx,
  copy: Copy,
  node: NetNode,
  queue: Copy[],
  result: { dropped?: { at: string; atId: string; reason: DropReason; path: string[] } },
  deliveredPath: { path: string[] } | null,
): boolean {
  const inPort = portOf(node, copy.inPort!);
  if (copy.dstMac === null || inPort?.mac !== copy.dstMac) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "ignore",
      detail: "帧不是发给我的",
      ttl: copy.ttl,
    });
    return false;
  }
  if (owns(node, copy.dstIp)) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "deliver",
      detail: "目的地址是本机接口",
      ttl: copy.ttl,
    });
    if (deliveredPath) deliveredPath.path = copy.path;
    return true;
  }
  // Directly-connected subnets win over static routes — the interface is the route.
  let outPort: NetPort | null = null;
  let nextHopIp = copy.dstIp;
  for (const port of node.ports) {
    const addr = portAddress(port);
    if (addr && networkOf(addr.ip, addr.prefix) === networkOf(copy.dstIp, addr.prefix)) {
      outPort = port;
      break;
    }
  }
  let routeNote = "";
  if (!outPort) {
    const routes: RouteEntry[] = [];
    for (const row of node.routes ?? []) {
      const prefixParts = row.prefix.split("/");
      const net = parseIp(prefixParts[0]);
      const prefix = prefixParts.length === 2 ? Number(prefixParts[1]) : NaN;
      if (net === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) continue;
      routes.push({
        network: networkOf(net, prefix) >>> 0,
        prefix,
        nextHop: parseIp(row.nextHop) ?? -1,
      });
    }
    const match = longestPrefixMatch(routes, copy.dstIp);
    if (!match) {
      emit(ctx, {
        nodeId: node.id,
        at: node.label,
        action: "drop",
        detail: `查路由表：无匹配 ${formatIp(copy.dstIp)} 的条目 → 丢弃`,
        ttl: copy.ttl,
      });
      result.dropped ??= { at: node.label, atId: node.id, reason: "no-route", path: copy.path };
      return false;
    }
    nextHopIp = match.nextHop;
    for (const port of node.ports) {
      const addr = portAddress(port);
      if (addr && networkOf(addr.ip, addr.prefix) === networkOf(nextHopIp, addr.prefix)) {
        outPort = port;
        break;
      }
    }
    routeNote = `查路由表：${formatIp(match.network)}/${match.prefix} → 下一跳 ${formatIp(nextHopIp)}`;
    if (!outPort) {
      emit(ctx, {
        nodeId: node.id,
        at: node.label,
        action: "drop",
        detail: `${routeNote}，但下一跳不在任何直连网段 → 丢弃`,
        ttl: copy.ttl,
      });
      result.dropped ??= { at: node.label, atId: node.id, reason: "no-route", path: copy.path };
      return false;
    }
  } else {
    routeNote = `目标 ${formatIp(copy.dstIp)} 在直连网段 → 直发`;
  }
  copy.ttl -= 1;
  if (copy.ttl <= 0) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "drop",
      detail: `${routeNote}，但 TTL 耗尽 → 丢弃`,
      ttl: 0,
    });
    result.dropped ??= { at: node.label, atId: node.id, reason: "ttl-exceeded", path: copy.path };
    return false;
  }
  const dstMac = resolveMac(ctx.net, nextHopIp);
  const fwd = traverse(ctx, copy, node, outPort.id, outPort.mac ?? "", dstMac);
  if (!fwd) {
    emit(ctx, {
      nodeId: node.id,
      at: node.label,
      action: "drop",
      detail: `端口 ${outPort.id} 未接线`,
      ttl: copy.ttl,
    });
    result.dropped ??= { at: node.label, atId: node.id, reason: "unlinked", path: copy.path };
    return false;
  }
  const peer = nodeById(ctx.net, fwd.nodeId)!;
  emit(ctx, {
    nodeId: node.id,
    at: node.label,
    action: "forward",
    detail: routeNote,
    outPort: outPort.id,
    ttl: copy.ttl,
    to: [targetLabel(peer, fwd.inPort!)],
  });
  queue.push(fwd);
  return false;
}

/** Run one packet (one leg of a probe) to delivery or exhaustion. */
export function runPacket(
  net: NetTopology,
  state: SimState,
  srcNodeId: string,
  dstIp: number,
  leg: SimLeg,
  trace: SimStep[],
  seqRef: { seq: number },
  opts: SimOptions = {},
): PacketResult {
  const src = nodeById(net, srcNodeId);
  const maxEvents = opts.maxEvents ?? DEFAULT_MAX_EVENTS;
  const startSeq = seqRef.seq;
  const result: { dropped?: { at: string; atId: string; reason: DropReason; path: string[] } } = {};
  const deliveredPath: { path: string[] } | null = { path: [] };
  const ctx: RunCtx = {
    net,
    state,
    leg,
    trace,
    seq: seqRef.seq,
    maxEvents,
    copiesSpawned: 0,
    overflowed: false,
  };
  const queue: Copy[] = [];
  if (src) {
    queue.push({
      nodeId: src.id,
      inPort: null,
      srcMac: "",
      dstIp,
      dstMac: null,
      path: [src.label],
      ttl: INITIAL_TTL,
    });
  }
  let delivered = false;
  let flooded = false;
  while (queue.length > 0 && !delivered) {
    if (ctx.seq - startSeq >= maxEvents) {
      result.dropped ??= { at: "—", atId: "", reason: "event-limit", path: [] };
      break;
    }
    const copy = queue.shift()!;
    const node = nodeById(net, copy.nodeId);
    if (!node) continue;
    if (node.kind === "host") {
      if (copy.inPort === null) {
        if (hostDecideSource(ctx, copy, node, queue, result, deliveredPath)) delivered = true;
      } else if (hostReceive(ctx, copy, node, deliveredPath)) {
        delivered = true;
      }
    } else if (node.kind === "switch") {
      if (switchDecide(ctx, copy, node, queue)) flooded = true;
    } else {
      if (routerDecide(ctx, copy, node, queue, result, deliveredPath)) delivered = true;
    }
    if (ctx.overflowed) {
      emit(ctx, {
        nodeId: node.id,
        at: node.label,
        action: "drop",
        detail: `泛洪副本超过 ${MAX_FLOOD_COPIES} 个`,
        ttl: copy.ttl,
      });
      result.dropped ??= {
        at: node.label,
        atId: node.id,
        reason: "broadcast-storm",
        path: copy.path,
      };
      break;
    }
  }
  seqRef.seq = ctx.seq;
  const dropped = result.dropped;
  return {
    delivered,
    reason: delivered ? undefined : (dropped?.reason ?? "no-response"),
    droppedAt: delivered ? undefined : (dropped?.at ?? ""),
    droppedAtId: dropped?.atId,
    path: delivered ? deliveredPath.path : (dropped?.path ?? []),
    flooded,
    eventsUsed: ctx.seq - startSeq,
  };
}

export type ProbeResult = {
  srcId: string;
  dstIp: number;
  request: PacketResult;
  reply: PacketResult | null;
  trace: SimStep[];
};

/**
 * One ping: request leg from src to dstIp, then — when delivered — a
 * reply leg back to the sender's address. Both legs share `state`, so a
 * repeated probe walks a shorter path once switches have learned.
 */
export function runProbe(
  net: NetTopology,
  state: SimState,
  srcNodeId: string,
  dstIpText: string,
  opts: SimOptions = {},
): ProbeResult {
  const trace: SimStep[] = [];
  const seqRef = { seq: 0 };
  const dstIp = parseIp(dstIpText) ?? 0;
  const request = runPacket(net, state, srcNodeId, dstIp, "request", trace, seqRef, opts);
  let reply: PacketResult | null = null;
  if (request.delivered) {
    const dst = request.path.length > 0 ? request.path[request.path.length - 1] : "";
    const dstNode = net.nodes.find((n) => n.label === dst);
    const srcNode = nodeById(net, srcNodeId);
    const srcAddr = srcNode ? endIp(net, srcNode) : null;
    if (dstNode && srcAddr) {
      reply = runPacket(net, state, dstNode.id, srcAddr.ip, "reply", trace, seqRef, opts);
    }
  }
  return { srcId: srcNodeId, dstIp, request, reply, trace };
}
