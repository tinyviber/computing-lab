import { getSoundFixture, sampleSoundFixture, type SoundSource } from "./fixtures";

export const SOUND_DURATION_MS = 1000;
export const SOUND_MIN_SAMPLE_RATE = 1000;
export const SOUND_MAX_SAMPLE_RATE = 48_000;
export const SOUND_MIN_BIT_DEPTH = 2;
export const SOUND_MAX_BIT_DEPTH = 16;
export const SOUND_MIN_PHASE = 0;
export const SOUND_MAX_PHASE = 1;
export const SOUND_PLOT_POINT_LIMIT = 360;

export type SoundConfig = {
  sampleRate: number;
  bitDepth: number;
  phase: number;
};

export type Quantization = {
  codes: readonly number[];
  levels: number;
  reconstructed: readonly number[];
};

export type SoundCursorReadout = {
  timeMs: number;
  sampleIndex: number;
  sampleTimestampMs: number;
  original: number;
  code: number;
  reconstructed: number;
  error: number;
};

export type SoundPlotPoint = {
  timeMs: number;
  original: number;
  reconstructed: number;
  error: number;
};

export type SoundModel = {
  source: SoundSource;
  config: SoundConfig;
  durationMs: number;
  sampleCount: number;
  original: readonly number[];
  timestamps: readonly number[];
  quantization: Quantization;
  reconstruction: readonly number[];
  sampleHold: readonly number[];
  errors: readonly number[];
  rmsError: number;
  peakError: number;
  nyquistHz: number;
  sourceFrequencyHz: number;
  foldedFrequencyHz: number;
  aliasing: boolean;
  payload: {
    sampleCount: number;
    bitDepth: number;
    totalBits: number;
    totalBytes: number;
    bitsPerSecond: number;
    bytesPerSecond: number;
  };
  cursor: SoundCursorReadout;
  plot: readonly SoundPlotPoint[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeSoundConfig(config: SoundConfig): SoundConfig {
  return {
    sampleRate: clamp(
      Math.round(finiteOr(config.sampleRate, 8000)),
      SOUND_MIN_SAMPLE_RATE,
      SOUND_MAX_SAMPLE_RATE,
    ),
    bitDepth: clamp(
      Math.round(finiteOr(config.bitDepth, 8)),
      SOUND_MIN_BIT_DEPTH,
      SOUND_MAX_BIT_DEPTH,
    ),
    phase: clamp(finiteOr(config.phase, 0), SOUND_MIN_PHASE, SOUND_MAX_PHASE),
  };
}

function quantize(value: number, levels: number): number {
  return clamp(Math.round(((value + 1) / 2) * (levels - 1)), 0, levels - 1);
}

function reconstruct(code: number, levels: number): number {
  return (2 * code) / (levels - 1) - 1;
}

function foldedFrequency(frequencyHz: number, sampleRate: number): number {
  const remainder = frequencyHz % sampleRate;
  const reflected = remainder > sampleRate / 2 ? sampleRate - remainder : remainder;
  return reflected === 0 ? 0 : Math.abs(reflected);
}

function buildPlot(
  source: SoundSource,
  config: SoundConfig,
  timestamps: readonly number[],
  original: readonly number[],
  reconstruction: readonly number[],
  errors: readonly number[],
  durationMs: number,
): SoundPlotPoint[] {
  const count = Math.min(SOUND_PLOT_POINT_LIMIT, Math.max(2, Math.ceil(durationMs / 4)));
  const samplePeriod = 1000 / config.sampleRate;
  return Array.from({ length: count }, (_, index) => {
    const timeMs = (index / (count - 1)) * durationMs;
    const sampleIndex = clamp(Math.floor(timeMs / samplePeriod), 0, reconstruction.length - 1);
    const originalValue = sampleSoundFixture(source, timeMs, config.phase);
    return {
      timeMs,
      original: originalValue,
      reconstructed: reconstruction[sampleIndex] ?? 0,
      error: originalValue - (reconstruction[sampleIndex] ?? 0),
    };
  });
}

function cursorReadout(
  source: SoundSource,
  config: SoundConfig,
  cursorMs: number,
  timestamps: readonly number[],
  original: readonly number[],
  codes: readonly number[],
  reconstruction: readonly number[],
): SoundCursorReadout {
  const safeCursor = clamp(finiteOr(cursorMs, 0), 0, SOUND_DURATION_MS);
  const samplePeriod = 1000 / config.sampleRate;
  const sampleIndex = clamp(Math.floor(safeCursor / samplePeriod), 0, original.length - 1);
  const sampleTimestampMs = timestamps[sampleIndex] ?? 0;
  const originalValue = sampleSoundFixture(source, safeCursor, config.phase);
  const reconstructed = reconstruction[sampleIndex] ?? 0;
  return {
    timeMs: safeCursor,
    sampleIndex,
    sampleTimestampMs,
    original: originalValue,
    code: codes[sampleIndex] ?? 0,
    reconstructed,
    error: originalValue - reconstructed,
  };
}

export function deriveSoundModel(
  source: SoundSource,
  config: SoundConfig,
  cursorMs = 0,
): SoundModel {
  const safeConfig = normalizeSoundConfig(config);
  const fixture = getSoundFixture(source);
  const durationMs = fixture.durationMs;
  const sampleCount = Math.max(1, Math.ceil((durationMs * safeConfig.sampleRate) / 1000));
  const samplePeriod = 1000 / safeConfig.sampleRate;
  const timestamps = Array.from({ length: sampleCount }, (_, index) => index * samplePeriod);
  const original = timestamps.map((timeMs) => sampleSoundFixture(source, timeMs, safeConfig.phase));
  const levels = 2 ** safeConfig.bitDepth;
  const codes = original.map((value) => quantize(value, levels));
  const reconstruction = codes.map((code) => reconstruct(code, levels));
  const errors = original.map((value, index) => value - reconstruction[index]);
  const rmsError = Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length);
  const peakError = errors.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
  const nyquistHz = safeConfig.sampleRate / 2;
  const aliasing = fixture.frequencyHz > nyquistHz;
  const totalBits = sampleCount * safeConfig.bitDepth;
  const cursor = cursorReadout(
    source,
    safeConfig,
    cursorMs,
    timestamps,
    original,
    codes,
    reconstruction,
  );

  return {
    source,
    config: safeConfig,
    durationMs,
    sampleCount,
    original,
    timestamps,
    quantization: { codes, levels, reconstructed: reconstruction },
    reconstruction,
    sampleHold: reconstruction,
    errors,
    rmsError,
    peakError,
    nyquistHz,
    sourceFrequencyHz: fixture.frequencyHz,
    foldedFrequencyHz: foldedFrequency(fixture.frequencyHz, safeConfig.sampleRate),
    aliasing,
    payload: {
      sampleCount,
      bitDepth: safeConfig.bitDepth,
      totalBits,
      totalBytes: Math.ceil(totalBits / 8),
      bitsPerSecond: safeConfig.sampleRate * safeConfig.bitDepth,
      bytesPerSecond: Math.ceil((safeConfig.sampleRate * safeConfig.bitDepth) / 8),
    },
    cursor,
    plot: buildPlot(source, safeConfig, timestamps, original, reconstruction, errors, durationMs),
  };
}

export const buildSoundModel = deriveSoundModel;

// Compatibility aliases for callers of the pre-reference domain surface.
export const AUDIO_DURATION_MS = SOUND_DURATION_MS;
export const AUDIO_MIN_FREQUENCY = 1;
export const AUDIO_MAX_FREQUENCY = 8;
export const AUDIO_MIN_RATE = 8;
export const AUDIO_MAX_RATE = 32;
export const AUDIO_MIN_BITS = 2;
export const AUDIO_MAX_BITS = 8;

export type AudioEncodingOptions = { frequency: number; sampleRate: number; bits: number };
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

export function calculateAudioStats(options: AudioEncodingOptions): AudioStats {
  const frequency = Number.isFinite(options.frequency)
    ? Math.min(AUDIO_MAX_FREQUENCY, Math.max(AUDIO_MIN_FREQUENCY, Math.round(options.frequency)))
    : AUDIO_MIN_FREQUENCY;
  const sampleRate = Number.isFinite(options.sampleRate)
    ? Math.min(AUDIO_MAX_RATE, Math.max(AUDIO_MIN_RATE, Math.round(options.sampleRate)))
    : AUDIO_MIN_RATE;
  const bits = Number.isFinite(options.bits)
    ? Math.min(AUDIO_MAX_BITS, Math.max(AUDIO_MIN_BITS, Math.round(options.bits)))
    : AUDIO_MIN_BITS;
  const encodedBits = sampleRate * bits;
  return {
    durationMs: AUDIO_DURATION_MS,
    frequency,
    sampleRate,
    bits,
    sampleCount: sampleRate,
    amplitudeLevels: 2 ** bits,
    encodedBits,
    encodedBytes: Math.ceil(encodedBits / 8),
    samplesPerSecond: sampleRate,
    quantizationBits: bits,
    encodedBitsPerSecond: encodedBits,
    encodedBytesPerSecond: Math.ceil(encodedBits / 8),
    durationSeconds: 1,
  };
}

export function buildWaveform(options: AudioEncodingOptions): WavePoint[] {
  const frequency = Number.isFinite(options.frequency)
    ? Math.min(AUDIO_MAX_FREQUENCY, Math.max(AUDIO_MIN_FREQUENCY, Math.round(options.frequency)))
    : AUDIO_MIN_FREQUENCY;
  const sampleRate = Number.isFinite(options.sampleRate)
    ? Math.min(AUDIO_MAX_RATE, Math.max(AUDIO_MIN_RATE, Math.round(options.sampleRate)))
    : AUDIO_MIN_RATE;
  const bits = Number.isFinite(options.bits)
    ? Math.min(AUDIO_MAX_BITS, Math.max(AUDIO_MIN_BITS, Math.round(options.bits)))
    : AUDIO_MIN_BITS;
  const levels = 2 ** bits;
  return Array.from({ length: sampleRate }, (_, index) => {
    const source = Math.sin((2 * Math.PI * frequency * index) / sampleRate);
    const code = quantize(source, levels);
    const reconstructed = reconstruct(code, levels);
    return { index: index + 1, source, code, reconstructed, quantized: reconstructed };
  });
}
