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
  // M1: fixed watch-it-go program — copy M[14] (拨码开关) → A → M[15] (数码管).
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

  // M2: same fixed copy as M1 but reading the M[11] 拨码开关 — the stage is
  // about decoding a byte, not authoring, so the output is the fixed M[15].
  2: (seed) => {
    const stage = getCpuStage(2)!;
    return decorateCases(
      [5, 9].map((v) => ({
        name: `M[11] = ${v}`,
        category: "basic",
        initMem: mem({ 11: v }),
        expect: { regs: { A: v }, mem: mem({ 15: v }), cycles: 4 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // M3: LOAD → ADD → STORE — A reads the switch, ALU adds M[11], result to
  // the 数码管; the second case carries so the 第5位灯 lights up.
  3: (seed) => {
    const stage = getCpuStage(3)!;
    return decorateCases(
      [
        { a: 3, b: 5 },
        { a: 9, b: 8 },
      ].map(({ a, b }) => ({
        name: `M[14]=${a}, M[11]=${b}`,
        category: a + b > 15 ? "carry" : "basic",
        initMem: mem({ 11: b, 14: a }),
        expect: { regs: { A: (a + b) & 0xf }, mem: mem({ 15: (a + b) & 0xf }), cycles: 5 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // 支线·丢失的一条指令: fill the missing STORE — same copy contract.
  4: (seed) => {
    const stage = getCpuStage(4)!;
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

  // 支线·数据说了算: JZ target — both directions of the branch shown
  // publicly. M[15] starts nonzero so a run that skips STORE can't pass.
  5: (seed) => {
    const stage = getCpuStage(5)!;
    return decorateCases(
      [0, 3].map((a) => ({
        name: `A = ${a}`,
        category: a === 0 ? "zero" : "nonzero",
        initMem: mem({ 15: 6 }),
        initRegs: { A: a },
        expectBranchTaken: a === 0,
        expect: { regs: { B: a === 0 ? 0 : 1 }, mem: mem({ 15: a === 0 ? 0 : 1 }), cycles: 6 },
      })),
      seed,
      stage.decoyCells,
    );
  },

  // 支线·回到过去: countdown loop — B walks to 0 through M[14], then halts.
  6: (seed) => {
    const stage = getCpuStage(6)!;
    return decorateCases(
      [3, 1].map((n) => ({
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

  // X1: equality branch — both directions shown publicly.
  7: (seed) => {
    const stage = getCpuStage(7)!;
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

  // X2: 1+…+N.
  8: (seed) => {
    const stage = getCpuStage(8)!;
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

  // X3: software multiply.
  9: (seed) => {
    const stage = getCpuStage(9)!;
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

  // X4: same sum loop with a tight 5N+4 budget.
  10: (seed) => {
    const stage = getCpuStage(10)!;
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

  // X5: result + a fetch into a written cell.
  11: (seed) => {
    const stage = getCpuStage(11)!;
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
