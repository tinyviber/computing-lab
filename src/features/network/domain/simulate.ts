/**
 * Bounded packet-forwarding simulator for the network lab.
 *
 * One send = one packet family. The source host decides its next hop
 * (same subnet → direct, otherwise the configured gateway); switches
 * learn source MACs and forward by table hit or flood; routers check
 * directly-connected subnets first, then longest-prefix-match static
 * routes, then the default route. Everything is deterministic:
 * arrivals are processed in (hop, insertion-seq) order and flood order
 * follows the interface list.
 *
 * Bounds (issue #56 §3.5): ≤16 hops per packet (TTL), ≤512 processed
 * events per send, ≤8 flood-emitted copies per send, MAC tables ≤32
 * entries. A copy that returns to a switch it already crossed dies as
 * "broadcast-storm" — loops are a lesson, not a hang.
 *
 * ARP is deliberately not modeled: resolving a next-hop IP to its MAC
 * is recorded in the decision note ("查邻居表") without emitting extra
 * packets.
 */

import {
  describeSubnet,
  formatIpv4,
  macFor,
  networkOf,
  parseIpv4,
  sameSubnet,
} from "./addressing.ts";
import {
  MAX_MAC,
  NODE_IFACES,
  nodeById,
  peerOf,
  sanitizeTopology,
  type LinkEnd,
  type NetTopology,
} from "./model.ts";

export const MAX_EVENTS = 512;
export const MAX_HOPS = 16;
export const MAX_COPIES = 8;

export type DropReason =
  /** Frame reached a device that does not claim it (flood fallout). */
  | "absorbed"
  /** A copy re-entered a switch it already crossed, or flood copy cap hit. */
  | "broadcast-storm"
  /** The send never resolved before the event budget ran out. */
  | "event-limit"
  /** Configured gateway sits outside the host's own subnet. */
  | "gateway-offlink"
  /** Every copy died without a terminal reason (dead-end wiring). */
  | "lost"
  /** Source interface has no address. */
  | "no-address"
  /** Destination is off-subnet and no gateway is configured. */
  | "no-gateway"
  /** The interface the decision wants is not wired. */
  | "no-link"
  /** Router has no connected/static/default match for the destination. */
  | "no-route"
  /** The next-hop (or destination) IP is owned by no interface. */
  | "no-such-host"
  /** TTL hit zero — the packet is treated as looping. */
  | "ttl-exceeded";

export type HopOut = LinkEnd;

export type TraceRow = {
  step: number;
  node: string;
  /** Interface the copy arrived on ("" for the source's send decision). */
  inIface: string;
  action: "send" | "forward" | "flood" | "deliver";
  /** Next-hop endpoints the node emitted onto. */
  outs: HopOut[];
  ttl: number;
  note: string;
  /** For switches: the MAC table after this hop's learn. */
  after?: { macTable: Record<string, string> };
};

export type DropRow = {
  step: number;
  node: string;
  iface: string;
  reason: DropReason;
  ttl: number;
  note: string;
};

export type SimOutcome =
  | { kind: "delivered"; at: number; path: string[] }
  | { kind: "dropped"; at: number; node: string; reason: DropReason; path: string[] };

export type MacTables = Record<string, Record<string, string>>;

export type SimRun = {
  outcome: SimOutcome;
  /** "budget" = capped mid-flight; "done" = every copy resolved. */
  reason: "done" | "budget";
  trace: TraceRow[];
  drops: DropRow[];
  /** Learned MAC tables at end of run — feeds the next send's warmup. */
  macTables: MacTables;
  eventsUsed: number;
};

type Pkt = {
  dstIp: number;
  dstMac: string;
  srcMac: string;
  ttl: number;
  path: string[];
  seenSwitches: Set<string>;
};

type QueueItem = { at: number; seq: number; to: LinkEnd; pkt: Pkt };

export function simulate(
  topology: NetTopology,
  srcId: string,
  dstIpText: string,
  options?: { maxHops?: number; maxEvents?: number; initMacTables?: MacTables },
): SimRun {
  const topo = sanitizeTopology(topology);
  const maxHops = Math.max(1, Math.min(MAX_HOPS, options?.maxHops ?? MAX_HOPS));
  const maxEvents = Math.max(1, Math.min(MAX_EVENTS, options?.maxEvents ?? MAX_EVENTS));

  // Every addressed interface claims its IP — the "邻居表" that stands
  // in for ARP.
  const owners = new Map<number, LinkEnd>();
  for (const node of topo.nodes) {
    for (const [iface, addr] of Object.entries(node.addresses)) {
      const ip = parseIpv4(addr.ip);
      if (ip !== null) owners.set(ip, { node: node.id, iface });
    }
  }

  const macTables: MacTables = {};
  for (const node of topo.nodes) {
    if (node.kind === "switch") macTables[node.id] = {};
  }
  for (const [node, table] of Object.entries(options?.initMacTables ?? {})) {
    if (macTables[node]) macTables[node] = { ...table };
  }

  const trace: TraceRow[] = [];
  const drops: DropRow[] = [];
  let step = 0;
  let outcome: SimOutcome | null = null;
  let budgetHit = false;
  let emittedCopies = 0;

  const queue: QueueItem[] = [];
  let seq = 0;
  const push = (at: number, pkt: Pkt, to: LinkEnd) => {
    queue.push({ at, seq, to, pkt });
    seq += 1;
  };
  const pop = (): QueueItem | undefined => {
    let best = 0;
    for (let i = 1; i < queue.length; i += 1) {
      const a = queue[i];
      const b = queue[best];
      if (a.at < b.at || (a.at === b.at && a.seq < b.seq)) best = i;
    }
    return queue.splice(best, 1)[0];
  };

  const dstIp = parseIpv4(dstIpText);
  const src = nodeById(topo, srcId);

  const dropNow = (node: string, iface: string, reason: DropReason, ttl: number, note: string) => {
    drops.push({ step, node, iface, reason, ttl, note });
    if (!outcome && reason !== "absorbed") {
      outcome = {
        kind: "dropped",
        at: step,
        node,
        reason,
        path: [...(pendingPath ?? [srcId])],
      };
    }
  };

  // The dying copy's path rides along for the counterexample.
  let pendingPath: string[] | null = null;

  const deliverNow = (node: string, iface: string, pkt: Pkt, note: string) => {
    trace.push({
      step,
      node,
      inIface: iface,
      action: "deliver",
      outs: [],
      ttl: pkt.ttl,
      note,
    });
    if (!outcome) outcome = { kind: "delivered", at: step, path: pkt.path };
  };

  // ---- source decision -------------------------------------------------
  if (!src || src.kind !== "host" || dstIp === null) {
    drops.push({
      step,
      node: srcId,
      iface: "",
      reason: "no-such-host",
      ttl: maxHops,
      note: "源主机或目的地址无效",
    });
    outcome = { kind: "dropped", at: 0, node: srcId, reason: "no-such-host", path: [srcId] };
  } else {
    const srcIface = NODE_IFACES.host[0];
    const srcAddr = src.addresses[srcIface];
    const srcIp = srcAddr ? parseIpv4(srcAddr.ip) : null;
    let note = "";
    let nextHop: number | null = null;
    let failed: { reason: DropReason; note: string } | null = null;
    if (!srcAddr || srcIp === null) {
      failed = { reason: "no-address", note: "eth0 还没有配 IP 地址" };
    } else if (dstIp === srcIp) {
      nextHop = dstIp;
    } else if (sameSubnet(dstIp, srcIp, srcAddr.prefix)) {
      nextHop = dstIp;
      note = `${formatIpv4(dstIp)} 在同一网段 ${describeSubnet(srcIp, srcAddr.prefix)}，直接投递`;
    } else {
      const gw = parseIpv4(src.gateway ?? "");
      if (src.gateway === undefined || gw === null) {
        failed = { reason: "no-gateway", note: "目的不在本网段，也没有配默认网关" };
      } else if (!sameSubnet(gw, srcIp, srcAddr.prefix)) {
        failed = {
          reason: "gateway-offlink",
          note: `默认网关 ${formatIpv4(gw)} 不在本网段 ${describeSubnet(srcIp, srcAddr.prefix)} 里`,
        };
      } else {
        nextHop = gw;
        note = `${formatIpv4(dstIp)} 跨网段，交给默认网关 ${formatIpv4(gw)}`;
      }
    }

    if (failed) {
      dropNow(src.id, srcIface, failed.reason, maxHops, failed.note);
      outcome = {
        kind: "dropped",
        at: 0,
        node: src.id,
        reason: failed.reason,
        path: [src.id],
      };
    } else if (nextHop !== null) {
      const owner = owners.get(nextHop);
      if (!owner) {
        dropNow(
          src.id,
          srcIface,
          "no-such-host",
          maxHops,
          `查邻居表：${formatIpv4(nextHop)} 无人应答`,
        );
      } else {
        const peer = peerOf(topo, src.id, srcIface);
        if (!peer) {
          dropNow(src.id, srcIface, "no-link", maxHops, "eth0 还没有接线");
        } else {
          const pkt: Pkt = {
            dstIp,
            dstMac: macFor(owner.node, owner.iface),
            srcMac: macFor(src.id, srcIface),
            ttl: maxHops,
            path: [src.id],
            seenSwitches: new Set(),
          };
          const lookup =
            nextHop === dstIp
              ? note || "直接投递"
              : `${note}（查邻居表：${formatIpv4(nextHop)} → ${owner.node}）`;
          trace.push({
            step,
            node: src.id,
            inIface: srcIface,
            action: "send",
            outs: [peer],
            ttl: pkt.ttl,
            note: lookup,
          });
          push(1, pkt, peer);
        }
      }
    }
  }

  // ---- hop loop ---------------------------------------------------------
  let item: QueueItem | undefined;
  while ((item = pop()) !== undefined) {
    step += 1;
    if (step > maxEvents) {
      drops.push({
        step,
        node: item.to.node,
        iface: item.to.iface,
        reason: "event-limit",
        ttl: item.pkt.ttl,
        note: "超出事件预算",
      });
      budgetHit = true;
      if (!outcome) {
        outcome = {
          kind: "dropped",
          at: step,
          node: item.to.node,
          reason: "event-limit",
          path: item.pkt.path,
        };
      }
      break;
    }

    const node = nodeById(topo, item.to.node);
    if (!node) continue;
    const pkt = item.pkt;
    const hopAt = item.at;
    const inIface = item.to.iface;
    const path = [...pkt.path, node.id];
    pendingPath = path;

    if (node.kind === "host") {
      const myMac = macFor(node.id, item.to.iface);
      const myAddr = node.addresses[item.to.iface];
      const myIp = myAddr ? parseIpv4(myAddr.ip) : null;
      if (pkt.dstMac !== myMac) {
        drops.push({
          step,
          node: node.id,
          iface: item.to.iface,
          reason: "absorbed",
          ttl: pkt.ttl,
          note: "帧的目的 MAC 不是自己，网卡丢弃",
        });
      } else if (myIp !== null && pkt.dstIp === myIp) {
        deliverNow(node.id, item.to.iface, { ...pkt, path }, `送达 ${node.label || node.id}`);
      } else {
        drops.push({
          step,
          node: node.id,
          iface: item.to.iface,
          reason: "absorbed",
          ttl: pkt.ttl,
          note: "目的 MAC 是自己但 IP 不是，主机不转发",
        });
      }
      continue;
    }

    if (node.kind === "switch") {
      const table = macTables[node.id];
      const srcMac = pkt.srcMac;
      let learnNote = "";
      if (table[srcMac] !== item.to.iface) {
        if (table[srcMac] === undefined && Object.keys(table).length >= MAX_MAC) {
          learnNote = "MAC 表已满，无法再学";
        } else {
          table[srcMac] = item.to.iface;
          learnNote = `学到 ${srcMac} → ${item.to.iface}`;
        }
      }
      if (pkt.seenSwitches.has(node.id)) {
        drops.push({
          step,
          node: node.id,
          iface: item.to.iface,
          reason: "broadcast-storm",
          ttl: pkt.ttl,
          note: "分组兜了一圈又回到这台交换机——二层环路",
        });
        continue;
      }
      const out = table[pkt.dstMac];
      const emitTo = (ports: LinkEnd[]) => {
        const outs: LinkEnd[] = [];
        for (const port of ports) {
          const copy: Pkt = {
            ...pkt,
            path,
            seenSwitches: new Set([...pkt.seenSwitches, node.id]),
          };
          push(hopAt + 1, copy, port);
          outs.push(port);
        }
        return outs;
      };
      if (out !== undefined) {
        if (out === item.to.iface) {
          drops.push({
            step,
            node: node.id,
            iface: item.to.iface,
            reason: "absorbed",
            ttl: pkt.ttl,
            note: "MAC 表指向的端口就是入端口，丢弃",
          });
          continue;
        }
        const peer = peerOf(topo, node.id, out);
        if (!peer) {
          drops.push({
            step,
            node: node.id,
            iface: item.to.iface,
            reason: "absorbed",
            ttl: pkt.ttl,
            note: `出端口 ${out} 没有接线`,
          });
          continue;
        }
        const outs = emitTo([peer]);
        trace.push({
          step,
          node: node.id,
          inIface: item.to.iface,
          action: "forward",
          outs,
          ttl: pkt.ttl,
          note: `${learnNote ? `${learnNote}，` : ""}查表命中 → ${out}`,
          after: { macTable: { ...table } },
        });
      } else {
        const outs = NODE_IFACES.switch
          .filter((iface) => iface !== inIface)
          .map((iface) => ({ node: node.id, iface }))
          .map((end) => peerOf(topo, end.node, end.iface))
          .filter((p): p is LinkEnd => p !== null);
        if (outs.length === 0) {
          drops.push({
            step,
            node: node.id,
            iface: item.to.iface,
            reason: "absorbed",
            ttl: pkt.ttl,
            note: "MAC 表未命中，也没有别的端口可泛洪",
          });
          continue;
        }
        if (emittedCopies + outs.length > MAX_COPIES) {
          drops.push({
            step,
            node: node.id,
            iface: item.to.iface,
            reason: "broadcast-storm",
            ttl: pkt.ttl,
            note: `泛洪复制超过 ${MAX_COPIES} 份上限，按广播风暴丢弃`,
          });
          continue;
        }
        emittedCopies += outs.length;
        const emitted = emitTo(outs);
        trace.push({
          step,
          node: node.id,
          inIface: item.to.iface,
          action: "flood",
          outs: emitted,
          ttl: pkt.ttl,
          note: `${learnNote ? `${learnNote}，` : ""}MAC 表未命中，泛洪到 ${outs.length} 个端口`,
          after: { macTable: { ...table } },
        });
      }
      continue;
    }

    // router
    const myMac = macFor(node.id, item.to.iface);
    if (pkt.dstMac !== myMac) {
      drops.push({
        step,
        node: node.id,
        iface: item.to.iface,
        reason: "absorbed",
        ttl: pkt.ttl,
        note: "帧的目的 MAC 不是这个接口",
      });
      continue;
    }
    const selfHit = Object.values(node.addresses).some((addr) => parseIpv4(addr.ip) === pkt.dstIp);
    if (selfHit) {
      deliverNow(node.id, item.to.iface, { ...pkt, path }, "目的地址是本路由器的接口，收下");
      continue;
    }

    // Route decision: connected subnets → static routes (longest prefix,
    // dead next-hops skipped) → drop.
    let outIface: string | null = null;
    let nextHop: number | null = null;
    let via = "";
    for (const iface of NODE_IFACES.router) {
      const addr = node.addresses[iface];
      if (!addr) continue;
      const ifaceIp = parseIpv4(addr.ip)!;
      if (sameSubnet(pkt.dstIp, ifaceIp, addr.prefix)) {
        outIface = iface;
        nextHop = pkt.dstIp;
        via = `直连网段 ${describeSubnet(ifaceIp, addr.prefix)}`;
        break;
      }
    }
    if (outIface === null) {
      const routes = [...node.routes].sort((a, b) => b.prefix - a.prefix);
      for (const route of routes) {
        const dest = parseIpv4(route.dest)!;
        if (networkOf(pkt.dstIp, route.prefix) !== dest) continue;
        const hop = parseIpv4(route.nextHop)!;
        const exit = NODE_IFACES.router.find((iface) => {
          const addr = node.addresses[iface];
          return (
            addr !== undefined &&
            networkOf(hop, addr.prefix) === networkOf(parseIpv4(addr.ip)!, addr.prefix)
          );
        });
        if (!exit) continue; // next hop unreachable — this route is dead
        outIface = exit;
        nextHop = hop;
        via = route.prefix === 0 ? "默认路由 0.0.0.0/0" : `静态路由 ${route.dest}/${route.prefix}`;
        break;
      }
    }
    if (outIface === null || nextHop === null) {
      dropNow(node.id, item.to.iface, "no-route", pkt.ttl, "直连、静态、默认路由都没有匹配项");
      continue;
    }
    const owner = owners.get(nextHop);
    if (!owner) {
      dropNow(
        node.id,
        item.to.iface,
        "no-such-host",
        pkt.ttl,
        `下一跳 ${formatIpv4(nextHop)} 没有设备应答`,
      );
      continue;
    }
    const peer = peerOf(topo, node.id, outIface);
    if (!peer) {
      dropNow(node.id, outIface, "no-link", pkt.ttl, `${outIface} 配了地址但没有接线`);
      continue;
    }
    const ttl = pkt.ttl - 1;
    if (ttl <= 0) {
      dropNow(node.id, item.to.iface, "ttl-exceeded", 0, "TTL 耗尽，分组按环路丢弃");
      continue;
    }
    const forwarded: Pkt = {
      dstIp: pkt.dstIp,
      dstMac: macFor(owner.node, owner.iface),
      srcMac: macFor(node.id, outIface),
      ttl,
      path,
      seenSwitches: new Set(pkt.seenSwitches),
    };
    trace.push({
      step,
      node: node.id,
      inIface: item.to.iface,
      action: "forward",
      outs: [peer],
      ttl,
      note: `${via} → ${outIface}（下一跳 ${formatIpv4(nextHop)}）`,
    });
    push(hopAt + 1, forwarded, peer);
  }

  if (!outcome) {
    // Everything resolved without a terminal drop: the copies all died
    // as absorbs (dead-end wiring).
    const last = drops[drops.length - 1];
    outcome = {
      kind: "dropped",
      at: last?.step ?? 0,
      node: last?.node ?? srcId,
      reason: "lost",
      path: pendingPath ?? [srcId],
    };
  }

  return {
    outcome,
    reason: budgetHit ? "budget" : "done",
    trace,
    drops,
    macTables,
    eventsUsed: step,
  };
}

/** Human text for a drop reason — shown in the trace and the test panel. */
export const DROP_TEXT: Record<DropReason, string> = {
  absorbed: "设备收下后发现不是给自己的",
  "broadcast-storm": "二层环路：分组在交换机间打转",
  "event-limit": "超出事件预算",
  "gateway-offlink": "默认网关不在本网段",
  lost: "没有设备认领这个分组",
  "no-address": "接口还没配 IP",
  "no-gateway": "跨网段但没有默认网关",
  "no-link": "接口没有接线",
  "no-route": "路由表没有匹配项",
  "no-such-host": "目标地址没有设备应答",
  "ttl-exceeded": "TTL 耗尽（疑似环路）",
};
