/**
 * Deterministic PRNG helpers shared across labs. Same seed → same stream in
 * every engine; generation must be reproducible bit-for-bit across browser
 * and Node. No Math.random anywhere — judges replay the same stream.
 */

/** A float stream in [0, 1) — used by seeded decorators (cpu, is-sim, ai-eval). */
export type Rng = () => number;
/** A raw uint32 stream — used by integer samplers (sprite labs). */
export type Uint32Rng = () => number;

export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Per-user seed: `hash(userId | labId | stageIndex | caseName)` so every
 * student's public cases and hidden set share one decoration pattern but
 * different numbers — rehearsing on the public cases teaches the same
 * behaviour the hidden cases verify, without the hidden numbers being
 * guessable.
 */
export function seedFor(
  userId: string,
  labId: string,
  stageIndex: number,
  caseName?: string,
): number {
  const parts = `${userId}|${labId}|${stageIndex}`;
  return fnv1a(caseName === undefined ? parts : `${parts}|${caseName}`);
}

/** mulberry32 — raw uint32 stream. */
export function makeUint32Rng(seed: number): Uint32Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

/** mulberry32 — float stream in [0, 1). */
export function makeRng(seed: number): Rng {
  const next = makeUint32Rng(seed);
  return () => next() / 4294967296;
}

/** Inclusive integer in [lo, hi]. */
export function rngInt(rng: Uint32Rng, lo: number, hi: number): number {
  return lo + (rng() % (hi - lo + 1));
}

/** Seeded Fisher–Yates over a fresh index array. */
export function rngShuffleIndices(rng: Uint32Rng, length: number): number[] {
  const order = Array.from({ length }, (_v, i) => i);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = rng() % (i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}
