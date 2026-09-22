/**
 * Quantization rules for the color-quantization lab.
 *
 * A *mapping table* assigns every source ink color (palette index 1..14) to
 * either a toner cartridge (absolute index 0..7 into TONER_RACK) or paper
 * white (-1). The printer's built-in rule is nearest-toner under squared
 * euclidean distance with paper always available; paper wins ties and toner
 * order decides ties between toners — the rule is fixed and identical in
 * the browser preview, the Python helpers, and the server judge.
 */

import { colorDist2, PAPER, SOURCE_COLORS, TONER_RACK } from "./palette.ts";
import type { IndexedImage } from "./indexed.ts";

/** Mapping-table target meaning "leave it as paper". */
export const TO_PAPER = -1;

export const SOURCE_COLOR_COUNT = SOURCE_COLORS.length;
export const TONER_COUNT = TONER_RACK.length;

/** Min/max a table entry may take. */
export const MIN_TABLE_VALUE = TO_PAPER;
export const MAX_TABLE_VALUE = TONER_COUNT - 1;

/**
 * The printer's default mapping for a loaded subset: each source color goes
 * to its nearest loaded toner, or paper (-1) if paper is nearest. `loaded`
 * holds absolute toner indices; returned entries are absolute toner indices
 * or -1.
 */
export function nnTable(loaded: readonly number[]): number[] {
  const loadedRgb = loaded.map((i) => TONER_RACK[i].rgb);
  return SOURCE_COLORS.map((s) => {
    let best = TO_PAPER;
    let bestD = colorDist2(s.rgb, PAPER);
    for (let i = 0; i < loadedRgb.length; i += 1) {
      const d = colorDist2(s.rgb, loadedRgb[i]);
      if (d < bestD) {
        bestD = d;
        best = loaded[i];
      }
    }
    return best;
  });
}

/**
 * Print an image under a mapping table: source cells 1..14 become
 * `table[src-1] + 1` in toner space (0 = paper, 1..8 = toner). Paper stays
 * paper.
 */
export function quantizeImage(image: IndexedImage, table: readonly number[]): IndexedImage {
  const out = new Uint8Array(image.cells.length);
  for (let i = 0; i < image.cells.length; i += 1) {
    const src = image.cells[i];
    out[i] = src === 0 ? 0 : table[src - 1] + 1;
  }
  return { width: image.width, height: image.height, cells: out };
}

/** Distinct toner indices a table actually uses (paper excluded). */
export function usedToners(table: readonly number[]): number[] {
  return [...new Set(table.filter((v) => v >= 0))].sort((a, b) => a - b);
}

/** How many entries differ from the printer's default table. */
export function countOverrides(table: readonly number[], reference: readonly number[]): number {
  let n = 0;
  for (let i = 0; i < reference.length; i += 1) {
    if (table[i] !== reference[i]) n += 1;
  }
  return n;
}

/**
 * Sanitize a submitted toner subset (pick mode): integers inside the rack,
 * deduplicated, ascending. Returns null on malformed input. Over-budget
 * subsets are still valid here — the judge reports the budget violation.
 */
export function sanitizeSubset(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v >= TONER_COUNT) return null;
    if (!out.includes(v)) out.push(v);
  }
  out.sort((a, b) => a - b);
  return out;
}

/**
 * Sanitize a submitted mapping table (free mode): exactly one entry per
 * source color, each a valid toner index or -1. Returns null otherwise.
 */
export function sanitizeTable(raw: unknown): number[] | null {
  if (!Array.isArray(raw) || raw.length !== SOURCE_COLOR_COUNT) return null;
  const out: number[] = [];
  for (const v of raw) {
    if (
      typeof v !== "number" ||
      !Number.isInteger(v) ||
      v < MIN_TABLE_VALUE ||
      v > MAX_TABLE_VALUE
    ) {
      return null;
    }
    out.push(v);
  }
  return out;
}
