/**
 * Shared audio contracts for the audio-encoding lab.
 *
 * Audio is plain data here: a list of mono channels of normalized float
 * samples in [-1, 1] plus the sample rate they were measured at. No Web
 * Audio types leak in — the browser layer decodes/encodes at the edge so
 * the same code runs in the UI, the processing worker, and the server
 * judge verbatim.
 */

export type PcmAudio = {
  /** Samples per second. */
  sampleRate: number;
  /** One Float32Array per channel (1 = mono, 2 = stereo here). */
  channels: Float32Array[];
};

export function durationOf(audio: PcmAudio): number {
  const frames = audio.channels[0]?.length ?? 0;
  return audio.sampleRate > 0 ? frames / audio.sampleRate : 0;
}

export function channelCountOf(audio: PcmAudio): number {
  return audio.channels.length;
}

/** Digitization knobs the student turns. */
export type AudioParams = {
  /** Target sample rate in Hz. */
  sampleRate: number;
  /** Quantization depth in bits per sample. */
  bitDepth: number;
  /** Output channel count: 1 = mix down to mono, 2 = keep stereo. */
  channels: 1 | 2;
};

/** Teaching presets for the target rate; custom integer rates are allowed. */
export const SAMPLE_RATE_PRESETS = [4000, 8000, 11025, 16000, 22050, 32000, 44100, 48000] as const;

/** Bit depths offered in the workbench. */
export const BIT_DEPTH_PRESETS = [2, 4, 6, 8, 12, 16, 24] as const;

/** Bounds applied at the domain boundary — anything outside is rejected. */
export const MIN_SAMPLE_RATE = 2000;
export const MAX_SAMPLE_RATE = 96000;
export const MIN_BIT_DEPTH = 2;
export const MAX_BIT_DEPTH = 24;
/** Imported/recorded material longer than this is refused (memory bound). */
export const MAX_AUDIO_SECONDS = 60;
/** Fixture signals never exceed this length — renders stay cheap. */
export const FIXTURE_MAX_SECONDS = 8;

export const DEFAULT_PARAMS: AudioParams = { sampleRate: 8000, bitDepth: 8, channels: 1 };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Clamp untrusted params into the supported ranges. Returns null when the
 * input is not a usable object at all — callers fall back to defaults.
 */
export function sanitizeParams(raw: unknown): AudioParams {
  const input = (raw ?? {}) as Record<string, unknown>;
  const rate = isFiniteNumber(input.sampleRate)
    ? Math.round(input.sampleRate)
    : DEFAULT_PARAMS.sampleRate;
  const bits = isFiniteNumber(input.bitDepth)
    ? Math.round(input.bitDepth)
    : DEFAULT_PARAMS.bitDepth;
  const channels = input.channels === 2 ? 2 : 1;
  return {
    sampleRate: Math.min(MAX_SAMPLE_RATE, Math.max(MIN_SAMPLE_RATE, rate)),
    bitDepth: Math.min(MAX_BIT_DEPTH, Math.max(MIN_BIT_DEPTH, bits)),
    channels,
  };
}
