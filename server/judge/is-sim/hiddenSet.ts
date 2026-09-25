/**
 * Hidden judgement cases for the is-sim lab. Scripts the student can't
 * see: emit counts, payload values and fault timing are drawn from the
 * same per-user seed the public cases use, so the behaviour practiced in
 * the preview is the behaviour graded — only the numbers differ.
 *
 * Every builder asserts at least two independent observables per case
 * (e.g. dbCount AND dbHas) so a topology that half-wires the stage
 * cannot slide through on a degenerate zero.
 */

import type { IsCase, ScriptEvent } from "../../../src/features/is-sim/domain/scenario.ts";
import { makeRng } from "../../../src/features/is-sim/domain/rng.ts";

const on = (
  at: number,
  node: string,
  kind: "reading" | "borrow" | "return-request" | "query",
  payload: number,
): ScriptEvent => ({ at, op: "emit", node, kind, payload });

const ids = (rng: () => number, n: number) =>
  Array.from({ length: n }, () => 100 + Math.floor(rng() * 90));

const BUILDERS: Record<number, (seed: number) => IsCase[]> = {
  // S1: n borrows from the scanner must all reach the library db.
  1: (seed) => {
    const rng = makeRng(seed);
    const mk = (n: number, category = "basic") => {
      const payloads = ids(rng, n);
      return {
        name: `${n} 笔借阅`,
        category,
        horizon: 20 + n * 2,
        script: payloads.map((p, i) => on(i * 2, "scan", "borrow", p)),
        expect: {
          events: 2 * n + 16,
          dbCount: { books: n },
          dbHas: { books: payloads },
          noDrops: true,
        },
      };
    };
    return [mk(1), mk(3), mk(4), mk(5, "seeded"), mk(6, "seeded")];
  },

  // S2: two scanners → gateway → db; both sources must arrive intact.
  2: (seed) => {
    const rng = makeRng(seed);
    const mk = (nA: number, nB: number) => {
      const a = ids(rng, nA);
      const b = ids(rng, nB);
      return {
        name: `A${nA} 笔 + B${nB} 笔`,
        category: "basic",
        horizon: 20 + (nA + nB) * 2,
        script: [
          ...a.map((p, i) => on(i * 2, "scan-a", "borrow", p)),
          ...b.map((p, i) => on(i * 2, "scan-b", "borrow", p)),
        ],
        expect: {
          events: 3 * (nA + nB) + 16,
          dbCount: { books: nA + nB },
          dbHas: { books: [...a, ...b] },
          noDrops: true,
        },
      };
    };
    return [mk(2, 2), mk(3, 3), mk(1, 4), mk(4, 1), mk(3, 2), mk(2, 5)];
  },

  // S3: one receipt per write on the dashboard.
  3: (seed) => {
    const rng = makeRng(seed);
    const mk = (n: number) => {
      const payloads = ids(rng, n);
      return {
        name: `${n} 笔借阅回执`,
        category: "basic",
        horizon: 20 + n * 2,
        script: payloads.map((p, i) => on(i * 2, "scan", "borrow", p)),
        expect: {
          events: 3 * n + 16,
          dbCount: { books: n },
          seen: { desk: n },
          noDrops: true,
        },
      };
    };
    return [mk(2), mk(3), mk(4), mk(5), mk(6)];
  },

  // S4: every delete must route through the human node; backlog fails.
  4: (seed) => {
    const rng = makeRng(seed);
    const mk = (nb: number, nr: number, slack = 16) => {
      const borrowIds = ids(rng, nb);
      const returnIds = borrowIds.slice(0, nr);
      return {
        name: `借 ${nb} 还 ${nr}`,
        category: nr === nb ? "return-all" : "return-some",
        horizon: nb * 2 + nr * 2 + slack,
        script: [
          ...borrowIds.map((p, i) => on(i * 2, "scan-borrow", "borrow", p)),
          ...returnIds.map((p, i) => on(nb * 2 + 2 + i * 2, "scan-return", "return-request", p)),
        ],
        expect: {
          events: 2 * nb + 4 * nr + 24,
          dbCount: { books: nb - nr },
          approval: [{ node: "books", port: "delete", via: "human" as const }],
          noPending: true,
        },
      };
    };
    // The last case runs a tight horizon: an oversized workDelay backlogs.
    return [mk(2, 2), mk(3, 3), mk(3, 1), mk(4, 2), mk(5, 4), mk(3, 3, 8)];
  },

  // S5: threshold 60 — crossing cases must fire, flat cases must not.
  5: (seed) => {
    const rng = makeRng(seed);
    const mk = (name: string, readings: number[], expect: IsCase["expect"]) => ({
      name,
      category: "correctness",
      horizon: 24 + readings.length * 2,
      script: readings.map((p, i) => on(i * 2, "temp", "reading", p)),
      expect,
    });
    return [
      mk("单个高温", [65], { events: 24, fired: ["sprinkler"], seen: { board: 1 } }),
      mk("始终偏低", [59, 59, 59], { events: 32, notFired: ["sprinkler"] }),
      mk("压线触发", [50, 60], { events: 32, fired: ["sprinkler"], seen: { board: 1 } }),
      mk("升降再升", [70, 40, 80], { events: 32, fired: ["sprinkler"], seen: { board: 3 } }),
      mk(
        "随机低温带",
        Array.from({ length: 5 }, () => 30 + Math.floor(rng() * 29)),
        {
          events: 48,
          notFired: ["sprinkler"],
        },
      ),
      mk(
        "随机高温带",
        Array.from({ length: 5 }, () => 61 + Math.floor(rng() * 30)),
        {
          events: 48,
          fired: ["sprinkler"],
          seen: { board: 1 },
        },
      ),
    ];
  },

  // X6: replica must hold every record once the primary is gone.
  6: (seed) => {
    const rng = makeRng(seed);
    /** `dead` = the db that loses writes after the fault. */
    const mk = (
      name: string,
      before: number[],
      after: number[],
      fault: ScriptEvent | null,
      dead: "db-main" | "db-copy" | null,
    ) => {
      const script: ScriptEvent[] = [
        ...before.map((p, i) => on(i * 2, "scan", "borrow", p)),
        ...(fault ? [fault] : []),
        ...after.map((p, i) => on(4 + before.length * 2 + i * 2, "scan", "borrow", p)),
      ];
      const total = before.length + after.length;
      const mainCount = dead === "db-main" ? before.length : total;
      const copyCount = dead === "db-copy" ? before.length : total;
      const live = dead === "db-main" ? "db-copy" : "db-main";
      return {
        name,
        category: "fault",
        horizon: 20 + total * 2,
        script,
        expect: {
          events: 4 * total + 24,
          dbCount: { "db-main": mainCount, "db-copy": copyCount },
          ...(dead
            ? { dbHas: { [live]: [...before, ...after] } }
            : { dbHas: { "db-copy": [...before, ...after], "db-main": [...before, ...after] } }),
        },
      };
    };
    return [
      mk(
        "主库宕机",
        ids(rng, 3),
        ids(rng, 2),
        { at: 8, op: "device-down", node: "db-main" },
        "db-main",
      ),
      mk(
        "主库线路被剪",
        ids(rng, 3),
        ids(rng, 2),
        {
          at: 8,
          op: "link-down",
          node: "db-main",
          port: "write",
        },
        "db-main",
      ),
      mk("无故障全量写入", ids(rng, 4), [], null, null),
      mk(
        "副本先挂、主库兜底",
        ids(rng, 3),
        ids(rng, 2),
        {
          at: 8,
          op: "device-down",
          node: "db-copy",
        },
        "db-copy",
      ),
    ];
  },
};

export function hiddenCasesFor(stageIndex: number, seed: number): IsCase[] {
  return BUILDERS[stageIndex]?.(seed) ?? [];
}
