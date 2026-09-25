/**
 * Scenario format and the per-case judge for is-sim.
 *
 * An `IsCase` is a closed-world test: initial fault/device state, a
 * scripted timeline (`script`) of emits and fault injections, a tick
 * `horizon` bounding the run, and assertions over the resulting trace.
 * Reference topologies plus `IsCase`s are authored together so every
 * assertion is reproducible from the file alone.
 *
 * Assertion families deliberately mirror the curriculum goals:
 * - completeness: `dbCount` / `dbHas` / `seen` — did data arrive where it should;
 * - correctness: `fired` / `notFired` — did the threshold rule trigger;
 * - policy: `approval` — every delivery into a sensitive port must carry
 *   a node of a given kind in its path (human-in-the-loop);
 * - resilience/robustness: `noDrops` / `noPending` and fault ops in the
 *   script (link-down / device-down).
 */

import { sanitizeTopology, type IsNodeKind, type IsTopology } from "./model.ts";
import { runScenario, type DroppedEvent, type SimReason, type SimRun } from "./sim.ts";

export type IsEventKind =
  | "reading"
  | "borrow"
  | "return-request"
  | "query"
  | "result"
  | "action"
  | "clear"
  | "tick"
  | "fault";

export const EVENT_KIND_LABEL: Record<IsEventKind, string> = {
  reading: "读数",
  borrow: "借阅",
  "return-request": "还书请求",
  query: "查询",
  result: "回执",
  action: "动作",
  clear: "复位",
  tick: "到点",
  fault: "故障",
};

export type ScriptEvent =
  | { at: number; op: "emit"; node: string; kind: IsEventKind; payload?: number }
  | { at: number; op: "link-down" | "link-up"; node: string; port: string }
  | { at: number; op: "device-down" | "device-up"; node: string };

export type IsCase = {
  name: string;
  category: string;
  /** Seed for jitter/drop-rate streams; fixed per case so replays match. */
  seed?: number;
  /** Tick budget; events due at or after this tick are dropped as timeouts. */
  horizon: number;
  init?: {
    /** Node ids that start powered down. */
    down?: string[];
    /** In-ports whose single link is cut at t=0: {node, port}. */
    cut?: { node: string; port: string }[];
    /** Records pre-seeded into a db node. */
    dbRecords?: Record<string, number[]>;
  };
  script: ScriptEvent[];
  expect: {
    /** Maximum processed steps allowed; exceeding it fails the case. */
    events: number;
    /** Exact stored-record counts per db node id. */
    dbCount?: Record<string, number>;
    /** Payloads that must be present in a db node's store. */
    dbHas?: Record<string, number[]>;
    /** Exact delivery counts per dashboard node id. */
    seen?: Record<string, number>;
    /** Actuator node ids that must have fired at least once. */
    fired?: string[];
    /** Actuator node ids that must never have fired. */
    notFired?: string[];
    /** Every delivery into {node,port} must include a `via`-kind node in path. */
    approval?: { node: string; port: string; via: IsNodeKind }[];
    /** No dropped deliveries at all. */
    noDrops?: boolean;
    /** No events left queued at a human node. */
    noPending?: boolean;
  };
};

export type DbDiff = {
  node: string;
  expectedCount?: number;
  actualCount: number;
  missing?: number[];
};

export type SeenDiff = { node: string; expected: number; actual: number };

export type FiredDiff = { node: string; expected: boolean; actual: boolean };

export type UnapprovedHit = {
  node: string;
  port: string;
  eventId: string;
  kind: IsEventKind;
  tick: number;
};

export type PendingQueue = { node: string; count: number };

export type IsVerdict = {
  name: string;
  category: string;
  passed: boolean;
  reason: SimReason | null;
  eventsUsed: number;
  eventBudget: number;
  dbDiff: DbDiff[];
  seenDiff: SeenDiff[];
  firedDiff: FiredDiff[];
  unapproved: UnapprovedHit[];
  pending: PendingQueue[];
  dropped: DroppedEvent[];
  run: SimRun;
};

export function judgeCase(draft: IsTopology, testCase: IsCase, maxEvents?: number): IsVerdict {
  const topology = sanitizeTopology(draft);
  const run = runScenario(topology, testCase, maxEvents);
  const expect = testCase.expect;

  const dbDiff: DbDiff[] = [];
  const dbNodes = new Set([
    ...Object.keys(expect.dbCount ?? {}),
    ...Object.keys(expect.dbHas ?? {}),
  ]);
  for (const id of dbNodes) {
    const actual = run.devices[id]?.stored ?? [];
    const missing = (expect.dbHas?.[id] ?? []).filter((p) => !actual.includes(p));
    const expectedCount = expect.dbCount?.[id];
    if ((expectedCount !== undefined && actual.length !== expectedCount) || missing.length > 0) {
      dbDiff.push({ node: id, expectedCount, actualCount: actual.length, missing });
    }
  }

  const seenDiff: SeenDiff[] = [];
  for (const [id, expected] of Object.entries(expect.seen ?? {})) {
    const actual = run.devices[id]?.seen ?? 0;
    if (actual !== expected) seenDiff.push({ node: id, expected, actual });
  }

  const firedDiff: FiredDiff[] = [];
  for (const id of expect.fired ?? []) {
    const actual = (run.devices[id]?.fired ?? 0) > 0;
    if (!actual) firedDiff.push({ node: id, expected: true, actual });
  }
  for (const id of expect.notFired ?? []) {
    const actual = (run.devices[id]?.fired ?? 0) > 0;
    if (actual) firedDiff.push({ node: id, expected: false, actual });
  }

  const kindOf = new Map(topology.nodes.map((n) => [n.id, n.kind] as const));
  const unapproved: UnapprovedHit[] = [];
  for (const rule of expect.approval ?? []) {
    for (const row of run.trace) {
      if (row.node !== rule.node || row.port !== rule.port) continue;
      const ok = row.path.some((id) => kindOf.get(id) === rule.via);
      if (!ok) {
        unapproved.push({
          node: row.node,
          port: row.port,
          eventId: row.eventId,
          kind: row.kind,
          tick: row.tick,
        });
        if (unapproved.length >= 8) break;
      }
    }
  }

  const pending: PendingQueue[] = [];
  for (const [id, view] of Object.entries(run.devices)) {
    if (view.pending > 0) pending.push({ node: id, count: view.pending });
  }

  const overBudget = run.eventsUsed > expect.events;
  const passed =
    run.reason === "done" &&
    !overBudget &&
    dbDiff.length === 0 &&
    seenDiff.length === 0 &&
    firedDiff.length === 0 &&
    unapproved.length === 0 &&
    (!expect.noDrops || run.dropped.length === 0) &&
    (!expect.noPending || pending.length === 0);

  return {
    name: testCase.name,
    category: testCase.category,
    passed,
    reason: run.reason === "budget" ? "budget" : null,
    eventsUsed: run.eventsUsed,
    eventBudget: expect.events,
    dbDiff,
    seenDiff,
    firedDiff,
    unapproved,
    pending,
    dropped: run.dropped,
    run,
  };
}
