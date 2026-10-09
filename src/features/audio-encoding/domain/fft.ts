/**
 * Minimal FFT-based spectrum peeking for the demo's "频谱混叠" view.
 *
 * This is visualization only — a radix-2 FFT over a windowed chunk of one
 * channel, plus a small peak picker. It never participates in processing:
 * the digits students see are the same pipeline outputs as the waveforms,
 * just re-tabulated by frequency.
 */

/** Iterative radix-2 FFT. Returns interleaved [re,im] pairs (n = power of 2). */
function fft(re: Float64Array, im: Float64Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i += 1) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curR = 1;
      let curI = 0;
      for (let j = 0; j < half; j += 1) {
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + half] * curR - im[i + j + half] * curI;
        const vi = re[i + j + half] * curI + im[i + j + half] * curR;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + half] = ur - vr;
        im[i + j + half] = ui - vi;
        const nR = curR * wr - curI * wi;
        curI = curR * wi + curI * wr;
        curR = nR;
      }
    }
  }
}

export type SpectrumPeak = {
  /** Frequency in Hz (bin center; light parabolic refinement applied). */
  freq: number;
  /** Relative magnitude 0–1 (1 = strongest peak in this analysis). */
  magnitude: number;
};

const FFT_SIZE = 16384;
const HOP_MAX = FFT_SIZE;

/**
 * Top spectral peaks of `data` (mono channel). The signal is Hann-windowed
 * chunk-by-chunk and magnitudes are averaged, so the result is stable for
 * multi-second material without needing one giant transform.
 */
export function topPeaks(data: Float32Array, sampleRate: number, maxPeaks = 10): SpectrumPeak[] {
  if (data.length < 256 || sampleRate <= 0) return [];
  const acc = new Float64Array(FFT_SIZE / 2);
  let hops = 0;
  const hann = new Float64Array(FFT_SIZE);
  for (let i = 0; i < FFT_SIZE; i += 1) {
    hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (FFT_SIZE - 1));
  }
  const re = new Float64Array(FFT_SIZE);
  const im = new Float64Array(FFT_SIZE);
  for (
    let start = 0;
    start + 512 <= data.length && hops < 24;
    start += Math.min(HOP_MAX, Math.max(512, Math.floor(data.length / 8)))
  ) {
    re.fill(0);
    im.fill(0);
    const n = Math.min(FFT_SIZE, data.length - start);
    for (let i = 0; i < n; i += 1) re[i] = data[start + i] * hann[i];
    fft(re, im);
    for (let k = 1; k < n / 2; k += 1) acc[k] += Math.hypot(re[k], im[k]);
    hops += 1;
  }
  const binHz = sampleRate / FFT_SIZE;
  // Local maxima, strongest first, with a minimum bin separation.
  const peaks: SpectrumPeak[] = [];
  const maxMag = Math.max(...acc) || 1;
  const taken = new Set<number>();
  const candidates: { k: number; m: number }[] = [];
  for (let k = 2; k < acc.length - 2; k += 1) {
    if (acc[k] >= acc[k - 1] && acc[k] > acc[k + 1] && acc[k] > maxMag * 0.02) {
      candidates.push({ k, m: acc[k] });
    }
  }
  candidates.sort((a, b) => b.m - a.m);
  for (const { k, m } of candidates) {
    if (peaks.length >= maxPeaks) break;
    if ([...taken].some((t) => Math.abs(t - k) < 6)) continue;
    taken.add(k);
    // Parabolic interpolation refines the bin-center estimate.
    const y0 = acc[k - 1];
    const y1 = acc[k];
    const y2 = acc[k + 1];
    const shift = y0 - 2 * y1 + y2 !== 0 ? (0.5 * (y0 - y2)) / (y0 - 2 * y1 + y2) : 0;
    peaks.push({ freq: (k + Math.max(-0.5, Math.min(0.5, shift))) * binHz, magnitude: m / maxMag });
  }
  return peaks.sort((a, b) => a.freq - b.freq);
}

/** Where a component at `freq` lands after sampling at `rate` — the alias fold. */
export function foldedHz(freq: number, rate: number): number {
  if (rate <= 0) return freq;
  const nyq = rate / 2;
  const period = rate;
  let f = freq % period;
  if (f < 0) f += period;
  return f > nyq ? period - f : f;
}
