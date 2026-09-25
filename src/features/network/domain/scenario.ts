/**
 * Scenario format and the per-case judge for the network lab.
 *
 * A `NetCase` is a closed-world probe: optional `warmup` sends whose
 * only effect is the MAC-table state they leave behind (their outcomes
 * are ignored), then one measured send `src → dst` with assertions over
 * the resulting run.
 *
 * Assertion families mirror the curriculum goals (issue #56 §3.2):
 * - reachability: `path` — the delivered copy's device sequence;
 * - failure semantics: `dropped` — where and why a packet dies;
 * - switch behaviour: `flood` / `unicast` / `learnedMac`;
 * - forwarding correctness: `nextHop` — which interface a node chose.
 *
 * `dst` and `src` reference node ids (resolved to that node's first
 * address in the student's draft) or a literal IPv4 string for probes
 * at addresses nobody owns.
 */

import { formatIpv4, macFor, parseIpv4 } from "./addressing.ts";
import { NODE_IFACES, nodeById, peerOf, sanitizeTopology, type NetTopology } from "./model.ts";
import {
  simulate,
  type DropReason,
  type MacTables,
  type SimOutcome,
  type SimRun,
} from "./simulate.ts";

export type NetSend = { src: string; dst: string };

export type NetExpect = {
  /** Step budget for the measured send. */
  events: number;
  /** Exact delivered-copy node sequence (send source → dst). */
  path?: string[];
  /** Assert the send dies: `at` (node) and `reason` each accept one or several options. */
  dropped?: { at: string | string[]; reason: DropReason | DropReason[] };
  /** At least one switch emitted more than one copy. */
  flood?: boolean;
  /** Every switch decision emitted exactly one copy (learned unicast). */
  unicast?: boolean;
  /** `at` must have learned `host`'s MAC on the interface wired to it. */
  learnedMac?: { host: string; at: string }[];
  /** `node` must have emitted a copy onto `iface`. */
  nextHop?: { node: string; iface: string }[];
};

export type NetCase = {
  name: string;
  category: string;
  /** Sends replayed first; their learned MAC tables seed the measured run. */
  warmup?: NetSend[];
  src: string;
  dst: string;
  expect: NetExpect;
};

export type PathDiff = { expected: string[]; actual: string[] };
export type DropDiff = {
  expectedAt: string[];
  expectedReason: DropReason[];
  actualAt: string | null;
  actualReason: DropReason | null;
  actualKind: SimOutcome["kind"];
};
export type MacDiff = {
  host: string;
  at: string;
  expectedIface: string | null;
  actualIface: string | null;
};
export type FloodDiff = { expected: "flood" | "unicast"; actual: "flood" | "unicast" | "none" };
export type HopDiff = { node: string; iface: string; used: string[] };

export type NetVerdict = {
  name: string;
  category: string;
  passed: boolean;
  reason: "done" | "budget" | null;
  eventsUsed: number;
  eventBudget: number;
  outcome: SimOutcome;
  pathDiff: PathDiff | null;
  dropDiff: DropDiff | null;
  macDiff: MacDiff[];
  floodDiff: FloodDiff | null;
  hopDiff: HopDiff[];
  run: SimRun;
};

/** `dst` may be a node id (→ its first configured address) or an IPv4 literal. */
export function resolveDst(topology: NetTopology, dst: string): string | null {
  const node = nodeById(topology, dst);
  if (node) {
    const first = NODE_IFACES[node.kind]
      .map((iface) => node.addresses[iface])
      .find((a) => a !== undefined);
    return first ? first.ip : null;
  }
  const ip = parseIpv4(dst);
  return ip === null ? null : formatIpv4(ip);
}

/** Warmup sends run first (their MAC learning persists), then the measured send. */
export function runNetCase(
  topology: NetTopology,
  testCase: NetCase,
  maxEvents?: number,
): { warmups: SimRun[]; run: SimRun; dstIp: string | null } {
  const dstIp = resolveDst(topology, testCase.dst);
  const warmups: SimRun[] = [];
  let macTables: MacTables = {};
  for (const send of testCase.warmup ?? []) {
    const warmDst = resolveDst(topology, send.dst) ?? send.dst;
    const run = simulate(topology, send.src, warmDst, { initMacTables: macTables });
    macTables = run.macTables;
    warmups.push(run);
  }
  const run = simulate(topology, testCase.src, dstIp ?? testCase.dst, {
    initMacTables: macTables,
    maxEvents,
  });
  return { warmups, run, dstIp };
}

export function judgeNetCase(
  draft: NetTopology,
  testCase: NetCase,
  maxEvents?: number,
): NetVerdict {
  const topology = sanitizeTopology(draft);
  const { run } = runNetCase(topology, testCase, maxEvents);
  const expect = testCase.expect;
  const outcome = run.outcome;

  let pathDiff: PathDiff | null = null;
  if (expect.path !== undefined) {
    const actual = outcome.kind === "delivered" ? outcome.path : [];
    if (actual.join(">") !== expect.path.join(">")) {
      pathDiff = {
        expected: expect.path,
        actual: outcome.path,
      };
    }
  }

  let dropDiff: DropDiff | null = null;
  if (expect.dropped !== undefined) {
    const ats = Array.isArray(expect.dropped.at) ? expect.dropped.at : [expect.dropped.at];
    const reasons = Array.isArray(expect.dropped.reason)
      ? expect.dropped.reason
      : [expect.dropped.reason];
    const ok =
      outcome.kind === "dropped" && ats.includes(outcome.node) && reasons.includes(outcome.reason);
    if (!ok) {
      dropDiff = {
        expectedAt: ats,
        expectedReason: reasons,
        actualAt: outcome.kind === "dropped" ? outcome.node : null,
        actualReason: outcome.kind === "dropped" ? outcome.reason : null,
        actualKind: outcome.kind,
      };
    }
  }

  const switchRows = run.trace.filter((row) => nodeById(topology, row.node)?.kind === "switch");
  let floodDiff: FloodDiff | null = null;
  if (expect.flood === true && !switchRows.some((row) => row.outs.length > 1)) {
    floodDiff = { expected: "flood", actual: switchRows.length === 0 ? "none" : "unicast" };
  }
  if (expect.unicast === true) {
    const flooded = switchRows.some((row) => row.outs.length > 1);
    if (flooded || switchRows.length === 0) {
      floodDiff = { expected: "unicast", actual: flooded ? "flood" : "none" };
    }
  }

  const macDiff: MacDiff[] = [];
  for (const rule of expect.learnedMac ?? []) {
    // The expected port = the interface where `at` is wired to `host`.
    let expectedIface: string | null = null;
    for (const iface of NODE_IFACES.switch) {
      const peer = peerOf(topology, rule.at, iface);
      if (peer?.node === rule.host) {
        expectedIface = iface;
        break;
      }
    }
    const hostNode = nodeById(topology, rule.host);
    const hostIface = hostNode ? NODE_IFACES[hostNode.kind][0] : NODE_IFACES.host[0];
    const actualIface = hostNode
      ? (run.macTables[rule.at]?.[macFor(rule.host, hostIface)] ?? null)
      : null;
    if (actualIface !== expectedIface) {
      macDiff.push({ host: rule.host, at: rule.at, expectedIface, actualIface });
    }
  }

  const hopDiff: HopDiff[] = [];
  for (const hop of expect.nextHop ?? []) {
    // Trace `outs` are peer endpoints; map each back to the local
    // interface it was emitted from.
    let emitted = false;
    const usedIfaces: string[] = [];
    for (const row of run.trace) {
      if (row.node !== hop.node) continue;
      for (const out of row.outs) {
        const localIface = ifaceForPeer(topology, hop.node, out);
        if (localIface) usedIfaces.push(localIface);
        if (localIface === hop.iface) emitted = true;
      }
    }
    if (!emitted) {
      hopDiff.push({ node: hop.node, iface: hop.iface, used: [...new Set(usedIfaces)] });
    }
  }

  const overBudget = run.eventsUsed > expect.events;
  const passed =
    run.reason !== "budget" &&
    !overBudget &&
    pathDiff === null &&
    dropDiff === null &&
    macDiff.length === 0 &&
    floodDiff === null &&
    hopDiff.length === 0;

  return {
    name: testCase.name,
    category: testCase.category,
    passed,
    reason: run.reason === "budget" ? "budget" : null,
    eventsUsed: run.eventsUsed,
    eventBudget: expect.events,
    outcome,
    pathDiff,
    dropDiff,
    macDiff,
    floodDiff,
    hopDiff,
    run,
  };
}

/** Which local interface of `node` is wired to `peer` (the emit target)? */
function ifaceForPeer(
  topology: NetTopology,
  node: string,
  peer: { node: string; iface: string },
): string | null {
  for (const link of topology.links) {
    if (link.a.node === node && link.b.node === peer.node && link.b.iface === peer.iface) {
      return link.a.iface;
    }
    if (link.b.node === node && link.a.node === peer.node && link.a.iface === peer.iface) {
      return link.b.iface;
    }
  }
  return null;
}
