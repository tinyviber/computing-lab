/**
 * Distances between two same-sized binary images.
 *
 * - hamming: count of cells that differ — the actual verdict signal, since a
 *   query from the closed gallery always compresses to a bitwise-identical
 *   copy of its own entry. "Unique exact match" is the honest criterion.
 * - chamferSym: symmetric mean nearest-ink distance (squared Euclidean,
 *   integer accumulation, one division at the end). Only used to rank the
 *   near-miss list shown to the student — never to decide pass/fail, so its
 *   float result is display-only.
 */

import type { BinaryImage } from "./bitmap.ts";

export function hamming(a: BinaryImage, b: BinaryImage): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("hamming requires equal dimensions");
  }
  let diff = 0;
  for (let i = 0; i < a.cells.length; i += 1) diff += a.cells[i] !== b.cells[i] ? 1 : 0;
  return diff;
}

function inkPositions(image: BinaryImage): number[] {
  const out: number[] = [];
  for (let i = 0; i < image.cells.length; i += 1) {
    if (image.cells[i]) out.push(i);
  }
  return out;
}

/** Mean of min squared distances from each ink cell of a to ink of b. */
function directedChamfer(a: BinaryImage, b: BinaryImage): number {
  const pa = inkPositions(a);
  if (pa.length === 0) return 0;
  const pb = inkPositions(b);
  if (pb.length === 0) return a.width * a.width + a.height * a.height;
  const bx = new Int32Array(pb.length);
  const by = new Int32Array(pb.length);
  for (let i = 0; i < pb.length; i += 1) {
    bx[i] = pb[i] % b.width;
    by[i] = (pb[i] / b.width) | 0;
  }
  let sum = 0;
  for (const idx of pa) {
    const x = idx % a.width;
    const y = (idx / a.width) | 0;
    let best = Infinity;
    for (let j = 0; j < pb.length; j += 1) {
      const dx = x - bx[j];
      const dy = y - by[j];
      const d2 = dx * dx + dy * dy;
      if (d2 < best) best = d2;
    }
    sum += best;
  }
  return sum / pa.length;
}

export function chamferSym(a: BinaryImage, b: BinaryImage): number {
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error("chamfer requires equal dimensions");
  }
  return (directedChamfer(a, b) + directedChamfer(b, a)) / 2;
}
