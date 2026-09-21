/**
 * Deterministic integer PRNG (mulberry32). Same seed → same sequence in every
 * engine; used for sprite variant selection. No Math.random anywhere in the
 * lab — generation must be reproducible bit-for-bit across browser and Node.
 */

export type Rng = () => number;

/** Returns a stream of uint32 values. */
export function makeRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** Inclusive integer in [lo, hi]. */
export function rngInt(rng: Rng, lo: number, hi: number): number {
  return lo + (rng() % (hi - lo + 1));
}

/** Seeded Fisher–Yates over a fresh index array. */
export function rngShuffleIndices(rng: Rng, length: number): number[] {
  const order = Array.from({ length }, (_v, i) => i);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = rng() % (i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}
