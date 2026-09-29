/**
 * Deterministic per-user payload generation. `seed = hash(userId | labId |
 * stageIndex)` so every student decodes a different note/sentence/image —
 * answers can't be copied between seats, which is what "hidden input" means
 * for a decoding lab (the payload must be visible to be decoded).
 *
 * Self-contained copy of the mulberry32 stream used by the other labs;
 * duplicating ~15 lines keeps decoding from importing another feature's code.
 */

export function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function seedFor(userId: string, labId: string, stageIndex: number): number {
  return fnv1a(`${userId}|${labId}|${stageIndex}`);
}

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
