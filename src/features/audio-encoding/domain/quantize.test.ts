import { describe, expect, it } from "vitest";
import {
  dequantizeChannel,
  quantizeChannel,
  quantizationLevels,
  quantizationStats,
} from "./quantize.ts";

const seq = (values: number[]) => new Float32Array(values);

describe("quantizeChannel", () => {
  it("maps the signed range onto [-2^(b-1), 2^(b-1)-1] levels", () => {
    const q = quantizeChannel(seq([-1, -0.5, 0, 0.5, 0.999, 1]), 8);
    expect([...q]).toEqual([-128, -64, 0, 64, 128 - 1, 127]);
  });

  it("clips out-of-range samples at the rails instead of wrapping", () => {
    const q = quantizeChannel(seq([-3, -1.0001, 1.0001, 5]), 4);
    expect([...q]).toEqual([-8, -8, 7, 7]);
  });

  it("keeps 24-bit data in range an Int16Array could not hold", () => {
    const q = quantizeChannel(seq([1]), 24);
    expect(q[0]).toBe(2 ** 23 - 1);
    expect(q[0]).toBeGreaterThan(2 ** 15);
  });
});

describe("dequantizeChannel", () => {
  it("round-trips within half a step (2^-bits) below the clipping knee, and clips above it", () => {
    const src = new Float32Array(2000).map((_, i) => Math.sin(i * 0.37) * 0.9);
    for (const bits of [2, 4, 8, 16, 24]) {
      const scale = 2 ** (bits - 1);
      // The top rail floats at (scale-1)/scale; sources past the midpoint
      // between the top two codes clip to it — that is real PCM behavior.
      const knee = (scale - 0.5) / scale;
      const back = dequantizeChannel(quantizeChannel(src, bits), bits);
      for (let i = 0; i < src.length; i += 1) {
        if (src[i] > knee) {
          expect(back[i]).toBeCloseTo((scale - 1) / scale, 5);
        } else {
          expect(Math.abs(back[i] - src[i])).toBeLessThanOrEqual(2 ** -bits + 1e-7);
        }
      }
    }
  });

  it("maps the negative rail back to exactly -1", () => {
    const back = dequantizeChannel(quantizeChannel(seq([-1]), 8), 8);
    expect(back[0]).toBe(-1);
  });
});

describe("quantizationStats", () => {
  it("reports ~0 error for 24-bit and large error for 2-bit", () => {
    const src = new Float32Array(4000).map((_, i) => Math.sin(i * 0.11) * 0.8);
    const fine = quantizationStats(src, dequantizeChannel(quantizeChannel(src, 24), 24));
    const coarse = quantizationStats(src, dequantizeChannel(quantizeChannel(src, 2), 2));
    expect(fine.snrDb).toBeGreaterThan(100);
    expect(coarse.snrDb).toBeLessThan(12);
    expect(coarse.maxError).toBeGreaterThan(0.1);
  });

  it("quantizationLevels follows 2^bits", () => {
    expect(quantizationLevels(8)).toBe(256);
    expect(quantizationLevels(16)).toBe(65536);
  });
});
