import { describe, expect, it } from "vitest";
import { sampleSoundFixture } from "./fixtures";
import * as model from "./model";

type SoundConfig = {
  source: "pure440" | "high-pulse" | "speech" | "sawtooth";
  sampleRate: number;
  bitDepth: number;
  phase: number;
};

type DerivedModel = Record<string, unknown>;

const modelExports = model as Record<string, unknown>;
const buildModel =
  modelExports.deriveSoundModel ??
  modelExports.buildSoundModel ??
  modelExports.buildAudioModel ??
  modelExports.buildWaveform;

function derive(config: SoundConfig): DerivedModel {
  expect(buildModel, "Sound model builder is not exported").toEqual(expect.any(Function));
  return (buildModel as (source: string, config: Omit<SoundConfig, "source">) => DerivedModel)(
    config.source,
    { sampleRate: config.sampleRate, bitDepth: config.bitDepth, phase: config.phase },
  );
}

function arrayField(value: DerivedModel, ...names: string[]): unknown[] {
  for (const name of names) {
    const field = name.split(".").reduce<unknown>((current, part) => {
      return current && typeof current === "object"
        ? (current as Record<string, unknown>)[part]
        : undefined;
    }, value);
    if (Array.isArray(field)) return field as unknown[];
  }
  throw new Error(`Expected one of ${names.join(", ")} to be an array`);
}

function numberField(value: DerivedModel, ...names: string[]): number {
  for (const name of names) {
    const field = name.split(".").reduce<unknown>((current, part) => {
      return current && typeof current === "object"
        ? (current as Record<string, unknown>)[part]
        : undefined;
    }, value);
    if (typeof field === "number") return field;
  }
  throw new Error(`Expected one of ${names.join(", ")} to be a number`);
}

describe("Sound reference model", () => {
  it("is deterministic and exposes the complete pure derived model", () => {
    const config: SoundConfig = { source: "pure440", sampleRate: 8000, bitDepth: 8, phase: 0 };
    const first = derive(config);
    const second = derive(config);

    expect(first).toEqual(second);
    expect(arrayField(first, "original")).not.toHaveLength(0);
    expect(arrayField(first, "timestamps")).toHaveLength(arrayField(first, "original").length);
    expect(arrayField(first, "codes", "quantizationCodes", "quantization.codes")).toHaveLength(
      arrayField(first, "original").length,
    );
    expect(
      numberField(first, "levels", "quantizationLevels", "quantization.levels"),
    ).toBeGreaterThan(0);
    expect(
      arrayField(
        first,
        "reconstructed",
        "reconstruction",
        "sampleHold",
        "quantization.reconstructed",
      ),
    ).toHaveLength(arrayField(first, "original").length);
    expect(arrayField(first, "errors")).toHaveLength(arrayField(first, "original").length);
    expect(arrayField(first, "plot", "plotPoints", "boundedPlot").length).toBeLessThanOrEqual(600);
    expect(first).toHaveProperty("payload");
    expect(first).toHaveProperty("cursor");
    expect(first.cursor).toMatchObject({
      timeMs: expect.any(Number),
      sampleIndex: expect.any(Number),
      original: expect.any(Number),
      reconstructed: expect.any(Number),
      error: expect.any(Number),
    });
    expect(first).toHaveProperty("aliasing");
    expect(numberField(first, "nyquist", "nyquistHz")).toBeGreaterThan(0);
    expect(
      numberField(first, "folded", "foldedFrequency", "foldedFrequencyHz"),
    ).toBeGreaterThanOrEqual(0);
  });

  it("keeps quantization codes bounded and reconstruction sample-held", () => {
    const bitDepth = 4;
    const result = derive({ source: "pure440", sampleRate: 8000, bitDepth, phase: 0 });
    const codes = arrayField(result, "codes", "quantizationCodes", "quantization.codes").map(
      Number,
    );
    const levelCount = numberField(result, "levels", "quantizationLevels", "quantization.levels");
    const levels = Array.from(
      { length: levelCount },
      (_, index) => (2 * index) / (levelCount - 1) - 1,
    );
    const reconstructed = arrayField(
      result,
      "reconstructed",
      "reconstruction",
      "sampleHold",
      "quantization.reconstructed",
    ).map(Number);

    expect(levelCount).toBe(2 ** bitDepth);
    expect(codes.every((code) => Number.isInteger(code) && code >= 0 && code < levels.length)).toBe(
      true,
    );
    expect(reconstructed.every(Number.isFinite)).toBe(true);
    reconstructed.forEach((value, index) => expect(value).toBe(levels[codes[index]]));
  });

  it("supports every deterministic fixture without changing model shape", () => {
    const results = (["pure440", "high-pulse", "speech", "sawtooth"] as const).map((source) =>
      derive({ source, sampleRate: 8000, bitDepth: 8, phase: 0 }),
    );

    for (const result of results) {
      const original = arrayField(result, "original").map(Number);
      const timestamps = arrayField(result, "timestamps").map(Number);
      const errors = arrayField(result, "errors").map(Number);
      expect(original.length).toBeGreaterThan(0);
      expect(original.every(Number.isFinite)).toBe(true);
      expect(timestamps.every(Number.isFinite)).toBe(true);
      expect(errors.every(Number.isFinite)).toBe(true);
      expect(numberField(result, "rms", "errorRms", "rmsError")).toBeGreaterThanOrEqual(0);
      expect(numberField(result, "peak", "peakError", "errorPeak")).toBeGreaterThanOrEqual(0);
      expect(numberField(result, "rms", "errorRms", "rmsError")).toBeLessThanOrEqual(
        numberField(result, "peak", "peakError", "errorPeak") + 1e-12,
      );
    }
  });

  it("treats phase as turns across every periodic fixture", () => {
    const sources = ["pure440", "high-pulse", "speech", "sawtooth"] as const;
    const times = [0, 1.25, 37.5, 250.75, 999.5];

    for (const source of sources) {
      for (const timeMs of times) {
        expect(sampleSoundFixture(source, timeMs, 1)).toBeCloseTo(
          sampleSoundFixture(source, timeMs, 0),
          10,
        );
      }
    }
  });

  it("reports finite Nyquist/folding analysis and keeps the plot bounded", () => {
    const result = derive({ source: "high-pulse", sampleRate: 2000, bitDepth: 8, phase: 0 });
    expect(numberField(result, "nyquist", "nyquistHz")).toBeGreaterThan(0);
    expect(
      numberField(result, "folded", "foldedFrequency", "foldedFrequencyHz", "foldedHz"),
    ).toBeGreaterThanOrEqual(0);
    expect(typeof result.aliasing).toBe("boolean");
    expect(arrayField(result, "plot", "plotPoints", "boundedPlot").length).toBeLessThanOrEqual(600);
  });

  it("decimates dense source data without changing the source arrays", () => {
    const result = derive({ source: "speech", sampleRate: 48000, bitDepth: 8, phase: 0 });
    const original = arrayField(result, "original");
    const timestamps = arrayField(result, "timestamps");
    const plot = arrayField(result, "plot", "plotPoints", "boundedPlot");

    expect(original.length).toBe(timestamps.length);
    expect(original.length).toBeGreaterThan(plot.length);
    expect(plot.length).toBeLessThanOrEqual(600);
  });
});
