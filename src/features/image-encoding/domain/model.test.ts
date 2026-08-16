import { describe, expect, it } from "vitest";
import {
  SOURCE_COLORS,
  SOURCE_HEIGHT,
  SOURCE_WIDTH,
  buildPalette,
  buildPixelGrid,
  calculateEncodingStats,
  quantizeColorToPalette,
  sampleImage,
  snapColor,
} from "./model";

describe("image encoding domain model", () => {
  it("keeps the canonical source palette", () => {
    expect(SOURCE_COLORS).toHaveLength(16);
    expect(SOURCE_COLORS.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
  });

  it.each([
    [2, 2, { sampledPixels: 4, encodedBits: 8, encodedBytes: 1, paletteLevels: 4 }],
    [4, 8, { sampledPixels: 16, encodedBits: 128, encodedBytes: 16, paletteLevels: 256 }],
    [8, 8, { sampledPixels: 64, encodedBits: 512, encodedBytes: 64, paletteLevels: 256 }],
  ])("uses sampled pixels × bits formula for density %i and %i bits", (density, bits, expected) => {
    expect(calculateEncodingStats({ density, bits })).toMatchObject(expected);
  });

  it.each([2, 4, 8])("expands sampled output to a real %i×%i grid", (density) => {
    const grid = buildPixelGrid({ density, bits: 8 });

    expect(grid).toHaveLength(density * density);
    expect(grid.map(({ row, col }) => `${row}:${col}`)).toEqual(
      Array.from({ length: density * density }, (_, index) => {
        const row = Math.floor(index / density);
        const col = index % density;
        return `${row}:${col}`;
      }),
    );
  });

  it.each([
    [2, [2, 6]],
    [4, [1, 3, 5, 7]],
    [8, [0, 1, 2, 3, 4, 5, 6, 7]],
  ] as const)("uses center-nearest source coordinates for density %i", (density, expectedRows) => {
    const samples = sampleImage(density);
    expect(samples).toHaveLength(density * density);
    expect(samples.filter((sample) => sample.col === 0).map((sample) => sample.sourceRow)).toEqual(
      expectedRows,
    );
    expect(samples.filter((sample) => sample.row === 0).map((sample) => sample.sourceCol)).toEqual(
      expectedRows,
    );
  });

  it("clamps input at domain boundary and rounds byte size up", () => {
    expect(calculateEncodingStats({ density: 1, bits: 1 })).toMatchObject({
      sampledPixels: 4,
      quantizationBits: 2,
      encodedBits: 8,
      encodedBytes: 1,
    });
    expect(calculateEncodingStats({ density: 3, bits: 5 }).encodedBytes).toBe(6);
    expect(calculateEncodingStats({ density: 3, bits: 5 }).encodedBits).toBe(45);
  });

  it("uses raw source size only as an explicit comparison baseline", () => {
    expect(calculateEncodingStats({ density: 4, bits: 8 }).rawSourceBits).toBe(
      SOURCE_WIDTH * SOURCE_HEIGHT * 24,
    );
    expect(calculateEncodingStats({ density: 4, bits: 8 }).rawSourceBits).toBe(1536);
    expect(calculateEncodingStats({ density: 4, bits: 8 }).encodedBits).toBe(128);
    expect(calculateEncodingStats({ density: 4, bits: 8 }).encodedBytes).toBe(16);
  });

  it("rounds theoretical pixel-payload comparison to one decimal", () => {
    expect(calculateEncodingStats({ density: 4, bits: 8 }).theoreticalPixelPayloadComparison).toBe(
      12,
    );
    expect(calculateEncodingStats({ density: 3, bits: 5 }).theoreticalPixelPayloadComparison).toBe(
      34.1,
    );
  });

  it.each(["#000000", "#FFFFFF"])(
    "maps %s to a valid indexed palette entry at full 8-bit depth",
    (color) => {
      const palette = buildPalette(8);
      const { paletteIndex, displayColor } = quantizeColorToPalette(color, 8);

      expect(Number.isInteger(paletteIndex)).toBe(true);
      expect(paletteIndex).toBeGreaterThanOrEqual(0);
      expect(paletteIndex).toBeLessThan(palette.length);
      expect(displayColor).toBe(palette[paletteIndex]);
    },
  );

  it("builds a deterministic indexed palette from canonical source colors", () => {
    expect(buildPalette(2)).toEqual(["#17212B", "#7C9EB2", "#E4B84A", "#DCE7EF"]);
    expect(buildPalette(8)).toEqual(buildPalette(8));
  });

  it.each([
    ["#2E6F95", 2, 1, "#7C9EB2"],
    ["#2e6f95", 2, 1, "#7C9EB2"],
    ["#B0AB7E", 2, 1, "#7C9EB2"],
    ["#17212B", 8, 0, "#17212B"],
  ] as const)(
    "selects the nearest indexed palette entry for %s at %i bits",
    (source, bits, paletteIndex, displayColor) => {
      expect(quantizeColorToPalette(source, bits)).toEqual({ paletteIndex, displayColor });
    },
  );

  it("uses the lower palette index for an exact nearest-distance tie", () => {
    expect(quantizeColorToPalette("#B0AB7E", 2)).toMatchObject({
      paletteIndex: 1,
      displayColor: "#7C9EB2",
    });
  });

  it("keeps every representative quantized color addressable in its indexed palette", () => {
    const representativeColors = ["#000000", "#FFFFFF", "#B0AB7E", "#123456", "#2E6F95"];

    for (let bits = 2; bits <= 8; bits += 1) {
      const palette = buildPalette(bits);

      for (const color of representativeColors) {
        const { paletteIndex, displayColor } = quantizeColorToPalette(color, bits);

        expect(Number.isInteger(paletteIndex)).toBe(true);
        expect(paletteIndex).toBeGreaterThanOrEqual(0);
        expect(paletteIndex).toBeLessThan(palette.length);
        expect(paletteIndex).toBeLessThan(2 ** bits);
        expect(displayColor).toBe(palette[paletteIndex]);
      }
    }

    const fullDepthPalette = buildPalette(8);
    const fullDepthWhite = quantizeColorToPalette("#FFFFFF", 8);
    expect(fullDepthWhite.paletteIndex).not.toBe(16777215);
    expect(fullDepthWhite.paletteIndex).toBeGreaterThanOrEqual(0);
    expect(fullDepthWhite.paletteIndex).toBeLessThan(fullDepthPalette.length);
    expect(fullDepthWhite.displayColor).toBe(fullDepthPalette[fullDepthWhite.paletteIndex]);
  });

  it("renders a real density × density sampled grid", () => {
    const grid = buildPixelGrid({ density: 3, bits: 4 });
    expect(grid).toHaveLength(9);
    expect(grid.at(-1)).toMatchObject({ row: 2, col: 2, sampleIndex: 9 });
    expect(grid[0].displayColor).toBe(snapColor(grid[0].sourceColor, 4));
  });

  it("is deterministic and keeps stable sample indices across repeated calls", () => {
    const options = { density: 4, bits: 3 };

    expect(buildPixelGrid(options)).toEqual(buildPixelGrid(options));
    expect(buildPixelGrid(options).map((pixel) => pixel.sampleIndex)).toEqual(
      Array.from({ length: 16 }, (_, index) => index + 1),
    );
  });
});
