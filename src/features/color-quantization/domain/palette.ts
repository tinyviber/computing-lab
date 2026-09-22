/**
 * Color data for the color-quantization lab.
 *
 * The printer story: source artwork uses a fixed 14-color ink palette; the
 * toner printer has a rack of 8 physical toner colors plus paper white,
 * which is always "loaded" for free. Quantization maps each source color to
 * one loaded toner — two distinct source colors that land on the same toner
 * become indistinguishable in the print.
 *
 * Source colors were chosen so several sit on the Voronoi boundary between
 * two toners: separating such a pair costs *both* toners' slots.
 */

export type RGB = [number, number, number];

export type ColorDef = { name: string; rgb: RGB };

/** Paper color — index 0 in every indexed image ("no ink"). */
export const PAPER: RGB = [245, 245, 240];

/**
 * The 14 source ink colors (palette indices 1–14 in IndexedImage cells).
 * Anchors sit squarely on one toner; "straddlers" sit between two toners so
 * the nearest-toner choice is genuinely contested.
 */
export const SOURCE_COLORS: ColorDef[] = [
  { name: "crimson", rgb: [198, 34, 40] },
  { name: "brick", rgb: [208, 102, 48] },
  { name: "tangerine", rgb: [232, 132, 32] },
  { name: "amber", rgb: [236, 170, 40] },
  { name: "gold", rgb: [228, 214, 66] },
  { name: "leaf", rgb: [62, 158, 72] },
  { name: "seafoam", rgb: [52, 168, 148] },
  { name: "teal", rgb: [40, 152, 168] },
  { name: "sky", rgb: [70, 148, 210] },
  { name: "azure", rgb: [56, 96, 208] },
  { name: "violet", rgb: [128, 64, 184] },
  { name: "wine", rgb: [170, 60, 100] },
  { name: "charcoal", rgb: [54, 56, 64] },
  { name: "navy", rgb: [50, 70, 140] },
];

/** The physical toner rack — 8 cartridges the printer can hold. */
export const TONER_RACK: ColorDef[] = [
  { name: "black", rgb: [42, 42, 48] },
  { name: "red", rgb: [212, 44, 42] },
  { name: "orange", rgb: [236, 140, 34] },
  { name: "yellow", rgb: [238, 214, 60] },
  { name: "green", rgb: [58, 176, 76] },
  { name: "cyan", rgb: [46, 178, 196] },
  { name: "blue", rgb: [56, 92, 214] },
  { name: "magenta", rgb: [168, 64, 160] },
];

/**
 * Toner-space cell value for "paper shows through". Quantized images store
 * `tonerIndex + 1`, so PAPER_CELL = 0 and toner i renders as cell i + 1.
 */
export const PAPER_CELL = 0;

/** Squared euclidean distance in RGB — integer math, identical everywhere. */
export function colorDist2(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

export function rgbCss(rgb: RGB): string {
  return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
}

/** Display colors for source-space cells: index 0 = paper, i = SOURCE_COLORS[i-1]. */
export function sourceCellCss(cell: number): string {
  return cell === 0 ? rgbCss(PAPER) : rgbCss(SOURCE_COLORS[cell - 1].rgb);
}

/** Display colors for toner-space cells: index 0 = paper, i = TONER_RACK[i-1]. */
export function tonerCellCss(cell: number): string {
  return cell === 0 ? rgbCss(PAPER) : rgbCss(TONER_RACK[cell - 1].rgb);
}
