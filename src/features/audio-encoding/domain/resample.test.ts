import { describe, expect, it } from "vitest";
import { nyquistHz, resampleAudio, resampleChannel } from "./resample.ts";

function sine(freq: number, rate: number, seconds: number): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

const rms = (data: Float32Array) =>
  Math.sqrt(data.reduce((acc, v) => acc + v * v, 0) / data.length);

describe("resampleChannel", () => {
  it("returns a copy when rates match", () => {
    const src = sine(440, 8000, 0.05);
    const out = resampleChannel(src, 8000, 8000);
    expect(out).not.toBe(src);
    expect([...out]).toEqual([...src]);
  });

  it("keeps duration: out length / dstRate ≈ in length / srcRate", () => {
    const src = sine(440, 48000, 0.5);
    const out = resampleChannel(src, 48000, 8000);
    expect(out.length).toBe(Math.round(src.length / 6));
    expect(out.length / 8000).toBeCloseTo(src.length / 48000, 3);
  });

  it("passes an in-band sine through at nearly the same amplitude", () => {
    const src = sine(1000, 48000, 0.5);
    const out = resampleChannel(src, 48000, 12000);
    // Drop the first/last kernel widths to avoid the edge fade.
    const mid = out.slice(200, out.length - 200);
    expect(rms(mid)).toBeGreaterThan(0.6);
  });

  it("anti-aliases: a tone above the new Nyquist is removed, not folded", () => {
    // 9 kHz into a 8 kHz-rate output: naive resampling folds it to 1 kHz;
    // the windowed-sinc low-pass must suppress it instead.
    const src = sine(9000, 48000, 0.5);
    const out = resampleChannel(src, 48000, 8000);
    const mid = out.slice(100, out.length - 100);
    expect(rms(mid)).toBeLessThan(0.02);
  });
});

describe("resampleAudio", () => {
  it("resamples every channel to the target rate", () => {
    const audio = {
      sampleRate: 48000,
      channels: [sine(300, 48000, 0.2), sine(500, 48000, 0.2)],
    };
    const out = resampleAudio(audio, 16000);
    expect(out.sampleRate).toBe(16000);
    expect(out.channels).toHaveLength(2);
    expect(out.channels[0].length).toBe(Math.round(0.2 * 16000));
  });
});

it("nyquistHz is half the rate", () => {
  expect(nyquistHz(44100)).toBe(22050);
});
