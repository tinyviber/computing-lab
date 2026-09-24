/**
 * Public debug cases for the is-sim lab — a few representative scenarios
 * per stage so a student can preview in the browser. Passing them is
 * necessary but not sufficient: Submit runs the hidden set server-side
 * with the same per-user seed but different scripts and numbers.
 */

import type { IsCase, ScriptEvent } from "../domain/scenario.ts";
import { makeRng } from "../domain/rng.ts";

const on = (
  at: number,
  node: string,
  kind: "reading" | "borrow" | "return-request" | "query",
  payload: number,
): ScriptEvent => ({ at, op: "emit", node, kind, payload });

const CASES: Record<number, (seed: number) => IsCase[]> = {
  // S1: wire the scanner to the library db; every borrow must land.
  1: (seed) => {
    const rng = makeRng(seed);
    const payload = () => 100 + Math.floor(rng() * 90);
    const first = [payload(), payload(), payload()];
    const second = [payload(), payload(), payload(), payload()];
    return [
      {
        name: "三笔借阅",
        category: "basic",
        horizon: 20,
        script: first.map((p, i) => on(i * 2, "scan", "borrow", p)),
        expect: { events: 24, dbCount: { books: 3 }, dbHas: { books: first }, noDrops: true },
      },
      {
        name: "连着四笔",
        category: "seeded",
        horizon: 24,
        script: second.map((p, i) => on(i * 2, "scan", "borrow", p)),
        expect: { events: 32, dbCount: { books: 4 }, dbHas: { books: second }, noDrops: true },
      },
    ];
  },

  // S2: two scanners through a gateway; every in-port takes one driver.
  2: (seed) => {
    const rng = makeRng(seed);
    const payload = () => 100 + Math.floor(rng() * 90);
    const run = (a: number[], b: number[]) => {
      const script: ScriptEvent[] = [
        ...a.map((p, i) => on(i * 2, "scan-a", "borrow", p)),
        ...b.map((p, i) => on(i * 2, "scan-b", "borrow", p)),
      ];
      return {
        name: `A${a.length} 笔 + B${b.length} 笔`,
        category: "basic",
        horizon: 24,
        script,
        expect: {
          events: 64,
          dbCount: { books: a.length + b.length },
          dbHas: { books: [...a, ...b] },
          noDrops: true,
        },
      };
    };
    return [
      run([payload(), payload()], [payload(), payload()]),
      run([payload()], [payload(), payload(), payload()]),
    ];
  },

  // S3: receipts — dashboard must see one result per write.
  3: (seed) => {
    const rng = makeRng(seed);
    const mk = (n: number) => {
      const payloads = Array.from({ length: n }, () => 100 + Math.floor(rng() * 90));
      return {
        name: `${n} 笔借阅回执`,
        category: "basic",
        horizon: 24,
        script: payloads.map((p, i) => on(i * 2, "scan", "borrow", p)),
        expect: {
          events: 64,
          dbCount: { books: n },
          seen: { desk: n },
          noDrops: true,
        },
      };
    };
    return [mk(2), mk(4)];
  },

  // S4: returns pass the librarian before deleting — no bypass, no backlog.
  4: (seed) => {
    const rng = makeRng(seed);
    const mk = (borrowIds: number[], returnIds: number[]) => {
      const script: ScriptEvent[] = [
        ...borrowIds.map((p, i) => on(i * 2, "scan-borrow", "borrow", p)),
        ...returnIds.map((p, i) =>
          on(borrowIds.length * 2 + 2 + i * 2, "scan-return", "return-request", p),
        ),
      ];
      return {
        name: `借 ${borrowIds.length} 还 ${returnIds.length}`,
        category: "correctness",
        horizon: borrowIds.length * 2 + returnIds.length * 2 + 16,
        script,
        expect: {
          events: 128,
          dbCount: { books: borrowIds.length - returnIds.length },
          approval: [{ node: "books", port: "delete", via: "human" as const }],
          noPending: true,
        },
      };
    };
    const ids = () => Array.from({ length: 3 }, () => 100 + Math.floor(rng() * 90));
    const first = ids();
    const second = ids();
    return [mk(first.slice(0, 2), first.slice(0, 2)), mk(second, second.slice(0, 1))];
  },

  // S5: threshold rule — 读数 ≥ 60 启动喷淋.
  5: (seed) => {
    const rng = makeRng(seed);
    const mk = (name: string, readings: number[], expect: IsCase["expect"]) => ({
      name,
      category: "correctness",
      horizon: 32,
      script: readings.map((p, i) => on(i * 2, "temp", "reading", p)),
      expect,
    });
    return [
      mk("跨阈值触发", [45, 62, 71, 58], { events: 64, fired: ["sprinkler"], seen: { board: 2 } }),
      mk("一直偏低", [30, 42, 55], { events: 64, notFired: ["sprinkler"] }),
      mk("正好压线", [60, 40], { events: 64, fired: ["sprinkler"], seen: { board: 2 } }),
      mk(
        "临近但不越线",
        Array.from({ length: 5 }, () => 52 + Math.floor(rng() * 8)),
        {
          events: 64,
          notFired: ["sprinkler"],
        },
      ),
    ];
  },

  // X6: fan-out to both dbs; the main db dies mid-run, replica takes it all.
  6: (seed) => {
    const rng = makeRng(seed);
    const before = Array.from({ length: 3 }, () => 100 + Math.floor(rng() * 90));
    const after = Array.from({ length: 2 }, () => 100 + Math.floor(rng() * 90));
    const script: ScriptEvent[] = [
      ...before.map((p, i) => on(i * 2, "scan", "borrow", p)),
      { at: 8, op: "device-down", node: "db-main" },
      ...after.map((p, i) => on(10 + i * 2, "scan", "borrow", p)),
    ];
    return [
      {
        name: "主库中途宕机",
        category: "fault",
        horizon: 20,
        script,
        expect: {
          events: 96,
          dbCount: { "db-main": 3, "db-copy": 5 },
          dbHas: { "db-copy": [...before, ...after] },
        },
      },
      {
        name: "写入线路被剪断",
        category: "fault",
        horizon: 20,
        script: [
          ...before.map((p, i) => on(i * 2, "scan", "borrow", p)),
          { at: 8, op: "link-down", node: "db-main", port: "write" },
          ...after.map((p, i) => on(10 + i * 2, "scan", "borrow", p)),
        ],
        expect: {
          events: 96,
          dbCount: { "db-main": 3, "db-copy": 5 },
          dbHas: { "db-copy": [...before, ...after] },
        },
      },
    ];
  },
};

export function publicCasesFor(stageIndex: number, seed: number): IsCase[] {
  return CASES[stageIndex]?.(seed) ?? [];
}
