/**
 * Probe cases and their evaluation. A case is a fresh MAC state, optional
 * unscored warmup probes, then scored probes — this is how "first send
 * floods, second send is unicast" is a single case rather than two.
 *
 * `dstRef` lets a case name a device instead of a literal address, so the
 * same case stays correct under every student's per-user subnet seeds.
 */

import { formatIp, parseIp } from "./addressing.ts";
import {
  DEFAULT_MAX_EVENTS,
  DEFAULT_MAX_HOPS,
  runProbe,
  freshSimState,
  type DropReason,
  type ProbeResult,
  type SimOptions,
} from "./simulate.ts";
import { macFor, nodeById, type NetTopology } from "./topology.ts";

export type NetProbeSpec = {
  src: string;
  /** Literal dotted IP, or "@node-id" to aim at that node's configured address. */
  dst: string;
  expect: NetExpect;
};

export type NetExpect =
  | { kind: "path"; path: string[]; replyPath?: string[] }
  | { kind: "dropped"; at: string; reason: DropReason; leg?: "request" | "reply" }
  | { kind: "flood" }
  | { kind: "unicast" }
  | { kind: "learned"; switch: string; host: string; via: string };

export type NetWarmup = { src: string; dst: string };

export type NetCase = {
  name: string;
  category: string;
  warmup?: NetWarmup[];
  probes: NetProbeSpec[];
};

export type NetCaseResult = {
  name: string;
  category: string;
  passed: boolean;
  /** Chinese one-liner for the failed probe/expectation, empty on pass. */
  detail: string;
  eventsUsed: number;
  probes: ProbeResult[];
};

/** Resolve "@id" targets against the submitted topology; literal IPs pass through. */
export function resolveDst(net: NetTopology, dst: string): string | null {
  if (!dst.startsWith("@")) return parseIp(dst) === null ? null : dst;
  const node = nodeById(net, dst.slice(1));
  if (!node) return null;
  for (const port of node.ports) {
    if (port.ip && parseIp(port.ip) !== null) return port.ip;
  }
  return null;
}

function describeActual(probe: ProbeResult, leg: "request" | "reply"): string {
  const r = leg === "reply" ? probe.reply : probe.request;
  if (!r) return "无应答段";
  if (r.delivered) return `实际按 ${r.path.join("→")} 送达`;
  return `实际在 ${r.droppedAt || "?"} 被丢弃`;
}

function evalProbe(
  net: NetTopology,
  probe: ProbeResult,
  spec: NetProbeSpec,
  macs: Map<string, Map<string, string>>,
): string | null {
  const e = spec.expect;
  switch (e.kind) {
    case "path": {
      if (!probe.request.delivered) {
        return `未送达：${describeActual(probe, "request")}`;
      }
      if (probe.request.path.join("→") !== e.path.join("→")) {
        return `路径应为 ${e.path.join("→")}，${describeActual(probe, "request")}`;
      }
      if (e.replyPath) {
        if (!probe.reply?.delivered) {
          return `回程未送达：${describeActual(probe, "reply")}`;
        }
        if (probe.reply.path.join("→") !== e.replyPath.join("→")) {
          return `回程路径应为 ${e.replyPath.join("→")}，实际 ${probe.reply.path.join("→")}`;
        }
      }
      return null;
    }
    case "dropped": {
      const leg = e.leg ?? "request";
      const r = leg === "reply" ? probe.reply : probe.request;
      if (leg === "reply" && !probe.request.delivered) {
        return `请求段本身未送达，谈不上回程（${describeActual(probe, "request")}）`;
      }
      if (!r) return "应答段不存在";
      if (r.delivered) {
        return `期望在 ${e.at} 丢弃，实际送达 ${r.path.join("→")}`;
      }
      if (r.reason !== e.reason || r.droppedAt !== e.at) {
        return `期望在 ${e.at} 因 ${e.reason} 丢弃，实际在 ${r.droppedAt || "?"} 因 ${r.reason} 丢弃`;
      }
      return null;
    }
    case "flood":
      if (!probe.request.delivered) return `未送达：${describeActual(probe, "request")}`;
      return probe.request.flooded ? null : "首包未经泛洪（MAC 表不该有这条记录）";
    case "unicast":
      if (!probe.request.delivered) return `未送达：${describeActual(probe, "request")}`;
      return probe.request.flooded ? "已学到却仍泛洪" : null;
    case "learned": {
      const table = macs.get(e.switch);
      const mac = macFor(e.host, "eth0");
      const host = nodeById(net, e.host);
      const hostPort = host?.ports.find((p) => p.mac === mac)?.id ?? "eth0";
      const actual = table?.get(macFor(e.host, hostPort));
      if (actual !== e.via) {
        return `${e.switch.toUpperCase()} 应学到 ${e.host.toUpperCase()} 在 ${e.via}，实际 ${actual ?? "没学到"}`;
      }
      return null;
    }
  }
}

export function runCase(net: NetTopology, netCase: NetCase, opts: SimOptions = {}): NetCaseResult {
  const state = freshSimState(net);
  const simOpts: SimOptions = {
    maxHops: opts.maxHops ?? DEFAULT_MAX_HOPS,
    maxEvents: opts.maxEvents ?? DEFAULT_MAX_EVENTS,
  };
  for (const w of netCase.warmup ?? []) {
    const dst = resolveDst(net, w.dst);
    if (dst) runProbe(net, state, w.src, dst, simOpts);
  }
  const probes: ProbeResult[] = [];
  let eventsUsed = 0;
  for (const spec of netCase.probes) {
    const dst = resolveDst(net, spec.dst);
    if (dst === null) {
      return {
        name: netCase.name,
        category: netCase.category,
        passed: false,
        detail: `目标 ${spec.dst} 无法解析`,
        eventsUsed,
        probes,
      };
    }
    const result = runProbe(net, state, spec.src, dst, simOpts);
    probes.push(result);
    eventsUsed += result.trace.length;
    const failure = evalProbe(net, result, spec, state.macs);
    if (failure !== null) {
      return {
        name: netCase.name,
        category: netCase.category,
        passed: false,
        detail: `${spec.src.toUpperCase()}→${dst}：${failure}`,
        eventsUsed,
        probes,
      };
    }
  }
  return {
    name: netCase.name,
    category: netCase.category,
    passed: true,
    detail: "",
    eventsUsed,
    probes,
  };
}

export function runCases(net: NetTopology, cases: readonly NetCase[]): NetCaseResult[] {
  return cases.map((c) => runCase(net, c));
}

/* ---------- structural contract ---------- */

export type NetContractIssue = { node?: string; message: string };

export type NetEdit = {
  /** Host port ip/mask inputs. */
  address: boolean;
  /** Host default-gateway field. */
  gateway: boolean;
  /** Router static-route rows. */
  routes: boolean;
};

/**
 * Structure gate on the raw draft (issue §3.3): fixed topology intact —
 * same node ids/kinds/labels, same link endpoints. Forged extra devices
 * or rewired links are rejected, not silently repaired.
 */
export function validateStructure(draft: NetTopology, prefill: NetTopology): NetContractIssue[] {
  const issues: NetContractIssue[] = [];
  const preNode = new Map(prefill.nodes.map((n) => [n.id, n]));
  if (draft.nodes.length !== prefill.nodes.length) {
    issues.push({ message: "设备数量与场景不符：不能增删设备" });
  }
  for (const node of draft.nodes) {
    const ref = preNode.get(node.id);
    if (!ref) {
      issues.push({ node: node.label, message: `${node.label} 不是场景自带设备` });
      continue;
    }
    if (node.kind !== ref.kind || node.label !== ref.label) {
      issues.push({ node: ref.label, message: `${ref.label} 的名称/类型被改动` });
    }
  }
  const linkKey = (l: NetTopology["links"][number]) =>
    [`${l.a.node}/${l.a.port}`, `${l.b.node}/${l.b.port}`].sort().join("~");
  const preLinks = new Set(prefill.links.map(linkKey));
  if (
    draft.links.length !== prefill.links.length ||
    draft.links.some((l) => !preLinks.has(linkKey(l)))
  ) {
    issues.push({ message: "连线与场景不符：本关拓扑是固定的" });
  }
  return issues;
}

/**
 * Field gate on the merged topology (issue §3.4): required subnets
 * honored, masks contiguous, addresses usable, link ends on the same
 * subnet, route next-hops on-link.
 */
export function validateNet(
  net: NetTopology,
  required: ReadonlyMap<string, string>, // "nodeId/portId" → required CIDR
): NetContractIssue[] {
  const issues: NetContractIssue[] = [];
  // Per-port address rules.
  const seenIps = new Map<number, string>();
  for (const node of net.nodes) {
    for (const port of node.ports) {
      const key = `${node.id}/${port.id}`;
      const want = required.get(key);
      if (port.ip) {
        const ip = parseIp(port.ip);
        if (ip === null) {
          issues.push({
            node: node.label,
            message: `${node.label}·${port.id} 的 IP「${port.ip}」不是合法地址`,
          });
        } else {
          const dup = seenIps.get(ip);
          if (dup) {
            issues.push({
              node: node.label,
              message: `${node.label}·${port.id} 与 ${dup} 地址冲突（${formatIp(ip)}）`,
            });
          } else {
            seenIps.set(ip, `${node.label}·${port.id}`);
          }
        }
      }
      if (!want) continue;
      const [wantNet, wantPrefix] = want.split("/");
      const wantNetIp = parseIp(wantNet);
      const prefix = Number(wantPrefix);
      const ip = port.ip ? parseIp(port.ip) : null;
      const mask = port.mask ? parseIp(port.mask) : null;
      const maskPrefix = port.mask
        ? port.mask.startsWith("/")
          ? Number(port.mask.slice(1))
          : maskPrefixFromIp(mask)
        : null;
      if (ip === null) {
        issues.push({
          node: node.label,
          message: `${node.label}·${port.id} 需要配置 ${want} 内的地址`,
        });
        continue;
      }
      if (maskPrefix === null || !Number.isInteger(maskPrefix)) {
        issues.push({
          node: node.label,
          message: `${node.label}·${port.id} 的掩码「${port.mask ?? ""}」无法识别`,
        });
        continue;
      }
      if (maskPrefix !== prefix) {
        issues.push({
          node: node.label,
          message: `${node.label}·${port.id} 的掩码必须是 /${prefix}（${want}）`,
        });
        continue;
      }
      const maskBits = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      if (wantNetIp !== null && (ip & maskBits) >>> 0 !== wantNetIp >>> 0) {
        issues.push({
          node: node.label,
          message: `${node.label}·${port.id} 的地址必须落在 ${want}`,
        });
        continue;
      }
      if (prefix <= 30) {
        if (ip >>> 0 === (wantNetIp ?? 0) >>> 0) {
          issues.push({
            node: node.label,
            message: `${node.label}·${port.id} 用了网段地址 ${formatIp(ip)}`,
          });
        } else if ((ip | ~maskBits) >>> 0 === ip >>> 0) {
          issues.push({
            node: node.label,
            message: `${node.label}·${port.id} 用了广播地址 ${formatIp(ip)}`,
          });
        }
      }
    }
    if (node.kind === "host" && node.gateway) {
      if (parseIp(node.gateway) === null) {
        issues.push({
          node: node.label,
          message: `${node.label} 的网关「${node.gateway}」不是合法地址`,
        });
      }
    }
  }

  // 3) Link ends that both carry addresses must share a subnet.
  for (const link of net.links) {
    const ends = [link.a, link.b].map((end) => {
      const node = nodeById(net, end.node);
      const port = node?.ports.find((p) => p.id === end.port);
      if (!node || !port?.ip || !port.mask) return null;
      const ip = parseIp(port.ip);
      const prefix = port.mask.startsWith("/")
        ? Number(port.mask.slice(1))
        : maskPrefixFromIp(parseIp(port.mask));
      if (ip === null || prefix === null || !Number.isInteger(prefix)) return null;
      return { ip, prefix, label: `${node.label}·${port.id}` };
    });
    if (ends[0] && ends[1] && ends[0].prefix === ends[1].prefix) {
      const mask = ends[0].prefix === 0 ? 0 : (0xffffffff << (32 - ends[0].prefix)) >>> 0;
      if ((ends[0].ip & mask) >>> 0 !== (ends[1].ip & mask) >>> 0) {
        issues.push({ message: `链路两端不在同一网段：${ends[0].label} ↔ ${ends[1].label}` });
      }
    } else if (ends[0] && ends[1] && ends[0].prefix !== ends[1].prefix) {
      issues.push({ message: `链路两端掩码不一致：${ends[0].label} ↔ ${ends[1].label}` });
    }
  }

  // Route rows: prefix must be real CIDR, next-hop must be on-link.
  for (const node of net.nodes) {
    if (node.kind !== "router") continue;
    const connected: { network: number; prefix: number }[] = [];
    for (const port of node.ports) {
      if (!port.ip || !port.mask) continue;
      const ip = parseIp(port.ip);
      const prefix = port.mask.startsWith("/")
        ? Number(port.mask.slice(1))
        : maskPrefixFromIp(parseIp(port.mask));
      if (ip === null || prefix === null || !Number.isInteger(prefix)) continue;
      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      connected.push({ network: (ip & mask) >>> 0, prefix });
    }
    for (const row of node.routes ?? []) {
      const slash = row.prefix.indexOf("/");
      const rNet = parseIp(slash >= 0 ? row.prefix.slice(0, slash) : row.prefix);
      const rPrefix = slash >= 0 ? Number(row.prefix.slice(slash + 1)) : NaN;
      if (rNet === null || !Number.isInteger(rPrefix) || rPrefix < 0 || rPrefix > 32) {
        issues.push({
          node: node.label,
          message: `${node.label} 的路由前缀「${row.prefix}」不是合法 CIDR`,
        });
        continue;
      }
      const rMask = rPrefix === 0 ? 0 : (0xffffffff << (32 - rPrefix)) >>> 0;
      if ((rNet & rMask) >>> 0 !== rNet >>> 0) {
        issues.push({
          node: node.label,
          message: `${node.label} 的路由前缀「${row.prefix}」主机位未清零`,
        });
        continue;
      }
      const nh = parseIp(row.nextHop);
      if (nh === null) {
        issues.push({
          node: node.label,
          message: `${node.label} 的下一跳「${row.nextHop}」不是合法地址`,
        });
        continue;
      }
      const onLink = connected.some((c) => {
        const mask = c.prefix === 0 ? 0 : (0xffffffff << (32 - c.prefix)) >>> 0;
        return (nh & mask) >>> 0 === c.network;
      });
      if (!onLink) {
        issues.push({
          node: node.label,
          message: `${node.label} 的下一跳 ${formatIp(nh)} 不在任何直连网段`,
        });
      }
    }
  }
  return issues;
}

function maskPrefixFromIp(mask: number | null): number | null {
  if (mask === null) return null;
  const inv = ~mask >>> 0;
  if (inv === 0) return 32;
  if ((inv & (inv + 1)) !== 0) return null;
  return 32 - Math.log2(inv + 1);
}

/** Merge the student's editable fields onto the fixed prefill skeleton. */
export function applyEdit(prefill: NetTopology, draft: NetTopology, edit: NetEdit): NetTopology {
  const draftNode = new Map(draft.nodes.map((n) => [n.id, n]));
  const nodes = prefill.nodes.map((ref) => {
    const d = draftNode.get(ref.id);
    if (!d) return ref;
    const node: typeof ref = JSON.parse(JSON.stringify(ref)) as typeof ref;
    if (node.kind === "host") {
      if (edit.address) {
        node.ports = node.ports.map((p) => {
          const dp = d.ports.find((x) => x.id === p.id);
          if (!dp) return p;
          const next = { ...p };
          if (dp.ip !== undefined) next.ip = dp.ip;
          if (dp.mask !== undefined) next.mask = dp.mask;
          if (!dp.ip) delete next.ip;
          if (!dp.mask) delete next.mask;
          return next;
        });
      }
      if (edit.gateway) node.gateway = d.gateway;
    }
    if (node.kind === "router" && edit.routes) {
      node.routes = d.routes ? d.routes.map((r) => ({ ...r })) : [];
    }
    return node;
  });
  return { nodes, links: prefill.links.map((l) => ({ a: { ...l.a }, b: { ...l.b } })) };
}
