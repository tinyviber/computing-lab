/**
 * Seeded 8×8 pictures for the BMP stages. Each sprite is a hand-drawn 1-bit
 * glyph colored by a seeded palette — small enough to keep the BMP simple,
 * recognizable enough that a wrong decoder is visibly wrong.
 *
 * The "asciiSafe" variant constrains every channel to printable ASCII codes
 * (65–90): text-decoding such a file yields letter-soup that *looks* almost
 * like text — that's the stage-4 "both decoders run, only the metadata knows"
 * case.
 */

import type { Pixel, PixelMatrix } from "./bmp.ts";

export const SPRITE_SIZE = 8;

const GLYPHS: readonly (readonly string[])[] = [
  ["..##..##", ".######.", "########", "########", ".######.", "..####..", "...##...", "........"],
  ["...##...", "...##...", ".######.", "########", ".######.", "..####..", ".#....#.", "##....##"],
  ["..###...", ".#...#..", ".#...#..", "..###...", "...#....", "...#.#..", "...#....", "...##..."],
  ["...##...", "..####..", "..####..", ".######.", ".######.", "#.####.#", "#..##..#", ".#....#."],
  ["..####..", ".#....#.", ".#....#.", "########", "##.##.##", "##.##.##", "########", "########"],
  ["..####..", ".#....#.", "#.####.#", "#.####.#", "#.####.#", ".#....#.", "..####..", ".....##."],
  ["...#....", "....#...", ".....#..", "########", "########", ".....#..", "....#...", "...#...."],
  ["....##..", "...##...", "..##....", ".#####..", "...##...", "..##....", ".##.....", "##......"],
];

type Palette = { bg: Pixel; ink: Pixel };

const PALETTES: readonly Palette[] = [
  { bg: [248, 250, 252], ink: [37, 99, 235] },
  { bg: [255, 247, 237], ink: [234, 88, 12] },
  { bg: [240, 253, 244], ink: [22, 163, 74] },
  { bg: [250, 245, 255], ink: [147, 51, 234] },
  { bg: [255, 241, 242], ink: [225, 29, 72] },
  { bg: [254, 252, 232], ink: [161, 98, 7] },
  { bg: [236, 254, 255], ink: [8, 145, 178] },
  { bg: [30, 41, 59], ink: [250, 204, 21] },
];

/** Every channel in [65, 90] — printable ASCII, but only letter-soup. */
const ASCII_SAFE_PALETTES: readonly Palette[] = [
  { bg: [66, 68, 70], ink: [90, 88, 87] },
  { bg: [90, 66, 68], ink: [70, 73, 76] },
  { bg: [65, 70, 85], ink: [88, 89, 90] },
  { bg: [90, 88, 66], ink: [66, 70, 72] },
];

/**
 * The fixed cat every BMP stage decodes. One recognizable target gives the
 * decode a concrete goal and makes channel-order and row-order bugs visible
 * at a glance — a wrong decoder can't accidentally look like a cat.
 */
const CAT_GLYPH: readonly string[] = [
  "..#..#..",
  ".##..##.",
  ".######.",
  ".#.##.#.",
  ".######.",
  "..####..",
  ".######.",
  "..#..#..",
];

export function catPixels(): PixelMatrix {
  const bg: Pixel = [255, 247, 237];
  const ink: Pixel = [234, 88, 12];
  return CAT_GLYPH.map((row) => [...row].map((ch) => [...(ch === "#" ? ink : bg)] as Pixel));
}

export function spritePixels(
  rng: () => number,
  options: { asciiSafe?: boolean } = {},
): PixelMatrix {
  const glyph = GLYPHS[Math.floor(rng() * GLYPHS.length)];
  const palette = (options.asciiSafe ? ASCII_SAFE_PALETTES : PALETTES)[
    Math.floor(rng() * (options.asciiSafe ? ASCII_SAFE_PALETTES : PALETTES).length)
  ];
  return glyph.map((row) =>
    [...row].map((ch) => [...(ch === "#" ? palette.ink : palette.bg)] as Pixel),
  );
}
