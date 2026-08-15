import { describe, expect, it } from "vitest";
import {
  SOURCE_COLORS,
  buildPixelGrid,
  calculateEncodingStats,
  snapColor,
} from "./model";

describe("image encoding domain model", () => {
  it("keeps the source palette in the specified order and canonical format", () => {
    expect(SOURCE_COLORS).toEqual([
      "#2E6F95",
      "#6EA5C4",
      "#D9A441",
      "#A9C7D6",
      "#4C9FBE",
      "#8AC1D1",
      "#E4B84A",
      "#D47B42",
      "#A8D5BA",
      "#4C9FBE",
      "#17212B",
      "#F0C36A",
      "#7C9EB2",
      "#DCE7EF",
      "#E4B84A",
      "#4C9FBE",
    ]);
    expect(SOURCE_COLORS.every((color) => /^#[0-9A-F]{6}$/.test(color))).toBe(true);
  });

  it.each([
    [2, 2, { sampledPixels: 4, fileSize: 6, quality: 67, error: 33, ratio: 341.3 }],
    [4, 8, { sampledPixels: 16, fileSize: 96, quality: 92, error: 8, ratio: 21.3 }],
    [8, 8, { sampledPixels: 64, fileSize: 384, quality: 100, error: 0, ratio: 5.3 }],
    [8, 2, { sampledPixels: 64, fileSize: 96, quality: 100, error: 0, ratio: 21.3 }],
  ])(
    "calculates exact stats for density %i and %i bits",
    (density, bits, expected) => {
      expect(calculateEncodingStats({ density, bits })).toEqual(expected);
    },
  );

  it("uses the specified file, quality, error, and ratio formulas", () => {
    expect(calculateEncodingStats({ density: 3, bits: 5 })).toEqual({
      sampledPixels: 9,
      fileSize: 34,
      quality: 79,
      error: 21,
      ratio: 60.2,
    });
  });

  it("snaps each channel to 2^bits palette levels and returns uppercase hex", () => {
    expect(snapColor("#2E6F95", 2)).toBe("#5555AA");
    expect(snapColor("#2e6f95", 2)).toBe("#5555AA");
    expect(snapColor("#2E6F95", 8)).toBe("#2E6F95");
    expect(snapColor("#F0C36A", 2)).toBe("#FFAA55");
  });

  it("builds a fixed 4x4 grid with density-based sample indices", () => {
    const grid = buildPixelGrid({ density: 2, bits: 2 });

    expect(grid).toHaveLength(16);
    expect(grid.map(({ row, col }) => [row, col])).toEqual(
      Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 4 }, (_, col) => [row, col]),
      ).flat(),
    );
    expect(grid.map(({ sampleIndex }) => sampleIndex)).toEqual([
      1, 2, 3, 4,
      1, 2, 3, 4,
      1, 2, 3, 4,
      1, 2, 3, 4,
    ]);
    expect(grid[0]).toEqual({
      row: 0,
      col: 0,
      sourceColor: "#2E6F95",
      displayColor: "#5555AA",
      sampleIndex: 1,
    });
  });

  it("keeps the grid fixed at 16 cells while sampling the full density range", () => {
    const grid = buildPixelGrid({ density: 8, bits: 8 });

    expect(grid).toHaveLength(16);
    expect(grid[0]).toMatchObject({
      sourceColor: "#2E6F95",
      displayColor: "#2E6F95",
      sampleIndex: 1,
    });
    expect(grid[15]).toMatchObject({
      sourceColor: "#4C9FBE",
      displayColor: "#4C9FBE",
      sampleIndex: 16,
    });
  });
});
