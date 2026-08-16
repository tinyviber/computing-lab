import { describe, expect, it } from "vitest";
import { buildWaveform, calculateAudioStats } from "./model";

describe("audio encoding domain", () => {
  it("calculates exact one-second encoded rate", () => {
    expect(calculateAudioStats({ sampleRate: 8, bits: 4 })).toMatchObject({
      samplesPerSecond: 8,
      amplitudeLevels: 16,
      encodedBitsPerSecond: 32,
      encodedBytesPerSecond: 4,
    });
  });

  it("clamps controls and emits one quantized point per sample", () => {
    expect(buildWaveform({ frequency: 2, sampleRate: 2, bits: 1 })).toHaveLength(8);
    expect(buildWaveform({ frequency: 2, sampleRate: 16, bits: 8 })).toHaveLength(16);
  });

  it("uses deterministic sine samples and nearest quantization", () => {
    const waveform = buildWaveform({ frequency: 2, sampleRate: 8, bits: 2 });

    expect(waveform.map(({ index }) => index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(waveform.map(({ source }) => source)).toEqual([
      0,
      Math.sin(Math.PI / 2),
      Math.sin(Math.PI),
      Math.sin((3 * Math.PI) / 2),
      Math.sin(2 * Math.PI),
      Math.sin((5 * Math.PI) / 2),
      Math.sin(3 * Math.PI),
      Math.sin((7 * Math.PI) / 2),
    ]);
    expect(waveform.map(({ quantized }) => quantized)).toHaveLength(8);
    expect(waveform[0].quantized).toBeCloseTo(1 / 3, 12);
    expect(waveform[1].quantized).toBe(1);
    expect(waveform[2].quantized).toBeCloseTo(1 / 3, 12);
    expect(waveform[3].quantized).toBe(-1);
    expect(buildWaveform({ frequency: 2, sampleRate: 8, bits: 2 })).toEqual(waveform);
  });

  it("calculates bit and byte counts from one second sample count", () => {
    expect(calculateAudioStats({ frequency: 2, sampleRate: 8, bits: 3 })).toMatchObject({
      samplesPerSecond: 8,
      quantizationBits: 3,
      amplitudeLevels: 8,
      encodedBitsPerSecond: 24,
      encodedBytesPerSecond: 3,
      sampleCount: 8,
      encodedBits: 24,
      encodedBytes: 3,
      durationSeconds: 1,
    });
  });

  it("rounds fractional controls before applying bounds", () => {
    expect(calculateAudioStats({ frequency: 2, sampleRate: 3.6, bits: 8.4 })).toMatchObject({
      samplesPerSecond: 8,
      quantizationBits: 8,
    });
  });
});
