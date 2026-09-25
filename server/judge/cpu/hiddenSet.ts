/**
 * Hidden judgement cases for the cpu lab. Numbers the student can't see:
 * the public cases carry the same per-user seed so behaviour matches, but
 * the hidden lists are exhaustive where the input space allows it — a
 * program only passes if it truly computes the contract.
 */

import { decorateCases } from "../../../src/features/cpu/domain/fixtures.ts";
import type { CpuCase } from "../../../src/features/cpu/domain/machine.ts";
import { makeRng } from "../../../src/features/cpu/domain/rng.ts";
import { getCpuStage } from "../../../src/features/cpu/domain/stages.ts";

const mem = (entries: Record<number, number>) => entries;

/** Every ordered pair (a, b) in 0..15 × 0..15 — the full input space. */
const ALL_PAIRS: [number, number][] = [];
for (let a = 0; a < 16; a += 1) for (let b = 0; b < 16; b += 1) ALL_PAIRS.push([a, b]);

const BUILDERS: Record<number, (seed: number) => CpuCase[]> = {
  // C1: copy M[14] → A → M[15]; the zero case catches "always write a value".
  1: (seed) => {
    const stage = getCpuStage(1)!;
    return decorateCases(
      [0, 9, 15, 1 + Math.floor(makeRng(seed)() * 14)].map((v, i) => ({
        name: `M[14] = ${v}`,
        category: i < 3 ? "basic" : "seeded",
        initMem: mem({ 14: v }),
        expect: { regs: { A: v }, mem: mem({ 15: v }), cycles: 4 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C2: exhaustive (a+b)&0xF over all 256 pairs — each case also checks the
  // borrow-hungry (a−b)&0xF at M[12] — plus 16 seeded a<b pairs.
  2: (seed) => {
    const stage = getCpuStage(2)!;
    const exhaustive = ALL_PAIRS.map(([a, b]) => ({
      name: `a=${a}, b=${b}`,
      category: "add",
      initMem: mem({ 13: a, 14: b }),
      initRegs: { A: a, B: b },
      expect: { mem: mem({ 15: (a + b) & 0xf, 12: (a - b) & 0xf }), cycles: 6 },
    }));
    const rng = makeRng(seed);
    const borrows: CpuCase[] = [];
    for (let i = 0; i < 16; i += 1) {
      const a = Math.floor(rng() * 15);
      const b = a + 1 + Math.floor(rng() * (15 - a));
      borrows.push({
        name: `借位 ${a}−${b}`,
        category: "sub",
        initMem: mem({ 13: a, 14: b }),
        initRegs: { A: a, B: b },
        expect: { mem: mem({ 15: (a + b) & 0xf, 12: (a - b) & 0xf }), cycles: 6 },
      });
    }
    return decorateCases([...exhaustive, ...borrows], seed, stage.decoyCells);
  },

  // C3: equality branch over the full (a,b) space; every case asserts the
  // direction its last JZ must resolve — equal ⇒ taken, differ ⇒ not.
  3: (seed) => {
    const stage = getCpuStage(3)!;
    return decorateCases(
      ALL_PAIRS.map(([a, b]) => ({
        name: `a=${a}, b=${b}`,
        category: a === b ? "equal" : "differ",
        initMem: mem({ 13: a, 14: b }),
        expectBranchTaken: a === b,
        expect: { mem: mem({ 15: a === b ? 1 : 0 }), cycles: 9 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C4: 1+…+N — N=0 catches programs that do the body before the check.
  4: (seed) => {
    const stage = getCpuStage(4)!;
    return decorateCases(
      [0, 1, 3, 5, 7, 12, 15].map((n) => ({
        name: `N = ${n}`,
        category: n === 0 ? "zero" : "loop",
        initMem: mem({ 14: n, 15: 1 }),
        expectBranchTaken: true,
        expect: { mem: mem({ 13: ((n * (n + 1)) / 2) & 0xf }), cycles: 128 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C5: software multiply over {0,1,3,5,7}² (the (0,0) pair is in the grid).
  5: (seed) => {
    const stage = getCpuStage(5)!;
    const factors = [0, 1, 3, 5, 7];
    const cases: CpuCase[] = factors.flatMap((a) =>
      factors.map((b) => ({
        name: `${a} × ${b}`,
        category: a === 0 || b === 0 ? "zero" : "multiply",
        initMem: mem({ 12: 1, 13: a, 14: b }),
        expectBranchTaken: true,
        expect: { mem: mem({ 15: (a * b) & 0xf }), cycles: 64 },
      })),
    );
    return decorateCases(cases, seed, stage.decoyCells);
  },

  // X2: same sum task, budget tightened to 5N+4 — a memory-resident loop
  // counter (~6N+4 cycles) cannot fit; the register version can.
  6: (seed) => {
    const stage = getCpuStage(6)!;
    return decorateCases(
      [0, 1, 7, 12, 15].map((n) => ({
        name: `N = ${n}`,
        category: "tight-budget",
        initMem: mem({ 14: n, 15: 1 }),
        expectBranchTaken: true,
        expect: { mem: mem({ 13: ((n * (n + 1)) / 2) & 0xf }), cycles: 5 * n + 4 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // X3: compute a+b AND fetch an instruction byte the program itself wrote.
  // M[9] holds a ready-made HALT (224) to land on.
  7: (seed) => {
    const stage = getCpuStage(7)!;
    return decorateCases(
      [
        { a: 2, b: 3 },
        { a: 4, b: 1 },
        { a: 0, b: 7 },
        { a: 5, b: 5 },
      ].map(({ a, b }) => ({
        name: `a=${a}, b=${b}`,
        category: "self-mod",
        initMem: mem({ 9: 0b11100000, 13: a, 14: b }),
        expect: { mem: mem({ 15: (a + b) & 0xf }), cycles: 32 },
      })),
      seed,
      stage.decoyCells,
    );
  },
};

export function hiddenCasesFor(stageIndex: number, seed: number): CpuCase[] {
  return BUILDERS[stageIndex]?.(seed) ?? [];
}
