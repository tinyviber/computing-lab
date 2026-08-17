import { describe, expect, it } from "vitest";
import { getSoundFixture, sampleSoundFixture } from "./fixtures";
import * as model from "./model";

type SoundConfig = {
  source: "pure440" | "high-pulse" | "speech" | "sawtooth";
  sampleRate: number;
  bitDepth: number;
  phase: number;
};

type DerivedModel = Record<string, unknown>;
type SoundComponent = { frequencyHz: number; amplitude: number };
type SampleEntry = {
  index: number;
  timestampMs: number;
  original: number;
  code: number;
  reconstructed: number;
  error: number;
};
type DerivedSoundContract = DerivedModel & {
  samples: SampleEntry[];
  reconstructAt: (timeMs: number) => number;
  quantization: {
    codes: readonly number[];
    levelValues: number[];
    reconstructed: readonly number[];
  };
  aliasingEvidence: {
    anyAliasing: boolean;
    components: Array<SoundComponent & { classification: string; foldedFrequencyHz: number }>;
  };
  anyAliasing: boolean;
};

const modelExports = model as Record<string, unknown>;
const buildModel =
  modelExports.deriveSoundModel ??
  modelExports.buildSoundModel ??
  modelExports.buildAudioModel ??
  modelExports.buildWaveform;

function derive(config: SoundConfig, cursorMs = 0): DerivedModel {
  expect(buildModel, "Sound model builder is not exported").toEqual(expect.any(Function));
  return (
    buildModel as (
      source: string,
      config: Omit<SoundConfig, "source">,
      cursorMs?: number,
    ) => DerivedModel
  )(
    config.source,
    { sampleRate: config.sampleRate, bitDepth: config.bitDepth, phase: config.phase },
    cursorMs,
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

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
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

  it("exposes phase-free bounded fixtures with explicit harmonic components", () => {
    const expectedFundamentals = {
      pure440: 440,
      speech: 180,
      sawtooth: 220,
      "high-pulse": 6000,
    } as const;

    for (const source of Object.keys(expectedFundamentals) as Array<
      keyof typeof expectedFundamentals
    >) {
      const fixture = getSoundFixture(source) as typeof getSoundFixture extends (
        source: string,
      ) => infer Fixture
        ? Fixture & { components: SoundComponent[] }
        : never;
      expect(fixture.components, `${source} components`).toEqual(expect.any(Array));
      expect(fixture.components.length).toBeGreaterThan(0);
      expect(fixture.components.map((component) => component.frequencyHz)).toContain(
        expectedFundamentals[source],
      );
      expect(fixture.sampleAt(37.25)).toBe(sampleSoundFixture(source, 37.25, 0));

      for (const component of fixture.components) {
        expect(component.frequencyHz).toBeGreaterThan(0);
        expect(Number.isFinite(component.frequencyHz)).toBe(true);
        expect(Number.isFinite(component.amplitude)).toBe(true);
      }
      for (const timeMs of [0, 1, 37.25, 500, 999.999]) {
        expect(Math.abs(fixture.sampleAt(timeMs))).toBeLessThanOrEqual(1);
      }
    }

    const speechFixture = getSoundFixture("speech") as typeof getSoundFixture extends (
      source: string,
    ) => infer Fixture
      ? Fixture & { components: SoundComponent[] }
      : never;
    const sawtoothFixture = getSoundFixture("sawtooth") as typeof getSoundFixture extends (
      source: string,
    ) => infer Fixture
      ? Fixture & { components: SoundComponent[] }
      : never;
    const highPulseFixture = getSoundFixture("high-pulse") as typeof getSoundFixture extends (
      source: string,
    ) => infer Fixture
      ? Fixture & { components: SoundComponent[] }
      : never;
    expect(speechFixture.components.map((component) => component.frequencyHz)).toEqual(
      expect.arrayContaining([180, 420, 780]),
    );
    expect(sawtoothFixture.components.some((component) => component.frequencyHz > 220)).toBe(true);
    expect(highPulseFixture.components.some((component) => component.frequencyHz > 6000)).toBe(
      true,
    );
  });

  it("uses exact phase-shifted sample timestamps over a half-open duration", () => {
    const result = derive({ source: "pure440", sampleRate: 1000, bitDepth: 8, phase: 0.25 });
    const typedResult = result as DerivedSoundContract;
    const samples = typedResult.samples;

    expect(samples).toHaveLength(1000);
    expect(samples.slice(0, 4).map((sample) => sample.index)).toEqual([0, 1, 2, 3]);
    expect(samples.slice(0, 4).map((sample) => sample.timestampMs)).toEqual([
      0.25, 1.25, 2.25, 3.25,
    ]);
    expect(samples.every((sample) => sample.timestampMs >= 0 && sample.timestampMs < 1000)).toBe(
      true,
    );
    expect(typedResult.timestamps).toEqual(samples.map((sample) => sample.timestampMs));
    expect(typedResult.original).toEqual(samples.map((sample) => sample.original));
    expect(samples.every((sample) => Number.isFinite(sample.error))).toBe(true);
  });

  it("keeps the source immutable for cursor reads and reconstructs with half-open sample hold", () => {
    const phase = 0.5;
    const result = derive({ source: "pure440", sampleRate: 1000, bitDepth: 8, phase });
    const typedResult = result as DerivedSoundContract;
    const samples = typedResult.samples;
    const firstBoundary = samples[1].timestampMs;
    const beforeBoundary = typedResult.reconstructAt(firstBoundary - 0.0001);
    const atBoundary = typedResult.reconstructAt(firstBoundary);

    expect(beforeBoundary).toBe(samples[0].reconstructed);
    expect(atBoundary).toBe(samples[1].reconstructed);

    const cursorTime = 123.456;
    const cursorModel = derive(
      { source: "pure440", sampleRate: 1000, bitDepth: 8, phase },
      cursorTime,
    );
    const zeroPhaseCursor = derive(
      { source: "pure440", sampleRate: 1000, bitDepth: 8, phase: 0 },
      cursorTime,
    );
    expect(cursorModel.cursor.original).toBeCloseTo(sampleSoundFixture("pure440", cursorTime), 12);
    expect(cursorModel.cursor.original).toBeCloseTo(zeroPhaseCursor.cursor.original, 12);
    expect(typedResult.cursor.original).toBeCloseTo(
      sampleSoundFixture("pure440", typedResult.cursor.timeMs),
      12,
    );
  });

  it("exposes every quantization level while keeping sample codes in that domain", () => {
    const bitDepth = 4;
    const result = derive({ source: "sawtooth", sampleRate: 4000, bitDepth, phase: 0 });
    const typedResult = result as DerivedSoundContract;
    const levels = typedResult.quantization.levelValues;
    const codes = typedResult.quantization.codes.map(Number);

    expect(levels).toHaveLength(2 ** bitDepth);
    expect(levels[0]).toBe(-1);
    expect(levels.at(-1)).toBe(1);
    expect(levels.every(Number.isFinite)).toBe(true);
    expect(codes.every((code) => Number.isInteger(code) && code >= 0 && code < levels.length)).toBe(
      true,
    );
    expect(typedResult.quantization.reconstructed).toEqual(codes.map((code) => levels[code]));
  });

  it("classifies every explicit component below, at, or above Nyquist", () => {
    const speech = derive({ source: "speech", sampleRate: 840, bitDepth: 8, phase: 0 });
    const evidence = (speech as DerivedSoundContract).aliasingEvidence;
    const byFrequency = new Map(
      evidence.components.map((component) => [component.frequencyHz, component]),
    );

    expect(evidence.anyAliasing).toBe(true);
    expect(byFrequency.get(180)).toMatchObject({ classification: "below", foldedFrequencyHz: 180 });
    expect(byFrequency.get(420)).toMatchObject({ classification: "at", foldedFrequencyHz: 420 });
    expect(byFrequency.get(780)).toMatchObject({
      classification: "aliased",
      foldedFrequencyHz: 60,
    });
    expect(
      evidence.components.every((component) =>
        ["below", "at", "aliased"].includes(component.classification),
      ),
    ).toBe(true);

    const pureAtNyquist = derive({ source: "pure440", sampleRate: 880, bitDepth: 8, phase: 0 });
    const pureEvidence = (pureAtNyquist as DerivedSoundContract).aliasingEvidence;
    expect(pureEvidence.anyAliasing).toBe(false);
    expect(pureEvidence.components[0]).toMatchObject({
      classification: "at",
      foldedFrequencyHz: 440,
    });
  });
});
