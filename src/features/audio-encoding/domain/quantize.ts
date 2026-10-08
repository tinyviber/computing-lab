/**
 * Signed-PCM quantization of normalized float samples.
 *
 * A bit depth of `bits` gives 2^bits levels laid out as signed integers in
 * [−2^(bits−1), 2^(bits−1)−1]: the negative rail reaches one step further
 * than the positive one, exactly like a real two's-complement PCM sample.
 * Levels live in Int32Array so every depth up to 24 bit is represented
 * faithfully (an Int16Array could not hold 24-bit data).
 *
 * Rounding rule: v·scale rounded half-up (Math.round), then clamped —
 * samples at ±1.0 or beyond clip to the rails instead of wrapping. Dequantization maps level q back to q/scale, so the restored
 * wave sits at most half a step (2^−bits) away from the original.
 */

import type { PcmAudio } from "./audio.ts";

export function quantizationLevels(bits: number): number {
  return 2 ** bits;
}

const scaleOf = (bits: number) => 2 ** (bits - 1);

/** Quantize one channel into signed level codes. */
export function quantizeChannel(samples: Float32Array, bits: number): Int32Array {
  const scale = scaleOf(bits);
  const lo = -scale;
  const hi = scale - 1;
  const out = new Int32Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] < -1 ? -1 : samples[i] > 1 ? 1 : samples[i];
    let q = Math.round(v * scale);
    if (q > hi) q = hi;
    else if (q < lo) q = lo;
    out[i] = q;
  }
  return out;
}

/** Map level codes back to floats — still quantized, just listenable. */
export function dequantizeChannel(levels: Int32Array, bits: number): Float32Array {
  const scale = scaleOf(bits);
  const out = new Float32Array(levels.length);
  for (let i = 0; i < levels.length; i += 1) out[i] = levels[i] / scale;
  return out;
}

export function quantizeAudio(audio: PcmAudio, bits: number): Int32Array[] {
  return audio.channels.map((data) => quantizeChannel(data, bits));
}

/** Round-trip convenience: quantize then dequantize each channel. */
export function quantizeRoundTrip(audio: PcmAudio, bits: number): PcmAudio {
  return {
    sampleRate: audio.sampleRate,
    channels: quantizeAudio(audio, bits).map((levels) => dequantizeChannel(levels, bits)),
  };
}

export type QuantizationStats = {
  /** Largest |dequantized − original| sample (≤ 2^−bits in-band). */
  maxError: number;
  /** Root-mean-square quantization error. */
  rmsError: number;
  /** 10·log10(signal power / error power) in dB — higher is cleaner. */
  snrDb: number;
};

/**
 * Compare a channel before and after dequantization at the same rate.
 * The inputs must be the same length — measure against the *resampled*
 * signal so the reported error is quantization noise only.
 */
export function quantizationStats(before: Float32Array, after: Float32Array): QuantizationStats {
  const n = Math.min(before.length, after.length);
  if (n === 0) return { maxError: 0, rmsError: 0, snrDb: Infinity };
  let errPow = 0;
  let sigPow = 0;
  let maxError = 0;
  for (let i = 0; i < n; i += 1) {
    const e = after[i] - before[i];
    errPow += e * e;
    sigPow += before[i] * before[i];
    maxError = Math.max(maxError, Math.abs(e));
  }
  const rmsError = Math.sqrt(errPow / n);
  const snrDb = errPow > 0 ? 10 * Math.log10(sigPow / errPow) : Infinity;
  return { maxError, rmsError, snrDb };
}
