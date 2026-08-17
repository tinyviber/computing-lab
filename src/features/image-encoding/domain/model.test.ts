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
