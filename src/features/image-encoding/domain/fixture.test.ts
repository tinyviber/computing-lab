import { describe, expect, it } from "vitest";
import { getImageFixture } from "./fixture";
import { deriveImageEncodingModel, type RGB } from "./model";

function pixelAt(x: number, y: number): RGB {
  const photo = getImageFixture("photo");
  const pixel = photo.pixels[y * photo.width + x];
  if (!pixel) throw new Error(`Missing photo pixel at (${x}, ${y})`);
  return pixel;
}

function channelRange(color: RGB): number {
  return Math.max(color.r, color.g, color.b) - Math.min(color.r, color.g, color.b);
}

function colorKey(color: RGB): string {
  return `${color.r},${color.g},${color.b}`;
}

function adjacentPairs() {
  const photo = getImageFixture("photo");
  const pairs: Array<[RGB, RGB]> = [];
  for (let y = 0; y < photo.height; y += 1) {
    for (let x = 0; x < photo.width; x += 1) {
      const current = photo.pixels[y * photo.width + x];
      if (!current) continue;
      const right = photo.pixels[y * photo.width + x + 1];
      const below = photo.pixels[(y + 1) * photo.width + x];
      if (x + 1 < photo.width && right) pairs.push([current, right]);
      if (y + 1 < photo.height && below) pairs.push([current, below]);
    }
  }
  return pairs;
}

function colorDistance(first: RGB, second: RGB): number {
  return Math.abs(first.r - second.r) + Math.abs(first.g - second.g) + Math.abs(first.b - second.b);
}

describe("photo image fixture", () => {
  it("is a deterministic 240 by 160 RGB raster with stable pixel signatures", () => {
    const photo = getImageFixture("photo");

    expect(photo).toMatchObject({
      id: "photo",
      sourceKind: "fixture",
      width: 240,
      height: 160,
    });
    expect(photo.pixels).toHaveLength(240 * 160);
    expect([
      pixelAt(0, 0),
      pixelAt(0, 12),
      pixelAt(10, 15),
      pixelAt(24, 13),
      pixelAt(5, 19),
      pixelAt(47, 31),
    ]).toEqual([
      { r: 127, g: 124, b: 119 },
      { r: 133, g: 124, b: 121 },
      { r: 133, g: 125, b: 120 },
      { r: 134, g: 126, b: 120 },
      { r: 133, g: 126, b: 120 },
      { r: 139, g: 130, b: 123 },
    ]);
  });

  it("keeps every channel in RGB range and preserves compositional signals", () => {
    const photo = getImageFixture("photo");
    const allChannels = photo.pixels.flatMap(({ r, g, b }) => [r, g, b]);
    expect(
      allChannels.every((value) => Number.isInteger(value) && value >= 0 && value <= 255),
    ).toBe(true);

    const colorCounts = new Map<string, number>();
    for (const pixel of photo.pixels) {
      const key = colorKey(pixel);
      colorCounts.set(key, (colorCounts.get(key) ?? 0) + 1);
    }
    expect(colorCounts.size).toBeGreaterThan(1000);
    expect(Math.max(...colorCounts.values())).toBeLessThanOrEqual(1000);

    const skyColumn = Array.from({ length: 13 }, (_, y) => pixelAt(0, y));
    expect(new Set(skyColumn.map((pixel) => pixel.b)).size).toBeGreaterThanOrEqual(4);
    expect(Math.max(...skyColumn.map((pixel) => pixel.b))).toBeGreaterThan(
      Math.min(...skyColumn.map((pixel) => pixel.b)),
    );

    const contrastPixels = photo.pixels.filter((pixel) => channelRange(pixel) >= 40);
    expect(contrastPixels.length).toBeGreaterThanOrEqual(150);

    const pairs = adjacentPairs();
    expect(
      pairs.filter(([first, second]) => colorDistance(first, second) >= 80).length,
    ).toBeGreaterThan(100);
    expect(
      pairs.filter(([first, second]) => colorDistance(first, second) >= 5).length,
    ).toBeGreaterThan(500);
  });

  it("makes the 25%/100% sampling and 2-bit/8-bit trade-offs observable", () => {
    const photo = getImageFixture("photo");
    const sample25 = deriveImageEncodingModel(photo, {
      samplingPercent: 25,
      bitDepth: 8,
      phase: 0,
    });
    const sample100 = deriveImageEncodingModel(photo, {
      samplingPercent: 100,
      bitDepth: 8,
      phase: 0,
    });
    const bits2 = deriveImageEncodingModel(photo, {
      samplingPercent: 100,
      bitDepth: 2,
      phase: 0,
    });
    const bits8 = deriveImageEncodingModel(photo, {
      samplingPercent: 100,
      bitDepth: 8,
      phase: 0,
    });
    const original = deriveImageEncodingModel(photo, {
      samplingPercent: 100,
      bitDepth: 4,
      colorMode: "rgb24",
      phase: 0,
    });

    expect(sample25.sampled).toMatchObject({ width: 60, height: 40 });
    expect(sample100.sampled).toMatchObject({ width: 240, height: 160 });
    expect(sample25.rawPayload.bits).toBeLessThan(sample100.rawPayload.bits);
    expect(sample25.averageError).toBeGreaterThan(sample100.averageError);

    expect(bits2.quantized.palette).toHaveLength(4);
    expect(bits8.quantized.palette).toHaveLength(256);
    expect(bits2.rawPayload.bits).toBeLessThan(bits8.rawPayload.bits);
    expect(bits2.averageQuantizationError).toBeGreaterThan(bits8.averageQuantizationError);
    expect(original.quantized.bitDepth).toBe(24);
    expect(original.averageError).toBe(0);
    expect(original.changedPixelCount).toBe(0);
    expect(original.reconstructed.pixels).toEqual(photo.pixels);
  });
});
