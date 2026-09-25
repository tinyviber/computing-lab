/**
 * Hidden test cases for the cpu lab — graded server-side only, generated per
 * user so two students see different inputs. The CLIENT publishes its own
 * debug set (src/features/cpu/lesson/publicCases.ts); these cases overlap in
 * coverage but differ in inputs.
 */

import { decorateCases } from "../../../src/features/cpu/domain/fixtures.ts";
import type { CpuCase } from "../../../src/features/cpu/domain/machine.ts";
import { makeRng } from "../../../src/features/cpu/domain/rng.ts";
import { getCpuStage } from "../../../src/features/cpu/domain/stages.ts";

const mem = (entries: Record<number, number>) => entries;

/** Deterministic int in [lo, hi] — hidden inputs vary per student seed. */
function seededInt(seed: number, lo: number, hi: number): number {
  return lo + Math.floor(makeRng(seed)() * (hi - lo + 1));
}

const BUILDERS: Record<number, (seed: number) => CpuCase[]> = {
  // C1: fixed watch-it-go program — copy M[14] → A → M[15].
  1: (seed) => {
    const stage = getCpuStage(1)!;
    return decorateCases(
      [0, 9, 15, seededInt(seed, 1, 14)].map((v) => ({
        name: `M[14] = ${v}`,
        category: "basic",
        initMem: mem({ 14: v }),
        expect: { regs: { A: v }, mem: mem({ 15: v }), cycles: 4 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C2: fill the missing STORE — same copy contract, one editable row.
  2: (seed) => {
    const stage = getCpuStage(2)!;
    return decorateCases(
      [0, 9, 15, seededInt(seed, 1, 14)].map((v) => ({
        name: `M[14] = ${v}`,
        category: "basic",
        initMem: mem({ 14: v }),
        expect: { regs: { A: v }, mem: mem({ 15: v }), cycles: 4 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C3: ADD A,M[14] — seeded A/init pairs plus an exhaustive edge pack so a
  // SUB or wrong-direction answer fails immediately.
  3: (seed) => {
    const stage = getCpuStage(3)!;
    const edges = [
      { a: 0, b: 0 },
      { a: 15, b: 15 },
      { a: 9, b: 8 },
      { a: 1, b: 14 },
    ];
    const randoms = Array.from({ length: 4 }, (_, i) => ({
      a: seededInt(seed + i * 101, 0, 15),
      b: seededInt(seed + i * 101 + 37, 0, 15),
    }));
    return decorateCases(
      [...edges, ...randoms].map(({ a, b }) => ({
        name: `A=${a}, M[14]=${b}`,
        category: a + b > 15 ? "carry" : "basic",
        initMem: mem({ 14: b }),
        initRegs: { A: a },
        expect: { regs: { A: (a + b) & 0xf }, cycles: 3 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C4: fixed program again — the stage's real content is byte decoding.
  4: (seed) => {
    const stage = getCpuStage(4)!;
    return decorateCases(
      [0, 9, 15, seededInt(seed, 1, 14)].map((v) => ({
        name: `M[14] = ${v}`,
        category: "basic",
        initMem: mem({ 14: v }),
        expect: { regs: { A: v }, mem: mem({ 15: v }), cycles: 4 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C5: JZ target — every value in the zero/nonzero split, both branch
  // directions. M[15] starts nonzero so a skipped STORE can't pass.
  5: (seed) => {
    const stage = getCpuStage(5)!;
    const values = [0, 1, 3, 7, 15, seededInt(seed, 1, 15)];
    return decorateCases(
      values.map((a) => ({
        name: `A = ${a}`,
        category: a === 0 ? "zero" : "nonzero",
        initMem: mem({ 15: 6 }),
        initRegs: { A: a },
        expectBranchTaken: a === 0,
        expect: {
          regs: { B: a === 0 ? 0 : 1 },
          mem: mem({ 15: a === 0 ? 0 : 1 }),
          cycles: 6,
        },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C6: countdown loop — B walks to 0 through M[14], then halts.
  6: (seed) => {
    const stage = getCpuStage(6)!;
    const values = [0, 1, 3, 7, seededInt(seed, 4, 8)];
    return decorateCases(
      values.map((n) => ({
        name: `B = ${n}`,
        category: "loop",
        initMem: mem({ 15: 1 }),
        initRegs: { B: n },
        expectBranchTaken: true,
        expect: { regs: { B: 0 }, mem: mem({ 14: 0 }), cycles: 4 * n + 4 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // X1: equality branch — exhaustive input space.
  7: (seed) => {
    const stage = getCpuStage(7)!;
    return decorateCases(
      Array.from({ length: 16 }, (_, a) =>
        Array.from({ length: 16 }, (_, b) => ({
          name: `a=${a}, b=${b}`,
          category: a === b ? "equal" : "differ",
          initMem: mem({ 13: a, 14: b }),
          expectBranchTaken: a === b,
          expect: { mem: mem({ 15: a === b ? 1 : 0 }), cycles: 12 },
        })),
      ).flat(),
      seed,
      stage.decoyCells,
    );
  },

  // X2: full range of N.
  8: (seed) => {
    const stage = getCpuStage(8)!;
    return decorateCases(
      Array.from({ length: 6 }, (_, i) => i).map((n) => ({
        name: `N = ${n}`,
        category: "loop",
        initMem: mem({ 14: n, 15: 1 }),
        expectBranchTaken: true,
        expect: { mem: mem({ 13: ((n * (n + 1)) / 2) & 0xf }), cycles: 128 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // X2': software multiply over {0,1,3,5,7}² (the (0,0) pair is in the grid).
  9: (seed) => {
    const stage = getCpuStage(9)!;
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

  // X3: same loop with a tight 5N+4 budget.
  10: (seed) => {
    const stage = getCpuStage(10)!;
    return decorateCases(
      Array.from({ length: 6 }, (_, i) => i).map((n) => ({
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

  // X4: compute a+b AND fetch an instruction byte the program itself wrote.
  // M[9] holds a ready-made HALT (224) to land on.
  11: (seed) => {
    const stage = getCpuStage(11)!;
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
