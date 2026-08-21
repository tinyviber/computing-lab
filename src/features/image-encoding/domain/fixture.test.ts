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
  it("is a deterministic 48 by 32 RGB raster with stable pixel signatures", () => {
    const photo = getImageFixture("photo");

    expect(photo).toMatchObject({
      id: "photo",
      sourceKind: "fixture",
      width: 48,
      height: 32,
    });
    expect(photo.pixels).toHaveLength(48 * 32);
    expect([
      pixelAt(0, 0),
      pixelAt(0, 12),
      pixelAt(10, 15),
      pixelAt(24, 13),
      pixelAt(5, 19),
      pixelAt(47, 31),
    ]).toEqual([
      { r: 102, g: 66, b: 53 },
      { r: 9, g: 1, b: 2 },
      { r: 99, g: 67, b: 58 },
      { r: 230, g: 243, b: 254 },
      { r: 17, g: 11, b: 8 },
      { r: 146, g: 121, b: 105 },
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
    expect(Math.max(...colorCounts.values())).toBeLessThanOrEqual(20);

    const skyColumn = Array.from({ length: 13 }, (_, y) => pixelAt(0, y));
    expect(new Set(skyColumn.map((pixel) => pixel.b)).size).toBeGreaterThanOrEqual(8);
    expect(skyColumn[0]?.b).toBeGreaterThan(skyColumn.at(-1)?.b ?? 0);

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

    expect(sample25.sampled).toMatchObject({ width: 12, height: 8 });
    expect(sample100.sampled).toMatchObject({ width: 48, height: 32 });
    expect(sample25.rawPayload.bits).toBeLessThan(sample100.rawPayload.bits);
    expect(sample25.averageError).toBeGreaterThan(sample100.averageError);

    expect(bits2.quantized.palette).toHaveLength(4);
    expect(bits8.quantized.palette).toHaveLength(256);
    expect(bits2.rawPayload.bits).toBeLessThan(bits8.rawPayload.bits);
    expect(bits2.averageQuantizationError).toBeGreaterThan(bits8.averageQuantizationError);
  });
});
