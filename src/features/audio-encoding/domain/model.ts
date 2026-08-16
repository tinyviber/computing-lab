export const AUDIO_DURATION_MS = 1000;
export const AUDIO_MIN_FREQUENCY = 1;
export const AUDIO_MAX_FREQUENCY = 8;
export const AUDIO_MIN_RATE = 8;
export const AUDIO_MAX_RATE = 32;
export const AUDIO_MIN_BITS = 2;
export const AUDIO_MAX_BITS = 8;

export type AudioEncodingOptions = {
  frequency: number;
  sampleRate: number;
  bits: number;
};

export type AudioOptions = AudioEncodingOptions;

export type WavePoint = {
  index: number;
  source: number;
  code: number;
  reconstructed: number;
  quantized: number;
};

export type AudioStats = {
  durationMs: number;
  frequency: number;
  sampleRate: number;
  bits: number;
  sampleCount: number;
  amplitudeLevels: number;
  encodedBits: number;
  encodedBytes: number;
  samplesPerSecond: number;
  quantizationBits: number;
  encodedBitsPerSecond: number;
  encodedBytesPerSecond: number;
  durationSeconds: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalize(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? clamp(Math.round(value), min, max) : min;
}

function normalizeOptions(options: AudioEncodingOptions): AudioEncodingOptions {
  return {
    frequency: normalize(options.frequency, AUDIO_MIN_FREQUENCY, AUDIO_MAX_FREQUENCY),
    sampleRate: normalize(options.sampleRate, AUDIO_MIN_RATE, AUDIO_MAX_RATE),
    bits: normalize(options.bits, AUDIO_MIN_BITS, AUDIO_MAX_BITS),
  };
}

export function calculateAudioStats(options: AudioEncodingOptions): AudioStats {
  const safe = normalizeOptions(options);
  const sampleCount = Math.floor((AUDIO_DURATION_MS * safe.sampleRate) / 1000);
  const encodedBits = sampleCount * safe.bits;

  return {
    durationMs: AUDIO_DURATION_MS,
    frequency: safe.frequency,
    sampleRate: safe.sampleRate,
    bits: safe.bits,
    sampleCount,
    amplitudeLevels: 2 ** safe.bits,
    encodedBits,
    encodedBytes: Math.ceil(encodedBits / 8),
    samplesPerSecond: safe.sampleRate,
    quantizationBits: safe.bits,
    encodedBitsPerSecond: safe.sampleRate * safe.bits,
    encodedBytesPerSecond: Math.ceil((safe.sampleRate * safe.bits) / 8),
    durationSeconds: AUDIO_DURATION_MS / 1000,
  };
}

export function buildWaveform(options: AudioEncodingOptions): WavePoint[] {
  const safe = normalizeOptions(options);
  const sampleCount = Math.floor((AUDIO_DURATION_MS * safe.sampleRate) / 1000);
  const levels = 2 ** safe.bits;

  return Array.from({ length: sampleCount }, (_, index) => {
    const source = Math.sin((2 * Math.PI * safe.frequency * index) / safe.sampleRate);
    const code = clamp(Math.round(((source + 1) / 2) * (levels - 1)), 0, levels - 1);
    const reconstructed = (2 * code) / (levels - 1) - 1;
    return { index: index + 1, source, code, reconstructed, quantized: reconstructed };
  });
}
