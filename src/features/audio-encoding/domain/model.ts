import {
  getSoundFixture,
  sampleSoundFixture,
  type SoundComponent,
  type SoundSource,
} from "./fixtures";

export const SOUND_DURATION_MS = 1000;
export const SOUND_MIN_SAMPLE_RATE = 2;
export const SOUND_MAX_SAMPLE_RATE = 44_100;
export const SOUND_MIN_BIT_DEPTH = 2;
export const SOUND_MAX_BIT_DEPTH = 16;
export const SOUND_MIN_PHASE = 0;
export const SOUND_MAX_PHASE = 1;
export const SOUND_PLOT_POINT_LIMIT = 720;
export const SOUND_PLOT_HARMONIC_DENSITY = 12;

export type SoundPlotWindow = {
  startMs: number;
  endMs: number;
};

export type QuantizationPreviewPoint = { code: number; value: number };

export type SoundConfig = {
  sampleRate: number;
  bitDepth: number;
  phase: number;
};

export type Quantization = {
  codes: readonly number[];
  levels: number;
  levelValues: readonly number[];
  reconstructed: readonly number[];
  preview: readonly QuantizationPreviewPoint[];
};

export type SoundSample = {
  index: number;
  timestampMs: number;
  original: number;
  code: number;
  reconstructed: number;
  error: number;
};

export type AliasingClassification = "below" | "at" | "aliased";

export type SoundAliasingComponent = SoundComponent & {
  classification: AliasingClassification;
  foldedFrequencyHz: number;
};

export type SoundAliasingEvidence = {
  anyAliasing: boolean;
  components: readonly SoundAliasingComponent[];
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
  samples: readonly SoundSample[];
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
  anyAliasing: boolean;
  components: readonly SoundComponent[];
  aliasingEvidence: SoundAliasingEvidence;
  cursorAt: (timeMs: number) => SoundCursorReadout;
  payload: {
    sampleCount: number;
    bitDepth: number;
    totalBits: number;
    totalBytes: number;
    bitsPerSecond: number;
    bytesPerSecond: number;
  };
  cursor: SoundCursorReadout;
  plotWindow: SoundPlotWindow;
  plot: readonly SoundPlotPoint[];
  reconstructAt: (timeMs: number) => number;
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
    phase: normalizePhase(config.phase),
  };
}

export function normalizePhase(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  const wrapped = value % 1;
  return wrapped;
}

function quantize(value: number, levels: number): number {
  return clamp(Math.round(((value + 1) / 2) * (levels - 1)), 0, levels - 1);
}

function reconstruct(code: number, levels: number): number {
  return (2 * code) / (levels - 1) - 1;
}

const quantizationLevelCache = new Map<number, readonly number[]>();

function getQuantizationLevels(levels: number): readonly number[] {
  const cached = quantizationLevelCache.get(levels);
  if (cached) return cached;

  const values = Object.freeze(
    Array.from({ length: levels }, (_, index) => reconstruct(index, levels)),
  );
  quantizationLevelCache.set(levels, values);
  return values;
}

export function decimateQuantizationLevels(
  levelValues: readonly number[],
  maxPoints = 24,
): QuantizationPreviewPoint[] {
  if (levelValues.length === 0) return [];
  const count = Math.min(levelValues.length, Math.max(2, Math.floor(maxPoints)));
  if (count === 1) return [{ code: 0, value: levelValues[0] }];
  return Array.from({ length: count }, (_, index) => {
    const code = Math.round((index * (levelValues.length - 1)) / (count - 1));
    return { code, value: levelValues[code] };
  });
}

export function foldedFrequency(frequencyHz: number, sampleRate: number): number {
  const remainder = ((frequencyHz % sampleRate) + sampleRate) % sampleRate;
  const reflected = remainder > sampleRate / 2 ? sampleRate - remainder : remainder;
  return Math.abs(reflected);
}

function classifyFrequency(frequencyHz: number, nyquistHz: number): AliasingClassification {
  if (frequencyHz === nyquistHz) return "at";
  if (frequencyHz < nyquistHz) return "below";
  return "aliased";
}

function sampleIndexAt(timeMs: number, timestamps: readonly number[], durationMs: number): number {
  if (timestamps.length === 0) return -1;
  const safeTime = clamp(finiteOr(timeMs, 0), 0, durationMs);
  let low = 0;
  let high = timestamps.length - 1;
  let result = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (timestamps[middle] <= safeTime) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return result;
}

export function reconstructAt(
  timeMs: number,
  timestamps: readonly number[],
  reconstruction: readonly number[],
  durationMs = SOUND_DURATION_MS,
): number {
  if (reconstruction.length === 0) return 0;
  const index = sampleIndexAt(timeMs, timestamps, durationMs);
  return reconstruction[Math.max(0, index)] ?? 0;
}

function normalizePlotWindow(
  source: SoundSource,
  durationMs: number,
  plotWindow?: SoundPlotWindow,
): SoundPlotWindow {
  const fixture = getSoundFixture(source);
  const defaultWindowMs = Math.min(durationMs, 4000 / Math.max(fixture.frequencyHz, 1));
  const maxStartMs = Math.max(0, durationMs - 0.001);
  const startMs = clamp(finiteOr(plotWindow?.startMs ?? 0, 0), 0, maxStartMs);
  const requestedEnd = finiteOr(plotWindow?.endMs ?? defaultWindowMs, defaultWindowMs);
  const endMs = clamp(Math.max(requestedEnd, startMs + 0.001), startMs + 0.001, durationMs);
  return { startMs, endMs };
}

function buildPlot(
  source: SoundSource,
  timestamps: readonly number[],
  reconstruction: readonly number[],
  durationMs: number,
  plotWindow: SoundPlotWindow,
): SoundPlotPoint[] {
  const fixture = getSoundFixture(source);
  const highestFrequency = Math.max(
    ...fixture.components.map((component) => component.frequencyHz),
  );
  const { startMs, endMs } = plotWindow;
  const windowMs = endMs - startMs;
  const requiredIntervals = Math.ceil(
    (windowMs * highestFrequency * SOUND_PLOT_HARMONIC_DENSITY) / 1000,
  );
  const count = Math.min(SOUND_PLOT_POINT_LIMIT, Math.max(2, requiredIntervals + 1));
  return Array.from({ length: count }, (_, index) => {
    const timeMs = startMs + (index / (count - 1)) * windowMs;
    const sampleIndex = sampleIndexAt(timeMs, timestamps, durationMs);
    const originalValue = sampleSoundFixture(source, timeMs);
    return {
      timeMs,
      original: originalValue,
      reconstructed: reconstruction[Math.max(0, sampleIndex)] ?? 0,
      error: originalValue - (reconstruction[Math.max(0, sampleIndex)] ?? 0),
    };
  });
}

function cursorReadout(
  source: SoundSource,
  cursorMs: number,
  timestamps: readonly number[],
  original: readonly number[],
  codes: readonly number[],
  reconstruction: readonly number[],
  durationMs: number,
): SoundCursorReadout {
  const safeCursor = clamp(finiteOr(cursorMs, 0), 0, durationMs);
  const sampleIndex = sampleIndexAt(safeCursor, timestamps, durationMs);
  const sampleTimestampMs = timestamps[sampleIndex] ?? 0;
  const originalValue = sampleSoundFixture(source, safeCursor);
  const reconstructed = reconstruction[Math.max(0, sampleIndex)] ?? 0;
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
  plotWindow?: SoundPlotWindow,
): SoundModel {
  const safeConfig = normalizeSoundConfig(config);
  const fixture = getSoundFixture(source);
  const durationMs = fixture.durationMs;
  const sampleLimit = (durationMs * safeConfig.sampleRate) / 1000 - safeConfig.phase;
  const sampleCount = Math.max(0, Math.ceil(sampleLimit));
  const timestamps = Array.from(
    { length: sampleCount },
    (_, index) => ((index + safeConfig.phase) / safeConfig.sampleRate) * 1000,
  );
  const original = timestamps.map((timeMs) => sampleSoundFixture(source, timeMs));
  const levels = 2 ** safeConfig.bitDepth;
  const levelValues = getQuantizationLevels(levels);
  const codes = original.map((value) => quantize(value, levels));
  const reconstruction = codes.map((code) => reconstruct(code, levels));
  const errors = original.map((value, index) => value - reconstruction[index]);
  const rmsError = errors.length
    ? Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length)
    : 0;
  const peakError = errors.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);
  const nyquistHz = safeConfig.sampleRate / 2;
  const aliasingComponents = fixture.components.map((component) => ({
    ...component,
    classification: classifyFrequency(component.frequencyHz, nyquistHz),
    foldedFrequencyHz: foldedFrequency(component.frequencyHz, safeConfig.sampleRate),
  }));
  const anyAliasing = aliasingComponents.some(
    (component) => component.classification === "aliased",
  );
  const aliasingEvidence = { anyAliasing, components: aliasingComponents };
  const totalBits = sampleCount * safeConfig.bitDepth;
  const normalizedPlotWindow = normalizePlotWindow(source, durationMs, plotWindow);
  const cursor = cursorReadout(
    source,
    cursorMs,
    timestamps,
    original,
    codes,
    reconstruction,
    durationMs,
  );
  const samples = timestamps.map((timestampMs, index) => ({
    index,
    timestampMs,
    original: original[index],
    code: codes[index],
    reconstructed: reconstruction[index],
    error: errors[index],
  }));

  return {
    source,
    config: safeConfig,
    durationMs,
    sampleCount,
    original,
    timestamps,
    samples,
    quantization: {
      codes,
      levels,
      levelValues,
      preview: decimateQuantizationLevels(levelValues),
      reconstructed: reconstruction,
    },
    reconstruction,
    sampleHold: reconstruction,
    errors,
    rmsError,
    peakError,
    nyquistHz,
    sourceFrequencyHz: fixture.frequencyHz,
    foldedFrequencyHz: foldedFrequency(fixture.frequencyHz, safeConfig.sampleRate),
    aliasing: anyAliasing,
    anyAliasing,
    components: fixture.components,
    aliasingEvidence,
    payload: {
      sampleCount,
      bitDepth: safeConfig.bitDepth,
      totalBits,
      totalBytes: Math.ceil(totalBits / 8),
      bitsPerSecond: safeConfig.sampleRate * safeConfig.bitDepth,
      bytesPerSecond: Math.ceil((safeConfig.sampleRate * safeConfig.bitDepth) / 8),
    },
    cursor,
    plotWindow: normalizedPlotWindow,
    plot: buildPlot(source, timestamps, reconstruction, durationMs, normalizedPlotWindow),
    reconstructAt: (timeMs: number) =>
      reconstructAt(timeMs, timestamps, reconstruction, durationMs),
    cursorAt: (timeMs: number) =>
      cursorReadout(source, timeMs, timestamps, original, codes, reconstruction, durationMs),
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
