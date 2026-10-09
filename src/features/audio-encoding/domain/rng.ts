/**
 * Deterministic integer PRNG (mulberry32) plus the FNV-1a string hash used
 * to derive per-student seeds. Same seed → same sequence in every engine —
 * the browser preview and the server judge must regenerate identical
 * signals, so nothing here may depend on Math.random or Date.now.
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

/** Float in [0, 1). */
export function rngFloat(rng: Rng): number {
  return rng() / 0x100000000;
}

/** FNV-1a 32-bit hash of a string — stable across engines. */
export function hashSeed(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
