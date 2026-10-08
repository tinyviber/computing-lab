/**
 * The digitization pipeline — the lab's single "encoder".
 *
 * Order of operations mirrors how PCM digitizing is actually taught:
 *   1. channel strategy   — "转单声道" averages all channels into one
 *                           (the mixdown rule shown in the UI); "保留声道"
 *                           keeps the source layout. A mono source stays
 *                           mono either way — we never invent a channel.
 *   2. resample           — windowed-sinc, low-passed below the target
 *                           Nyquist when downsampling (anti-aliasing).
 *   3. quantize           — each float sample is snapped to the nearest of
 *                           2^bits signed levels, clipping at the rails.
 *   4. dequantize         — level codes mapped back to floats so the result
 *                           can be played and compared.
 *
 * The same function runs in the browser (workbench + worker) and in the
 * server judge, so the numbers on screen and the verdict can never drift.
 */

import type { AudioParams, PcmAudio } from "./audio.ts";
import {
  quantizeChannel,
  dequantizeChannel,
  quantizationStats,
  type QuantizationStats,
} from "./quantize.ts";
import { resampleChannel } from "./resample.ts";

export type DigitizePhase = "mixdown" | "resample" | "quantize";

export type DigitizeResult = {
  /** Processed audio at the target rate, listenable as-is. */
  audio: PcmAudio;
  /** Channel count actually produced (≤ params.channels when source is mono). */
  effectiveChannels: number;
  /** Quantization error per output channel (vs the resampled signal). */
  quantization: QuantizationStats[];
};

/** Average channels into one — the lab's only downmix rule. */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice();
  const len = channels[0]?.length ?? 0;
  const out = new Float32Array(len);
  for (const data of channels) {
    for (let i = 0; i < len; i += 1) out[i] += data[i];
  }
  for (let i = 0; i < len; i += 1) out[i] /= channels.length;
  return out;
}

export function digitize(
  audio: PcmAudio,
  params: AudioParams,
  onProgress?: (phase: DigitizePhase, done: number, total: number) => void,
): DigitizeResult {
  const source =
    params.channels === 1 ? [mixToMono(audio.channels)] : audio.channels.map((ch) => ch);
  onProgress?.("mixdown", 1, 1);

  const resampled = source.map((data, i) => {
    const out = resampleChannel(data, audio.sampleRate, params.sampleRate);
    onProgress?.("resample", i + 1, source.length);
    return out;
  });

  const processed = resampled.map((data, i) => {
    const out = dequantizeChannel(quantizeChannel(data, params.bitDepth), params.bitDepth);
    onProgress?.("quantize", i + 1, resampled.length);
    return out;
  });

  return {
    audio: { sampleRate: params.sampleRate, channels: processed },
    effectiveChannels: processed.length,
    quantization: resampled.map((data, i) => quantizationStats(data, processed[i])),
  };
}
