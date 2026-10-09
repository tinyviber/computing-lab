import { describe, expect, it } from "vitest";
import { digitize, mixToMono } from "./digitize.ts";
import { pcmByteSize, pcmBitRate } from "./metrics.ts";
import { DEMO_SIGNALS, renderSignal, signalMaxFreq } from "./signals.ts";
import type { PcmAudio } from "./audio.ts";

const stereo: PcmAudio = {
  sampleRate: 8000,
  channels: [new Float32Array([1, -1, 0.5]), new Float32Array([-1, 1, 0.5])],
};

describe("mixToMono", () => {
  it("averages channels — never silently picks the left one", () => {
    expect([...mixToMono(stereo.channels)]).toEqual([0, 0, 0.5]);
  });
});

describe("digitize", () => {
  it("keeps duration consistent when the rate changes", () => {
    const spec = DEMO_SIGNALS[0].spec;
    const audio = renderSignal(spec);
    const out = digitize(audio, { sampleRate: 8000, bitDepth: 8, channels: 1 });
    expect(out.audio.sampleRate).toBe(8000);
    expect(out.audio.channels).toHaveLength(1);
    const dur = out.audio.channels[0].length / 8000;
    expect(dur).toBeCloseTo(spec.durationSec, 1);
  });

  it("a mono source stays mono even when asked for stereo", () => {
    const mono: PcmAudio = { sampleRate: 8000, channels: [new Float32Array([0.5])] };
    const out = digitize(mono, { sampleRate: 8000, bitDepth: 8, channels: 2 });
    expect(out.effectiveChannels).toBe(1);
    expect(out.audio.channels).toHaveLength(1);
  });

  it("resampling a fitting rate leaves the fixture's top partial intact", () => {
    const spec = DEMO_SIGNALS[0].spec;
    const audio = renderSignal(spec);
    const rate = Math.ceil((2 * signalMaxFreq(spec)) / 100) * 100;
    const out = digitize(audio, { sampleRate: rate, bitDepth: 24, channels: 1 });
    // At 24 bit the only loss is resampling; SNR stays very high.
    expect(out.quantization[0].snrDb).toBeGreaterThan(90);
  });
});

describe("metrics arithmetic", () => {
  it("pcmBitRate = rate × depth × channels", () => {
    expect(pcmBitRate({ sampleRate: 8000, bitDepth: 8, channels: 1 })).toBe(64000);
    expect(pcmBitRate({ sampleRate: 44100, bitDepth: 16, channels: 2 })).toBe(1411200);
  });

  it("pcmByteSize = rate × depth/8 × channels × seconds", () => {
    expect(pcmByteSize({ sampleRate: 8000, bitDepth: 8, channels: 1 }, 1)).toBe(8000);
    expect(pcmByteSize({ sampleRate: 44100, bitDepth: 16, channels: 2 }, 60)).toBe(10584000);
  });
});
