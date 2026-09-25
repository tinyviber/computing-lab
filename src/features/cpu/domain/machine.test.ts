import { describe, expect, it } from "vitest";
import { decodeInstr, encodeInstr, formatInstr, sanitizeProgram, type InstrRow } from "./isa.ts";
import { initialState, judgeCase, runProgram, type CpuCase } from "./machine.ts";
import { seedFor } from "./rng.ts";
import { getCpuStage, cpuStageUnlocked, nextCpuStage } from "./stages.ts";
import { hiddenCasesFor } from "../../../../server/judge/cpu/hiddenSet.ts";

const I = (op: InstrRow["op"], reg: 0 | 1 = 0, operand = 0): InstrRow => ({ op, reg, operand });

describe("isa", () => {
  it("round-trips encode/decode for every opcode", () => {
    for (const row of [
      I("LOAD", 0, 14),
      I("STORE", 1, 15),
      I("ADD", 0, 3),
      I("SUB", 1, 7),
      I("JZ", 0, 9),
      I("JMP", 0, 15),
      I("LDI", 1, 12),
      I("HALT"),
    ]) {
      const decoded = decodeInstr(encodeInstr(row));
      expect(decoded).toEqual(row);
    }
  });

  it("formats instructions with operand meaning", () => {
    expect(formatInstr(I("LOAD", 0, 14))).toBe("LOAD A, M[14]");
    expect(formatInstr(I("SUB", 1, 4))).toBe("SUB B, M[4]");
    expect(formatInstr(I("JMP", 0, 9))).toBe("JMP →9");
    expect(formatInstr(I("JZ", 1, 3))).toBe("JZ B, →3");
    expect(formatInstr(I("LDI", 0, 15))).toBe("LDI A, 15");
    expect(formatInstr(I("HALT"))).toBe("HALT");
  });

  it("sanitizes programs to the row and operand caps", () => {
    const tooLong = Array.from({ length: 20 }, () => I("HALT"));
    expect(sanitizeProgram(tooLong)).toHaveLength(16);
    expect(sanitizeProgram([I("LOAD", 0, 42)])).toEqual([]);
    expect(sanitizeProgram("nope")).toEqual([]);
  });

  it("lays the program image over initial memory", () => {
    const mem = initialState([I("LOAD", 0, 14), I("HALT")], { 0: 99, 14: 7 }).mem;
    expect(mem[0]).toBe(0b00001110);
    expect(mem[14]).toBe(7);
  });
});

describe("machine", () => {
  it("runs a copy program to HALT and records writes", () => {
    const run = runProgram([I("LOAD", 0, 14), I("STORE", 0, 15), I("HALT")], { 14: 7 });
    expect(run.reason).toBe("halted");
    expect(run.trace).toHaveLength(3);
    expect(run.final.mem[15]).toBe(7);
    expect(run.final.regs.A).toBe(7);
    expect(run.trace[1].memWrite).toEqual({ addr: 15, prev: 0, value: 7 });
  });

  it("wraps arithmetic mod 16 and flags carries", () => {
    const run = runProgram([I("LDI", 0, 14), I("ADD", 0, 14), I("SUB", 0, 14), I("HALT")], {
      14: 7,
    });
    // 14+7 = 21 → 5 (carry), then 5−7 = −2 → 14 (borrow)
    expect(run.trace[2].regsBefore.A).toBe(5);
    expect(run.trace[1].carried).toBe(true);
    expect(run.trace[2].carried).toBe(true);
    expect(run.final.regs.A).toBe(14);
  });

  it("resolves JZ both ways and JMP absolutely", () => {
    const taken = runProgram([
      I("LDI", 0, 0),
      I("JZ", 0, 4),
      I("HALT"),
      I("HALT"),
      I("LDI", 1, 9),
      I("HALT"),
    ]);
    expect(taken.trace[1].branchTaken).toBe(true);
    expect(taken.final.regs.B).toBe(9);

    const skipped = runProgram([I("LDI", 0, 3), I("JZ", 0, 4), I("LDI", 1, 5), I("HALT")]);
    expect(skipped.trace[1].branchTaken).toBe(false);
    expect(skipped.final.regs.B).toBe(5);
  });

  it("reports ran-off when PC walks past the last cell", () => {
    const run = runProgram([I("JMP", 0, 15), I("HALT")], { 15: 0 });
    expect(run.reason).toBe("ran-off");
  });

  it("reports timeout at the cycle cap", () => {
    const run = runProgram([I("JMP", 0, 0)], {}, undefined, 10);
    expect(run.reason).toBe("timeout");
    expect(run.trace).toHaveLength(10);
  });

  it("flags a fetch of a self-written cell", () => {
    const run = runProgram([I("LDI", 0, 5), I("STORE", 0, 8), I("JMP", 0, 8), I("HALT")], {
      9: 0b11100000,
    });
    expect(run.selfModFetch).toBe(true);
    expect(run.reason).toBe("halted"); // byte 5 decodes as LOAD B, M[5] → falls into HALT
  });
});

/**
 * Reference solutions — proof every stage is solvable within its budget.
 * For guided stages this is the program `guidedProgram` produces once the
 * editable rows are filled correctly.
 */
const REFERENCES: Record<number, InstrRow[]> = {
  // C1 watch-it-go / C2 missing-instruction / C4 byte-decoder: the copy.
  1: [I("LOAD", 0, 14), I("STORE", 0, 15), I("HALT")],
  2: [I("LOAD", 0, 14), I("STORE", 0, 15), I("HALT")],
  // C3 alu-inside: the editable row is ADD.
  3: [I("ADD", 0, 14), I("HALT")],
  4: [I("LOAD", 0, 14), I("STORE", 0, 15), I("HALT")],
  // C5 branch-is-data: JZ target corrected to 4.
  5: [I("JZ", 0, 4), I("LDI", 1, 1), I("STORE", 1, 15), I("HALT"), I("STORE", 1, 15), I("HALT")],
  // C6 branch-back: JMP target corrected to 0 (the loop's back edge).
  6: [I("STORE", 1, 14), I("JZ", 1, 4), I("SUB", 1, 15), I("JMP", 0, 0), I("HALT")],
  // X1 write-an-if.
  7: [
    I("LOAD", 0, 13),
    I("SUB", 0, 14),
    I("JZ", 0, 6),
    I("LDI", 1, 0),
    I("STORE", 1, 15),
    I("JMP", 0, 7),
    I("LDI", 1, 1),
    I("STORE", 1, 15),
    I("HALT"),
  ],
  // X2 sum-to-n.
  8: [
    I("LOAD", 0, 14),
    I("JZ", 0, 7),
    I("STORE", 0, 12),
    I("ADD", 1, 12),
    I("SUB", 0, 15),
    I("JMP", 0, 1),
    I("JMP", 0, 7),
    I("STORE", 1, 13),
    I("HALT"),
  ],
  // X2' software-multiply.
  9: [
    I("LOAD", 0, 14),
    I("JZ", 0, 6),
    I("ADD", 1, 13),
    I("SUB", 0, 12),
    I("JMP", 0, 1),
    I("JMP", 0, 6),
    I("STORE", 1, 15),
    I("HALT"),
  ],
  // X3 fewer-cycles.
  10: [
    I("LOAD", 0, 14),
    I("JZ", 0, 7),
    I("STORE", 0, 12),
    I("ADD", 1, 12),
    I("SUB", 0, 15),
    I("JMP", 0, 1),
    I("JMP", 0, 7),
    I("STORE", 1, 13),
    I("HALT"),
  ],
  // X4 self-modify.
  11: [I("LOAD", 0, 13), I("ADD", 0, 14), I("STORE", 0, 15), I("STORE", 0, 8), I("JMP", 0, 8)],
};

describe("hidden-case judgement", () => {
  it("reference programs pass every hidden case of their stage", () => {
    for (const [index, rows] of Object.entries(REFERENCES)) {
      const stage = getCpuStage(Number(index))!;
      const seed = seedFor("student-x", "cpu", stage.index);
      const cases = hiddenCasesFor(stage.index, seed);
      expect(cases.length).toBeGreaterThan(0);
      for (const testCase of cases) {
        const verdict = judgeCase(rows, testCase, {
          scratchCells: stage.scratchCells,
          maxCycles: stage.maxCycles,
          requireSelfModFetch: stage.requireSelfModFetch,
        });
        expect(
          verdict.passed,
          `stage ${index} case "${testCase.name}": ${verdict.reason} ${JSON.stringify(verdict.memDiff)}`,
        ).toBe(true);
      }
    }
  });

  it("fails a program that does not halt", () => {
    const testCase: CpuCase = {
      name: "t",
      category: "basic",
      initMem: { 14: 3 },
      expect: { regs: { A: 3 }, cycles: 10 },
    };
    const verdict = judgeCase([I("LOAD", 0, 14), I("JMP", 0, 1)], testCase, { maxCycles: 8 });
    expect(verdict.passed).toBe(false);
    expect(verdict.reason).toBe("timeout");
  });

  it("catches a memory diff on an untouched non-program cell", () => {
    const testCase: CpuCase = {
      name: "t",
      category: "basic",
      initMem: { 14: 5 },
      expect: { mem: { 15: 5 }, cycles: 10 },
    };
    const rows = [I("LOAD", 0, 14), I("STORE", 0, 15), I("STORE", 0, 13), I("HALT")];
    const verdict = judgeCase(rows, testCase, { maxCycles: 10 });
    expect(verdict.passed).toBe(false);
    expect(verdict.memDiff[0]).toEqual({ addr: 13, expected: 0, actual: 5 });
  });

  it("catches a wrong branch direction", () => {
    const testCase: CpuCase = {
      name: "t",
      category: "differ",
      initMem: { 13: 3, 14: 4 },
      expectBranchTaken: true,
      expect: { cycles: 10 },
    };
    const verdict = judgeCase(REFERENCES[7], testCase, { maxCycles: 10 });
    expect(verdict.passed).toBe(false);
    expect(verdict.branchMismatch).toBe(true);
  });
});

describe("stage progression", () => {
  it("gates stages linearly and challenges on their prerequisites", () => {
    expect(cpuStageUnlocked([], 1)).toBe(true);
    expect(cpuStageUnlocked([], 2)).toBe(false);
    expect(cpuStageUnlocked([1], 2)).toBe(true);
    expect(cpuStageUnlocked([1, 2, 3, 4], 6)).toBe(false);
    expect(cpuStageUnlocked([1, 2, 3, 4, 5], 6)).toBe(true);
    // Challenge X1 unlocks on its explicit prerequisite (stage 5), not linearly.
    expect(cpuStageUnlocked([4], 7)).toBe(false);
    expect(cpuStageUnlocked([5], 7)).toBe(true);
  });

  it("advances to the first unpassed stage then the end marker", () => {
    expect(nextCpuStage([])).toBe(1);
    expect(nextCpuStage([1, 2])).toBe(3);
    expect(nextCpuStage([1, 2, 3, 4, 5, 6])).toBe(7);
    expect(nextCpuStage([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toBe(12);
  });
});
