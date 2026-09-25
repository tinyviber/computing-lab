/**
 * Case-building helpers shared by the browser's public cases and the
 * server's hidden set. Both sides call `decorateInitMem` with the same
 * per-user seed, so public and hidden cases exercise identical machine
 * behaviour — only the decoy numbers differ.
 */

import type { CpuCase } from "./machine.ts";
import { makeRng } from "./rng.ts";

/**
 * Sprinkle seeded decoy values into the stage's `decoyCells` pool: about
 * half the pool gets a nonzero value. A correct program never touches
 * these cells; a program that writes outside its contract corrupts one
 * and fails the full-memory compare.
 */
export function decorateInitMem(
  initMem: Record<number, number>,
  seed: number,
  caseIndex: number,
  decoyCells: readonly number[],
): Record<number, number> {
  const rng = makeRng((seed + caseIndex * 0x9e3779b9) >>> 0);
  const out = { ...initMem };
  for (const addr of decoyCells) {
    if (addr in out) continue;
    if (rng() < 0.55) out[addr] = 1 + Math.floor(rng() * 15);
  }
  return out;
}

/** Decorate every case of a list in order (deterministic per seed). */
export function decorateCases(
  cases: readonly CpuCase[],
  seed: number,
  decoyCells: readonly number[],
): CpuCase[] {
  return cases.map((testCase, i) => ({
    ...testCase,
    initMem: decorateInitMem(testCase.initMem, seed, i, decoyCells),
  }));
}
