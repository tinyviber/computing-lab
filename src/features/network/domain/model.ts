/**
 * Network lab topology model: the student's "draft" is a small wired
 * graph — hosts, one or two switches, and routers joined by undirected
 * links between named interfaces.
 *
 * Design rules that fall out of the model and are enforced here:
 * - A link binds two interfaces, one link per interface. Reusing a
 *   wired interface replaces its previous link (UI and `sanitizeTopology`
 *   agree), so cabling is always legal.
 * - `fixed` nodes are stage furniture: prefill devices scenarios can
 *   reference by id. Students can relabel them but not delete them.
 * - Addresses, the host gateway, and route rows are parsed and
 *   normalized at the domain boundary — UI and server never trust the
 *   wire shape. Malformed fields drop to "unset" rather than surviving
 *   as garbage.
 * - `findContractIssues` reports semantic misconfiguration with Chinese
 *   explanations (network/broadcast addresses, duplicate IPs, route
 *   next-hops outside every connected subnet, wired interfaces without
 *   an address). The judge fails fast on these; the page lists them so
 *   the student fixes structure before debugging packet flow.
 */

import {
  describeSubnet,
  isHostAddress,
  networkOf,
  parseIpv4,
  parsePrefix,
  formatIpv4,
} from "./addressing.ts";

export type NetNodeKind = "host" | "switch" | "router";

export const NODE_KINDS: readonly NetNodeKind[] = ["host", "switch", "router"];

export const KIND_LABEL: Record<NetNodeKind, string> = {
  host: "主机",
  switch: "交换机",
  router: "路由器",
};

/** Wireable interfaces per kind; switch ports are L2-only (no address). */
export const NODE_IFACES: Record<NetNodeKind, readonly string[]> = {
  host: ["eth0"],
  switch: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
  router: ["eth0", "eth1", "eth2", "eth3"],
};

export const MAX_NODES = 12;
export const MAX_LINKS = 16;
export const MAX_ROUTES = 8;
export const MAX_MAC = 32;
export const GRID_COLS = 7;
export const GRID_ROWS = 3;

/** A normalized interface address: dotted-quad ip + prefix length. */
export type NetAddress = { ip: string; prefix: number };

/** A static route row: `dest/prefix` via `nextHop` (both normalized). */
export type NetRoute = { dest: string; prefix: number; nextHop: string };

export type NetNode = {
  id: string;
  kind: NetNodeKind;
  label: string;
  x: number;
  y: number;
  /** Stage furniture: may not be deleted (this lab pre-fills every node). */
  fixed: boolean;
  /** iface id → address; only host/router interfaces carry one. */
  addresses: Record<string, NetAddress>;
  /** Host only: default gateway as a plain ipv4 literal. */
  gateway?: string;
  /** Router only: static route table. */
  routes: NetRoute[];
};

export type LinkEnd = { node: string; iface: string };

/** Undirected link between two interfaces. */
export type NetLink = { a: LinkEnd; b: LinkEnd };

export type NetTopology = {
  nodes: NetNode[];
  links: NetLink[];
};

export type NetDraft = NetTopology;

const ID_PATTERN = /^[a-zA-Z0-9_-]{1,16}$/;
const MAX_LABEL = 24;

function sanitizeAddress(value: unknown): NetAddress | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const candidate = value as Record<string, unknown>;
  const ip = parseIpv4(candidate.ip);
  const prefix = parsePrefix(candidate.prefix);
  if (ip === null || prefix === null) return undefined;
  return { ip: formatIpv4(ip), prefix };
}

function sanitizeRoutes(value: unknown): NetRoute[] {
  if (!Array.isArray(value)) return [];
  const routes: NetRoute[] = [];
  for (const raw of value) {
    if (routes.length >= MAX_ROUTES) break;
    if (typeof raw !== "object" || raw === null) continue;
    const candidate = raw as Record<string, unknown>;
    // Accept "10.0.3.0/24" in `dest` or a separate `prefix` field.
    const destText = typeof candidate.dest === "string" ? candidate.dest : "";
    const [destIpText, inlinePrefix] = destText.split("/", 2);
    const dest = parseIpv4(destIpText);
    const prefix = parsePrefix(inlinePrefix) ?? parsePrefix(candidate.prefix) ?? null;
    const nextHop = parseIpv4(candidate.nextHop);
    if (dest === null || prefix === null || nextHop === null) continue;
    routes.push({
      dest: formatIpv4(networkOf(dest, prefix)),
      prefix,
      nextHop: formatIpv4(nextHop),
    });
  }
  return routes;
}

/** Order-insensitive key so {a,b} and {b,a} dedupe to one link. */
function linkEndsKey(a: LinkEnd, b: LinkEnd): string[] {
  const ka = `${a.node}|${a.iface}`;
  const kb = `${b.node}|${b.iface}`;
  return ka <= kb ? [ka, kb] : [kb, ka];
}

function sanitizeEnd(value: unknown): LinkEnd | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  const node = typeof candidate.node === "string" ? candidate.node : "";
  const iface = typeof candidate.iface === "string" ? candidate.iface : "";
  if (!ID_PATTERN.test(node) || !ID_PATTERN.test(iface)) return null;
  return { node, iface };
}

/**
 * Normalize any incoming shape into a valid topology: dedupe node ids,
 * clamp grid positions, drop invalid addresses/routes/links and collapse
 * re-wired interfaces to their last link.
 */
export function sanitizeTopology(draft: unknown): NetTopology {
  const source = (typeof draft === "object" && draft !== null ? draft : {}) as {
    nodes?: unknown;
    links?: unknown;
  };
  const nodes: NetNode[] = [];
  const seen = new Set<string>();
  if (Array.isArray(source.nodes)) {
    for (const raw of source.nodes) {
      if (nodes.length >= MAX_NODES) break;
      if (typeof raw !== "object" || raw === null) continue;
      const candidate = raw as Record<string, unknown>;
      const id = typeof candidate.id === "string" ? candidate.id : "";
      if (!ID_PATTERN.test(id) || seen.has(id)) continue;
      const kind = NODE_KINDS.includes(candidate.kind as NetNodeKind)
        ? (candidate.kind as NetNodeKind)
        : null;
      if (!kind) continue;
      seen.add(id);
      const label =
        typeof candidate.label === "string" && candidate.label.trim()
          ? candidate.label.trim().slice(0, MAX_LABEL)
          : id;

      const addresses: Record<string, NetAddress> = {};
      if (kind !== "switch" && typeof candidate.addresses === "object" && candidate.addresses) {
        for (const iface of NODE_IFACES[kind]) {
          const addr = sanitizeAddress((candidate.addresses as Record<string, unknown>)[iface]);
          if (addr) addresses[iface] = addr;
        }
      }

      const gateway = kind === "host" ? parseIpv4(candidate.gateway) : null;

      nodes.push({
        id,
        kind,
        label,
        x: clampInt(candidate.x, 0, GRID_COLS - 1),
        y: clampInt(candidate.y, 0, GRID_ROWS - 1),
        fixed: candidate.fixed === true,
        addresses,
        gateway: gateway === null ? undefined : formatIpv4(gateway),
        routes: kind === "router" ? sanitizeRoutes(candidate.routes) : [],
      });
    }
  }

  const ids = new Set(nodes.map((n) => n.id));
  const ifacesOf = new Map(nodes.map((n) => [n.id, NODE_IFACES[n.kind]] as const));
  const links: NetLink[] = [];
  const linkSeen = new Set<string>();
  const usedIfaces = new Set<string>();
  if (Array.isArray(source.links)) {
    for (const raw of source.links) {
      if (links.length >= MAX_LINKS) break;
      if (typeof raw !== "object" || raw === null) continue;
      const candidate = raw as Record<string, unknown>;
      const a = sanitizeEnd(candidate.a);
      const b = sanitizeEnd(candidate.b);
      if (!a || !b || a.node === b.node) continue;
      if (!ids.has(a.node) || !ids.has(b.node)) continue;
      if (!ifacesOf.get(a.node)!.includes(a.iface)) continue;
      if (!ifacesOf.get(b.node)!.includes(b.iface)) continue;
      const key = linkEndsKey(a, b).join("<>");
      if (linkSeen.has(key)) continue;
      linkSeen.add(key);
      // One wire per interface: a re-wired end replaces its old link.
      for (const end of [a, b]) {
        const endKey = `${end.node}|${end.iface}`;
        if (usedIfaces.has(endKey)) {
          const idx = links.findIndex(
            (l) =>
              (l.a.node === end.node && l.a.iface === end.iface) ||
              (l.b.node === end.node && l.b.iface === end.iface),
          );
          if (idx >= 0) links.splice(idx, 1);
        }
        usedIfaces.add(endKey);
      }
      links.push({ a, b });
    }
  }
  return { nodes, links };
}

function clampInt(value: unknown, min: number, max: number): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : min;
  return Math.min(max, Math.max(min, n));
}

/**
 * Wire-trust defense (mirrors is-sim's `enforcePrefillParams`): the stage
 * declares which fields are editable; every other field is re-asserted
 * from the stage prefill before judging. A crafted draft can therefore
 * open a student to failure, never to a free pass.
 *
 * Non-editable fields restored from prefill: `addresses` (cap "address"),
 * `gateway` ("gateway"), `routes` ("routes"), `label` ("label"), and the
 * whole `links` set ("wire"). kind/position/fixed are always stage
 * furniture. Nodes not present in the prefill are dropped — the lab has
 * no device palette.
 */
export function enforceStageContract(
  draft: NetTopology,
  prefill: NetTopology,
  editable: readonly string[],
): NetTopology {
  const open = new Set(editable);
  const prefillLinks = prefill.links.map((l) => ({ a: { ...l.a }, b: { ...l.b } }));
  return {
    nodes: prefill.nodes.map((fixedNode) => {
      const student = draft.nodes.find((n) => n.id === fixedNode.id);
      if (!student) {
        return {
          ...fixedNode,
          addresses: cloneAddresses(fixedNode),
          routes: fixedNode.routes.map((r) => ({ ...r })),
        };
      }
      return {
        ...fixedNode,
        label: open.has("label") ? student.label : fixedNode.label,
        addresses: open.has("address") ? cloneAddresses(student) : cloneAddresses(fixedNode),
        gateway: open.has("gateway") ? student.gateway : fixedNode.gateway,
        routes: open.has("routes")
          ? student.routes.map((r) => ({ ...r }))
          : fixedNode.routes.map((r) => ({ ...r })),
      };
    }),
    links: open.has("wire")
      ? draft.links.map((l) => ({ a: { ...l.a }, b: { ...l.b } }))
      : prefillLinks,
  };
}

const cloneAddresses = (node: NetNode): Record<string, NetAddress> =>
  Object.fromEntries(Object.entries(node.addresses).map(([iface, a]) => [iface, { ...a }]));

export function nodeById(topology: NetTopology, id: string): NetNode | null {
  return topology.nodes.find((n) => n.id === id) ?? null;
}

/** The far end of the link attached to `{node, iface}`, or null when unwired. */
export function peerOf(topology: NetTopology, node: string, iface: string): LinkEnd | null {
  for (const link of topology.links) {
    if (link.a.node === node && link.a.iface === iface) return link.b;
    if (link.b.node === node && link.b.iface === iface) return link.a;
  }
  return null;
}

/** Every link incident to a node. */
export function linksOf(topology: NetTopology, nodeId: string): NetLink[] {
  return topology.links.filter((l) => l.a.node === nodeId || l.b.node === nodeId);
}

const nameOf = (node: NetNode) => node.label || node.id;

/**
 * Semantic misconfiguration report. These are the errors a student
 * should never have to infer from a packet trace — the judge fails fast
 * on them and the page lists them verbatim.
 */
export function findContractIssues(topology: NetTopology): string[] {
  const issues: string[] = [];
  const ipOwner = new Map<number, string>();

  for (const node of topology.nodes) {
    for (const [iface, addr] of Object.entries(node.addresses)) {
      const ip = parseIpv4(addr.ip);
      if (ip === null) {
        issues.push(`${nameOf(node)} 的 ${iface} 地址无法解析`);
        continue;
      }
      if (!isHostAddress(ip, addr.prefix)) {
        issues.push(`${nameOf(node)} 的 ${iface} 配成了网络号或广播地址`);
      }
      const owner = ipOwner.get(ip);
      if (owner) issues.push(`${nameOf(node)} 的 ${iface} 与 ${owner} 撞了同一个 IP`);
      else ipOwner.set(ip, `${nameOf(node)}·${iface}`);
    }

    if (node.kind === "host") {
      const wired = linksOf(topology, node.id).length > 0;
      if (!node.addresses.eth0) {
        issues.push(`${nameOf(node)} 还没有给 eth0 配地址`);
      } else if (!wired) {
        issues.push(`${nameOf(node)} 还没有接线`);
      }
      const gw = parseIpv4(node.gateway ?? "");
      if (node.gateway !== undefined && gw === null) {
        issues.push(`${nameOf(node)} 的默认网关地址无效`);
      }
    }

    if (node.kind === "router") {
      const connected = NODE_IFACES.router
        .map((iface) => node.addresses[iface])
        .filter((a): a is NetAddress => a !== undefined)
        .map((a) => ({ ip: parseIpv4(a.ip)!, prefix: a.prefix }));
      for (const route of node.routes) {
        const nextHop = parseIpv4(route.nextHop)!;
        const reachable = connected.some(
          (sub) => networkOf(nextHop, sub.prefix) === networkOf(sub.ip, sub.prefix),
        );
        if (!reachable) {
          issues.push(
            `${nameOf(node)} 到 ${route.dest}/${route.prefix} 的下一跳 ${route.nextHop} 不在任何直连网段`,
          );
        }
      }
    }
  }

  // A link joining two L3 interfaces is a subnet contract: both ends
  // must live in the same subnet for either to treat the other as a
  // direct neighbour.
  for (const link of topology.links) {
    const aNode = nodeById(topology, link.a.node);
    const bNode = nodeById(topology, link.b.node);
    if (!aNode || !bNode) continue;
    const aAddr = aNode.addresses[link.a.iface];
    const bAddr = bNode.addresses[link.b.iface];
    if (!aAddr || !bAddr) continue;
    const aIp = parseIpv4(aAddr.ip)!;
    const bIp = parseIpv4(bAddr.ip)!;
    const same =
      networkOf(aIp, aAddr.prefix) === networkOf(bIp, aAddr.prefix) &&
      networkOf(aIp, bAddr.prefix) === networkOf(bIp, bAddr.prefix);
    if (!same) {
      issues.push(
        `${nameOf(aNode)} 与 ${nameOf(bNode)} 的链路两端不在同一网段（${describeSubnet(aIp, aAddr.prefix)} ↔ ${describeSubnet(bIp, bAddr.prefix)}）`,
      );
    }
  }

  return issues;
}
