/**
 * Public debug cases for the cpu lab — a few representative cases per stage
 * so a student can iterate in the browser. Passing them is necessary but
 * not sufficient: Submit runs the hidden set server-side with the same
 * per-user seed but different case lists.
 */

import { decorateCases } from "../domain/fixtures.ts";
import type { CpuCase } from "../domain/machine.ts";
import { getCpuStage } from "../domain/stages.ts";

const mem = (entries: Record<number, number>) => entries;

const CASES: Record<number, (seed: number) => CpuCase[]> = {
  // C1: copy M[14] → A → M[15]. Small values plus an edge case.
  1: (seed) => {
    const stage = getCpuStage(1)!;
    return decorateCases(
      [5, 9].map((v) => ({
        name: `M[14] = ${v}`,
        category: "basic",
        initMem: mem({ 14: v }),
        expect: { regs: { A: v }, mem: mem({ 15: v }), cycles: 4 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C2: dual ALU outputs — sum at M[15], difference at M[12].
  2: (seed) => {
    const stage = getCpuStage(2)!;
    return decorateCases(
      [
        { a: 3, b: 4 },
        { a: 7, b: 1 },
      ].map(({ a, b }) => ({
        name: `a=${a}, b=${b}`,
        category: "basic",
        initMem: mem({ 13: a, 14: b }),
        initRegs: { A: a, B: b },
        expect: {
          mem: mem({ 15: (a + b) & 0xf, 12: (a - b) & 0xf }),
          cycles: 6,
        },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // C3: equality branch — both directions shown publicly.
  3: (seed) => {
    const stage = getCpuStage(3)!;
    return decorateCases(
      [
        { a: 5, b: 5 },
        { a: 3, b: 4 },
      ].map(({ a, b }) => ({
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

  // C4: 1+…+N.
  4: (seed) => {
    const stage = getCpuStage(4)!;
    return decorateCases(
      [3, 5].map((n) => ({
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

  // C5: software multiply.
  5: (seed) => {
    const stage = getCpuStage(5)!;
    return decorateCases(
      [
        { a: 3, b: 4 },
        { a: 7, b: 5 },
      ].map(({ a, b }) => ({
        name: `${a} × ${b}`,
        category: "multiply",
        initMem: mem({ 12: 1, 13: a, 14: b }),
        expectBranchTaken: true,
        expect: { mem: mem({ 15: (a * b) & 0xf }), cycles: 64 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // X2: same sum loop with a tight 5N+4 budget.
  6: (seed) => {
    const stage = getCpuStage(6)!;
    return decorateCases(
      [3, 5].map((n) => ({
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

  // X3: result + a fetch into a written cell.
  7: (seed) => {
    const stage = getCpuStage(7)!;
    return decorateCases(
      [
        { a: 2, b: 3 },
        { a: 4, b: 1 },
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

export function publicCasesFor(stageIndex: number, seed: number): CpuCase[] {
  return CASES[stageIndex]?.(seed) ?? [];
}
