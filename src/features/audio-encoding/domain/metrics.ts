/**
 * PCM arithmetic and small measurement helpers.
 *
 * The data-rate and size formulas are *theoretical estimates* — raw PCM
 * payload only. They deliberately exclude WAV/container headers, metadata,
 * and alignment padding, and they are not the size an MP3/AAC/Opus encoder
 * would produce. The UI labels them as estimates wherever they appear.
 */

import type { AudioParams, PcmAudio } from "./audio.ts";
import { durationOf } from "./audio.ts";

/** Uncompressed PCM bit rate in bits/second: rate × depth × channels. */
export function pcmBitRate(params: AudioParams): number {
  return params.sampleRate * params.bitDepth * params.channels;
}

/** Uncompressed PCM payload in bytes for `seconds` of audio. */
export function pcmByteSize(params: AudioParams, seconds: number): number {
  return Math.ceil(params.sampleRate * (params.bitDepth / 8) * params.channels * seconds || 0);
}

/** Largest absolute sample in a channel, in [0, 1]. */
export function peakOf(data: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
  return peak;
}

/** Peak across all channels. */
export function audioPeak(audio: PcmAudio): number {
  let peak = 0;
  for (const ch of audio.channels) peak = Math.max(peak, peakOf(ch));
  return peak;
}

/** Seconds of audio a PCM buffer holds. */
export function pcmSeconds(audio: PcmAudio): number {
  return durationOf(audio);
}

/* ---- display formatting (pure, kept next to the numbers) ------------- */

export function formatHz(hz: number): string {
  return hz >= 1000 ? `${(hz / 1000).toFixed(hz % 1000 === 0 ? 0 : 1)} kHz` : `${hz} Hz`;
}

export function formatKbps(bps: number): string {
  return `${(bps / 1000).toFixed(bps % 1000 === 0 ? 0 : 1)} kbps`;
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function formatDb(db: number): string {
  return Number.isFinite(db) ? `${db.toFixed(1)} dB` : "∞（误差为 0）";
}
