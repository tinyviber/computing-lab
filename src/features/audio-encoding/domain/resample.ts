/**
 * Anti-aliased resampling: a windowed-sinc interpolator.
 *
 * Downsampling first low-passes below the destination Nyquist frequency so
 * energy that cannot be represented is removed instead of folded back —
 * that is the honest version of "采样率决定可表示的最高频率". A plain
 * linear interpolation leaves the high content in place and manufactures
 * alias tones, so it is deliberately not used here.
 *
 * Kernel: h(d) = 2·fc·sinc(2fc·d)·w(d), |d| ≤ L, with fc the cutoff in
 * cycles/input-sample and w a Blackman window. L grows as the cutoff
 * shrinks so the transition band stays a fixed fraction of the signal
 * band; each output is normalized by the weight sum actually applied,
 * which keeps DC gain exact at the edges and under upsampling.
 */

import type { PcmAudio } from "./audio.ts";

const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x));

function kernel(d: number, fc: number, halfTaps: number): number {
  const w =
    0.42 + 0.5 * Math.cos((Math.PI * d) / halfTaps) + 0.08 * Math.cos((2 * Math.PI * d) / halfTaps);
  return 2 * fc * sinc(2 * fc * d) * w;
}

/**
 * Resample one channel. `srcRate`/`dstRate` are in Hz; output length is
 * `round(input.length * dstRate / srcRate)` so duration is preserved.
 */
export function resampleChannel(
  input: Float32Array,
  srcRate: number,
  dstRate: number,
): Float32Array {
  if (srcRate === dstRate || input.length === 0) {
    return input.slice();
  }
  const ratio = srcRate / dstRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  // Cutoff in cycles per input sample: never above input Nyquist, and for
  // downsampling capped at destination Nyquist (the anti-alias step).
  const fc = dstRate < srcRate ? dstRate / (2 * srcRate) : 0.5;
  // Narrower cutoff → wider kernel; clamped so cost stays bounded.
  const halfTaps = Math.min(96, Math.max(8, Math.ceil(4 / fc)));

  for (let j = 0; j < outLen; j += 1) {
    const x = j * ratio;
    const lo = Math.ceil(x - halfTaps);
    const hi = Math.floor(x + halfTaps);
    let acc = 0;
    let wsum = 0;
    for (let k = lo; k <= hi; k += 1) {
      const w = kernel(x - k, fc, halfTaps);
      const idx = k < 0 ? 0 : k >= input.length ? input.length - 1 : k;
      acc += w * input[idx];
      wsum += w;
    }
    out[j] = wsum !== 0 ? acc / wsum : 0;
  }
  return out;
}

/** Resample every channel; reports progress per finished channel. */
export function resampleAudio(
  audio: PcmAudio,
  dstRate: number,
  onProgress?: (done: number, total: number) => void,
): PcmAudio {
  const channels = audio.channels.map((data, i) => {
    const out = resampleChannel(data, audio.sampleRate, dstRate);
    onProgress?.(i + 1, audio.channels.length);
    return out;
  });
  return { sampleRate: dstRate, channels };
}

/** Theoretical limit the resampled signal can represent, in Hz. */
export function nyquistHz(sampleRate: number): number {
  return sampleRate / 2;
}
