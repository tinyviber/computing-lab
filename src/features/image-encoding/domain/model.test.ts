import { describe, expect, it } from "vitest";
import { getImageFixture } from "./fixture";
import {
  buildPalette,
  deriveImageEncodingModel,
  inspectPixel,
  normalizeBitDepth,
  rawPayload,
  reconstructImage,
  sampleImage,
  sampledDimensions,
  quantizeSampledImage,
} from "./model";

describe("image encoding domain model", () => {
  const source = getImageFixture("photo");

  it("turns 50% spatial sampling into independent encoded dimensions", () => {
    const dimensions = sampledDimensions(source, 50);
    const sampled = sampleImage(source, { samplingPercent: 50, phase: 0 });
    expect(dimensions).toEqual({ width: 24, height: 16 });
    expect(sampled.pixels).toHaveLength(24 * 16);
    expect(sampled.width * sampled.height).toBe(384);
    expect(source.width).toBe(48);
    expect(source.height).toBe(32);
  });

  it("keeps reconstruction at source display size instead of resizing the encoded grid", () => {
    const model = deriveImageEncodingModel(source, { samplingPercent: 25, bitDepth: 4, phase: 0 });
    expect(model.sampled.width).toBe(12);
    expect(model.sampled.height).toBe(8);
    expect(model.reconstructed.width).toBe(source.width);
    expect(model.reconstructed.height).toBe(source.height);
    expect(model.reconstructed.pixels).toHaveLength(source.width * source.height);
    expect(model.reconstructed.pixels[0]).toEqual(model.quantized.pixels[0].quantizedColor);
  });

  it("moves representative coordinates when sampling phase changes", () => {
    const zero = sampleImage(getImageFixture("checkerboard"), { samplingPercent: 25, phase: 0 });
    const shifted = sampleImage(getImageFixture("checkerboard"), {
      samplingPercent: 25,
      phase: 0.8,
    });
    expect(shifted.pixels.map((pixel) => pixel.sourceX)).not.toEqual(
      zero.pixels.map((pixel) => pixel.sourceX),
    );
  });

  it("keeps full-density sampling identity regardless of requested phase", () => {
    const source = getImageFixture("pixel-grid");
    const sampled = sampleImage(source, { samplingPercent: 100, phase: 0.8 });
    expect(sampled.requestedPhase).toBe(0.8);
    expect(sampled.geometry).toMatchObject({
      x: { effectivePhase: 0 },
      y: { effectivePhase: 0 },
    });
    expect(sampled.width).toBe(source.width);
    expect(sampled.height).toBe(source.height);
    expect(sampled.pixels.map((pixel) => [pixel.sourceX, pixel.sourceY])).toEqual(
      source.pixels.map((_, index) => [index % source.width, Math.floor(index / source.width)]),
    );
  });

  it("keeps every phase-shifted sample live and invertible", () => {
    const model = deriveImageEncodingModel(getImageFixture("checkerboard"), {
      samplingPercent: 25,
      bitDepth: 3,
      phase: 0.8,
    });
    for (const pixel of model.sampled.pixels) {
      const inspection = inspectPixel(model, pixel.sourceX, pixel.sourceY);
      expect([inspection.sampleX, inspection.sampleY]).toEqual([pixel.sampleX, pixel.sampleY]);
    }
    const ownedCells = new Set<string>();
    for (let y = 0; y < model.source.height; y += 1) {
      for (let x = 0; x < model.source.width; x += 1) {
        const inspection = inspectPixel(model, x, y);
        ownedCells.add(`${inspection.sampleX},${inspection.sampleY}`);
      }
    }
    expect(ownedCells.size).toBe(model.sampled.width * model.sampled.height);
  });

  it("uses zero phase only on axes that round to full density", () => {
    const narrowSource = {
      id: "narrow-rounding-source",
      label: "Narrow rounding source",
      sourceKind: "upload" as const,
      width: 3,
      height: 20,
      pixels: Array.from({ length: 3 * 20 }, (_, index) => ({
        r: index % 3 === 0 ? 240 : 30,
        g: Math.floor(index / 3) * 10,
        b: 80,
      })),
    };
    const cases = [
      {
        source: getImageFixture("checkerboard"),
        samplingPercent: 99,
        expectedDimensions: [48, 32],
      },
      { source: narrowSource, samplingPercent: 90, expectedDimensions: [3, 18] },
    ] as const;

    for (const { source, samplingPercent, expectedDimensions } of cases) {
      const model = deriveImageEncodingModel(source, {
        samplingPercent,
        bitDepth: 3,
        phase: 0.8,
      });
      expect([model.sampled.width, model.sampled.height]).toEqual(expectedDimensions);
      for (const pixel of model.sampled.pixels) {
        const inspection = inspectPixel(model, pixel.sourceX, pixel.sourceY);
        expect([inspection.sampleX, inspection.sampleY]).toEqual([pixel.sampleX, pixel.sampleY]);
      }
      const ownedCells = new Set<string>();
      for (let y = 0; y < model.source.height; y += 1) {
        for (let x = 0; x < model.source.width; x += 1) {
          const inspection = inspectPixel(model, x, y);
          ownedCells.add(`${inspection.sampleX},${inspection.sampleY}`);
        }
      }
      expect(ownedCells.size).toBe(model.sampled.width * model.sampled.height);
    }

    const narrowPhase = sampleImage(narrowSource, { samplingPercent: 90, phase: 0.8 });
    const narrowNoPhase = sampleImage(narrowSource, { samplingPercent: 90, phase: 0 });
    expect(narrowPhase.pixels.slice(0, 3).map((pixel) => pixel.sourceX)).toEqual([0, 1, 2]);
    expect(narrowPhase.pixels.map((pixel) => pixel.sourceY)).not.toEqual(
      narrowNoPhase.pixels.map((pixel) => pixel.sourceY),
    );
  });

  it("keeps every sample live across rounded dimensions and multiple phase values", () => {
    const sources = [
      getImageFixture("checkerboard"),
      {
        id: "small-rounding-source",
        label: "Small rounding source",
        sourceKind: "upload" as const,
        width: 7,
        height: 5,
        pixels: Array.from({ length: 35 }, (_, index) => ({
          r: index * 7,
          g: index * 3,
          b: 255 - index * 5,
        })),
      },
      {
        id: "narrow-rounding-matrix-source",
        label: "Narrow rounding matrix source",
        sourceKind: "upload" as const,
        width: 3,
        height: 20,
        pixels: Array.from({ length: 60 }, (_, index) => ({ r: index, g: 0, b: 0 })),
      },
    ];
    for (const source of sources) {
      for (const samplingPercent of [10, 50, 90, 99]) {
        for (const phase of [0, 0.2, 0.8, 0.99]) {
          const model = deriveImageEncodingModel(source, { samplingPercent, bitDepth: 2, phase });
          const ownedCells = new Set<string>();
          for (let y = 0; y < model.source.height; y += 1) {
            for (let x = 0; x < model.source.width; x += 1) {
              const inspection = inspectPixel(model, x, y);
              ownedCells.add(`${inspection.sampleX},${inspection.sampleY}`);
            }
          }
          for (const pixel of model.sampled.pixels) {
            const inspection = inspectPixel(model, pixel.sourceX, pixel.sourceY);
            expect([inspection.sampleX, inspection.sampleY]).toEqual([
              pixel.sampleX,
              pixel.sampleY,
            ]);
          }
          expect(ownedCells.size).toBe(model.sampled.width * model.sampled.height);
        }
      }
    }
  });

  it("uses the same phase-aware cell geometry for reconstruction and inspection", () => {
    const model = deriveImageEncodingModel(getImageFixture("checkerboard"), {
      samplingPercent: 25,
      bitDepth: 3,
      phase: 0.8,
    });
    const inspection = inspectPixel(model, 20, 11);
    const cell =
      model.quantized.pixels[inspection.sampleY * model.quantized.width + inspection.sampleX];
    expect(
      model.reconstructed.pixels[inspection.sourceY * model.source.width + inspection.sourceX],
    ).toEqual(cell.quantizedColor);
    expect(inspection.encodedBits).toBe(cell.encodedBits);
  });

  it("keeps palette states finite and monotonically non-increasing as bit depth falls", () => {
    const sampled = sampleImage(getImageFixture("gradient"), { samplingPercent: 100, phase: 0 });
    const counts = [1, 2, 3, 4, 5, 6, 7, 8].map(
      (bits) => buildPalette(sampled.pixels, bits).length,
    );
    expect(counts.every((count, index) => index === 0 || count >= counts[index - 1])).toBe(true);
    expect(counts[0]).toBeLessThanOrEqual(2);
    expect(counts.at(-1)).toBeLessThanOrEqual(256);
  });

  it("never increases quantization error when bit depth adds nested codebook states", () => {
    for (const fixture of ["gradient", "checkerboard", "text-edge", "pixel-grid"] as const) {
      const errors = [1, 2, 3, 4, 5, 6, 7, 8].map(
        (bitDepth) =>
          deriveImageEncodingModel(getImageFixture(fixture), {
            samplingPercent: 50,
            bitDepth,
            phase: 0.2,
          }).averageQuantizationError,
      );
      expect(
        errors.every((error, index) => index === 0 || error <= errors[index - 1] + 1e-12),
      ).toBe(true);
    }
  });

  it("uses the quantized value and exact bit string in reconstruction and inspection", () => {
    const model = deriveImageEncodingModel(getImageFixture("gradient"), {
      samplingPercent: 50,
      bitDepth: 3,
      phase: 0,
    });
    const inspection = inspectPixel(model, 13, 9);
    const quantized =
      model.quantized.pixels[inspection.sampleY * model.quantized.width + inspection.sampleX];
    expect(inspection.paletteIndex).toBe(quantized.paletteIndex);
    expect(inspection.encodedBits).toBe(quantized.encodedBits);
    expect(inspection.encodedBits).toHaveLength(3);
    expect(inspection.quantizedColor).toEqual(quantized.quantizedColor);
  });

  it("calculates raw payload and byte conversion without browser file size", () => {
    expect(rawPayload(24, 16, 3)).toEqual({
      width: 24,
      height: 16,
      bitDepth: 3,
      bits: 1152,
      bytes: 144,
    });
    expect(rawPayload(3, 3, 5).bytes).toBe(6);
    expect(normalizeBitDepth(-99)).toBe(1);
    expect(normalizeBitDepth(99)).toBe(8);
  });

  it("lets sampling and quantization affect payload independently", () => {
    const spatial = deriveImageEncodingModel(source, {
      samplingPercent: 25,
      bitDepth: 8,
      phase: 0,
    });
    const color = deriveImageEncodingModel(source, { samplingPercent: 100, bitDepth: 2, phase: 0 });
    expect(spatial.rawPayload.bits).toBe(12 * 8 * 8);
    expect(color.rawPayload.bits).toBe(48 * 32 * 2);
    expect(spatial.sampled.width).not.toBe(color.sampled.width);
    expect(spatial.quantized.bitDepth).not.toBe(color.quantized.bitDepth);
  });

  it("allows nearby raw payloads to preserve different kinds of information", () => {
    const highSpaceLowColor = deriveImageEncodingModel(source, {
      samplingPercent: 50,
      bitDepth: 2,
      phase: 0,
    });
    const lowSpaceHighColor = deriveImageEncodingModel(source, {
      samplingPercent: 25,
      bitDepth: 8,
      phase: 0,
    });
    expect(highSpaceLowColor.rawPayload.bits).toBe(lowSpaceHighColor.rawPayload.bits);
    expect(highSpaceLowColor.averageError).not.toBe(lowSpaceHighColor.averageError);
  });

  it("is deterministic and reconstructs from sampled quantized cells only", () => {
    const sampled = sampleImage(source, { samplingPercent: 50, phase: 0 });
    const quantized = quantizeSampledImage(sampled, 4);
    const first = reconstructImage(source, quantized);
    const second = reconstructImage(source, quantized);
    expect(first).toEqual(second);
    expect(quantized.pixels.every((pixel) => pixel.paletteIndex < 2 ** 4)).toBe(true);
  });
});
