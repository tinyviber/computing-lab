import { describe, expect, it } from "vitest";
import { foldedHz, topPeaks } from "./fft.ts";

function sine(freq: number, rate: number, seconds: number, amp = 1): Float32Array {
  const n = Math.round(rate * seconds);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = amp * Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

describe("topPeaks", () => {
  it("finds the partials of a multitone signal", () => {
    const rate = 44100;
    const data = new Float32Array(rate);
    const parts = [440, 1760, 8000];
    for (const f of parts) {
      const s = sine(f, rate, 1, 0.3);
      for (let i = 0; i < data.length; i += 1) data[i] += s[i];
    }
    const peaks = topPeaks(data, rate, 8);
    const freqs = peaks.map((p) => Math.round(p.freq));
    for (const f of parts) {
      expect(freqs.some((p) => Math.abs(p - f) < 30)).toBe(true);
    }
  });

  it("ranks magnitudes relative to the strongest peak", () => {
    const data = sine(1000, 44100, 1, 1);
    const peaks = topPeaks(data, 44100, 4);
    expect(peaks[0].magnitude).toBeGreaterThan(0.9);
    expect(Math.abs(peaks[0].freq - 1000)).toBeLessThan(20);
  });
});

describe("foldedHz", () => {
  it("keeps sub-Nyquist frequencies where they are", () => {
    expect(foldedHz(3000, 16000)).toBe(3000);
  });

  it("folds over-Nyquist frequencies back into the band", () => {
    // 11 kHz under 16 kHz sampling → alias at 16 - 11 = 5 kHz.
    expect(foldedHz(11000, 16000)).toBe(5000);
    // 9.9 kHz under 8 kHz sampling → mirror across 4 kHz → lands at 1900.
    expect(foldedHz(9900, 8000)).toBe(1900);
  });

  it("handles multiples of the rate cleanly", () => {
    expect(foldedHz(16000, 16000)).toBe(0);
    expect(foldedHz(24000, 16000)).toBe(8000);
  });
});
