/**
 * The network lab topology model: hosts, switches, and routers wired by
 * port-to-port links. MVP topologies are fixed per stage — nodes and
 * links come from the stage prefill and students only edit addressing,
 * gateways, and route rows — but the model keeps the full graph shape so
 * later stages can open wiring without a format change.
 */

import { formatIp, parseIp, parseMask } from "./addressing.ts";
import { fnv1a } from "./rng.ts";

export type NetNodeKind = "host" | "switch" | "router";

export type NetPort = {
  /** Stable within the node: "eth0" on hosts, "p1".."p8" on switches, "g0".."g3" on routers. */
  id: string;
  /** Synthetic deterministic MAC; switches have none (they are transparent forwarders). */
  mac?: string;
  /** Raw spellings the student typed — parsed/clamped at the domain boundary. */
  ip?: string;
  mask?: string;
};

export type NetRouteRow = {
  /** CIDR text like "10.7.2.0/24"; "0.0.0.0/0" is the default route. */
  prefix: string;
  /** Next-hop IP text; must sit in one of this router's connected subnets. */
  nextHop: string;
};

export type NetNode = {
  id: string;
  label: string;
  kind: NetNodeKind;
  x: number;
  y: number;
  /** Part of the stage contract: the student cannot add/remove/relabel it. */
  fixed?: boolean;
  ports: NetPort[];
  /** Hosts only: default-gateway IP text. */
  gateway?: string;
  /** Routers only: editable static routes. */
  routes?: NetRouteRow[];
};

export type NetLink = {
  a: { node: string; port: string };
  b: { node: string; port: string };
};

export type NetTopology = {
  nodes: NetNode[];
  links: NetLink[];
};

export type NetDraft = NetTopology;

export const NET_LAB_ID = "network-sim";
export const NET_MAX_NODES = 12;
export const NET_MAX_LINKS = 16;
export const NET_MAX_ROUTES_PER_ROUTER = 8;
export const NET_MAX_PORTS_PER_NODE = 8;
export const NET_TOPOLOGY_JSON_LIMIT = 64 * 1024;
export const ID_PATTERN = /^[a-z][a-z0-9-]{0,15}$/;
export const LABEL_LIMIT = 24;
export const GRID_COLS = 4;
export const GRID_ROWS = 2;

export const KIND_LABEL: Record<NetNodeKind, string> = {
  host: "主机",
  switch: "交换机",
  router: "路由器",
};

export const KIND_PORTS: Record<NetNodeKind, string[]> = {
  host: ["eth0"],
  switch: ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"],
  router: ["g0", "g1", "g2", "g3"],
};

/** Deterministic per-port MAC — stable across sanitize and identical on server and client. */
export function macFor(nodeId: string, portId: string): string {
  const h = fnv1a(`${nodeId}|${portId}`);
  const b = [(h >>> 16) & 0xff, (h >>> 8) & 0xff, h & 0xff];
  return `02:5e:${b.map((x) => x.toString(16).padStart(2, "0")).join(":")}`;
}

export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function cleanText(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function sanitizePort(raw: unknown, nodeId: string, kind: NetNodeKind): NetPort | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const id = cleanText(p.id, 8);
  if (!KIND_PORTS[kind].includes(id)) return null;
  const port: NetPort = { id };
  if (kind === "switch") return port; // switch ports carry no L3 config
  port.mac = macFor(nodeId, id);
  if (typeof p.ip === "string" && p.ip.trim() !== "") port.ip = cleanText(p.ip, 15).trim();
  if (typeof p.mask === "string" && p.mask.trim() !== "") {
    const parsed = parseMask(p.mask);
    if (parsed !== null) port.mask = `/${parsed}`;
  }
  return port;
}

function sanitizeRoutes(raw: unknown): NetRouteRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: NetRouteRow[] = [];
  for (const r of raw.slice(0, NET_MAX_ROUTES_PER_ROUTER)) {
    if (!r || typeof r !== "object") continue;
    const row = r as Record<string, unknown>;
    const prefix = cleanText(row.prefix, 20).trim();
    const nextHop = cleanText(row.nextHop, 15).trim();
    if (prefix === "" && nextHop === "") continue;
    rows.push({ prefix, nextHop });
  }
  return rows;
}

export function sanitizeTopology(raw: unknown): NetTopology {
  if (!raw || typeof raw !== "object") return { nodes: [], links: [] };
  const t = raw as Record<string, unknown>;
  const rawNodes = Array.isArray(t.nodes) ? t.nodes : [];
  const nodes: NetNode[] = [];
  const seen = new Set<string>();
  for (const rawNode of rawNodes.slice(0, NET_MAX_NODES)) {
    if (!rawNode || typeof rawNode !== "object") continue;
    const n = rawNode as Record<string, unknown>;
    const id = cleanText(n.id, 16);
    if (!ID_PATTERN.test(id) || seen.has(id)) continue;
    seen.add(id);
    const kind: NetNodeKind = n.kind === "switch" || n.kind === "router" ? n.kind : "host";
    const ports = (Array.isArray(n.ports) ? n.ports : [])
      .map((p) => sanitizePort(p, id, kind))
      .filter((p): p is NetPort => p !== null)
      .filter((p, i, all) => all.findIndex((q) => q.id === p.id) === i)
      .slice(0, NET_MAX_PORTS_PER_NODE);
    const node: NetNode = {
      id,
      label: cleanText(n.label, LABEL_LIMIT) || id.toUpperCase(),
      kind,
      x: clampInt(n.x, 0, GRID_COLS - 1, 0),
      y: clampInt(n.y, 0, GRID_ROWS - 1, 0),
      ports,
    };
    if (n.fixed === true) node.fixed = true;
    if (kind === "host" && typeof n.gateway === "string" && n.gateway.trim() !== "") {
      node.gateway = cleanText(n.gateway, 15).trim();
    }
    if (kind === "router") {
      const routes = sanitizeRoutes(n.routes);
      if (routes.length > 0) node.routes = routes;
    }
    nodes.push(node);
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const rawLinks = Array.isArray(t.links) ? t.links : [];
  const links: NetLink[] = [];
  const seenEnds = new Set<string>();
  const endKey = (e: { node: string; port: string }) => `${e.node}/${e.port}`;
  for (const rawLink of rawLinks.slice(0, NET_MAX_LINKS)) {
    if (!rawLink || typeof rawLink !== "object") continue;
    const l = rawLink as Record<string, unknown>;
    const ends = [l.a, l.b] as Record<string, unknown>[];
    if (!ends.every((e) => e && typeof e === "object")) continue;
    const link: NetLink = {
      a: { node: cleanText(ends[0].node, 16), port: cleanText(ends[0].port, 8) },
      b: { node: cleanText(ends[1].node, 16), port: cleanText(ends[1].port, 8) },
    };
    const nodesOk = [link.a, link.b].every((end) => {
      const node = nodeById.get(end.node);
      return node !== undefined && node.ports.some((p) => p.id === end.port);
    });
    if (!nodesOk || link.a.node === link.b.node) continue;
    // One link per port, no duplicated wire.
    if (seenEnds.has(endKey(link.a)) || seenEnds.has(endKey(link.b))) continue;
    seenEnds.add(endKey(link.a));
    seenEnds.add(endKey(link.b));
    links.push(link);
  }
  return { nodes, links };
}

export function nodeById(net: NetTopology, id: string): NetNode | undefined {
  return net.nodes.find((n) => n.id === id);
}

export function portOf(node: NetNode, portId: string): NetPort | undefined {
  return node.ports.find((p) => p.id === portId);
}

/** The neighbor on the other end of the link leaving `nodeId:portId`, if wired. */
export function linkNeighbor(
  net: NetTopology,
  nodeId: string,
  portId: string,
): { node: NetNode; port: NetPort } | null {
  for (const link of net.links) {
    const other =
      link.a.node === nodeId && link.a.port === portId
        ? link.b
        : link.b.node === nodeId && link.b.port === portId
          ? link.a
          : null;
    if (!other) continue;
    const node = nodeById(net, other.node);
    const port = node ? portOf(node, other.port) : undefined;
    if (node && port) return { node, port };
  }
  return null;
}

/** Numeric ip+prefix of a configured port, or null when blank/unparseable. */
export function portAddress(port: NetPort): { ip: number; prefix: number } | null {
  if (!port.ip) return null;
  const ip = parseIp(port.ip);
  if (ip === null) return null;
  const prefix = parseMask(port.mask ?? "/24");
  if (prefix === null) return null;
  return { ip, prefix };
}

/** First ip owner across the topology — the L2 "neighbor table" consult. */
export function ownerOfIp(net: NetTopology, ip: number): { node: NetNode; port: NetPort } | null {
  for (const node of net.nodes) {
    for (const port of node.ports) {
      const addr = portAddress(port);
      if (addr && addr.ip === ip) return { node, port };
    }
  }
  return null;
}

export function describePort(node: NetNode, port: NetPort): string {
  const addr = portAddress(port);
  if (!addr) return `${node.label}·${port.id}`;
  return `${node.label}·${port.id}（${formatIp(addr.ip)}/${addr.prefix}）`;
}
