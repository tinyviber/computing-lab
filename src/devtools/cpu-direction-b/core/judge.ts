// Public tests and hidden judging. Hidden data is only surfaced as a single
// counterexample after a failed submit, never before.

import { createMachine, runToEnd, STATUS_ZH, type CycleRecord, type Status } from "./machine";
import { memoryImage, type Dataset, type Expect, type Level, type Line } from "./levels";

export interface Diff {
  loc: Expect["loc"];
  expected: number;
  actual: number;
  ok: boolean;
}

export interface TestRow {
  data: Dataset;
  ok: boolean;
  status: Status;
  cycles: number;
  budget: number | null;
  diffs: Diff[];
  /** Why the row failed, in student language. Empty when ok. */
  reasons: string[];
  trace: CycleRecord[];
}

export type JudgeResult =
  | { ok: true; total: number; newlyUnlocked: number[] }
  | { ok: false; counter: TestRow; reason: string; publicOk: boolean };

export const locLabel = (loc: Expect["loc"]) => (typeof loc === "number" ? `M[${loc}]` : loc);

export function programReady(lines: Line[]) {
  return lines.length > 0 && lines.every((l) => l.instr !== null);
}

export function runCase(level: Level, lines: Line[], data: Dataset): TestRow {
  const start = createMachine(memoryImage(level, lines, data), data.regs ?? {}, level.limit);
  const { final, records } = runToEnd(start);
  const diffs = level.expect(data).map((e) => {
    const actual = typeof e.loc === "number" ? final.mem[e.loc] : final[e.loc];
    return { loc: e.loc, expected: e.value, actual, ok: actual === e.value };
  });
  const budget = level.budget ? level.budget(data) : null;
  const reasons: string[] = [];
  if (final.status !== "halted") {
    reasons.push(
      final.status === "cycle-limit"
        ? `没有停机：走满 ${level.limit} 个周期上限`
        : `没有停机：PC 跑到 ${final.pc}，超出存储器范围`,
    );
  }
  for (const d of diffs)
    if (!d.ok) reasons.push(`${locLabel(d.loc)} 预期 ${d.expected}，实际 ${d.actual}`);
  if (budget !== null && final.cycle > budget)
    reasons.push(`用了 ${final.cycle} 个周期，超出预算 ${budget}`);
  if (level.extra === "fetch-written" && !records.some((r) => r.fetchedWritten)) {
    reasons.push("没有取指执行过先前被 STORE 写过的格子");
  }
  return {
    data,
    ok: reasons.length === 0,
    status: final.status,
    cycles: final.cycle,
    budget,
    diffs,
    reasons,
    trace: records,
  };
}

export function runPublic(level: Level, lines: Line[]): TestRow[] {
  return level.publicData.map((d) => runCase(level, lines, d));
}

export function judge(
  level: Level,
  lines: Line[],
  passedBefore: readonly number[],
  unlockedAfter: (passed: number[]) => number[],
): JudgeResult {
  const rows = level.hidden.map((d) => runCase(level, lines, d));
  const publicOk = runPublic(level, lines).every((r) => r.ok);
  const failed = rows.find((r) => !r.ok);
  if (failed) return { ok: false, counter: failed, reason: failed.reasons[0], publicOk };
  if (level.extra === "both-directions") {
    const jz = rows.flatMap((r) => r.trace.filter((t) => t.instr.op === "JZ"));
    const taken = jz.some((t) => t.jumped);
    const notTaken = jz.some((t) => t.jumped === false);
    if (!taken || !notTaken) {
      const counter = {
        ...rows[0],
        ok: false,
        reasons: ["条件跳转只朝一个方向执行过，另一个分支从未真实运行"],
      };
      return { ok: false, counter, reason: counter.reasons[0], publicOk };
    }
  }
  const before = unlockedAfter([...passedBefore]);
  const after = unlockedAfter([...passedBefore, level.id]);
  return {
    ok: true,
    total: rows.length,
    newlyUnlocked: after.filter((id) => !before.includes(id)),
  };
}

export const statusText = (s: Status) => STATUS_ZH[s];
