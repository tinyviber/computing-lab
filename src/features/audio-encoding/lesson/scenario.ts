import {
  AUDIO_MAX_BITS,
  AUDIO_MAX_FREQUENCY,
  AUDIO_MAX_RATE,
  AUDIO_MIN_BITS,
  AUDIO_MIN_FREQUENCY,
  AUDIO_MIN_RATE,
  type AudioEncodingOptions,
} from "../domain/model";

export type AudioScenario = "balanced" | "low-frequency" | "low-bits";
export type AudioScenarioState = AudioEncodingOptions & { scenario: AudioScenario };

export const DEFAULT_AUDIO_OPTIONS: AudioEncodingOptions = {
  frequency: 2,
  sampleRate: 16,
  bits: 8,
};

export const AUDIO_SCENARIO_PRESETS: Record<
  Exclude<AudioScenario, "balanced">,
  AudioEncodingOptions
> = {
  "low-frequency": { frequency: 1, sampleRate: 8, bits: 8 },
  "low-bits": { frequency: 2, sampleRate: 16, bits: 2 },
};

export type AudioScenarioSearch = URLSearchParams | string | Record<string, unknown>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalize(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? clamp(Math.round(value), min, max) : min;
}

function firstInteger(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : undefined;
}

function toParams(input: AudioScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.set(key, String(firstValue));
  }
  return params;
}

export function parseAudioEncodingScenario(input: AudioScenarioSearch): AudioScenarioState {
  const params = toParams(input);
  const requested = params.get("scenario");
  const scenario: AudioScenario =
    requested === "low-frequency" || requested === "low-bits" ? requested : "balanced";
  const preset = scenario === "balanced" ? DEFAULT_AUDIO_OPTIONS : AUDIO_SCENARIO_PRESETS[scenario];
  const explicitFrequency = firstInteger(params, "frequency");
  const explicitRate = firstInteger(params, "rate") ?? firstInteger(params, "sampleRate");
  const explicitBits = firstInteger(params, "bits");

  return {
    scenario,
    frequency: normalize(
      explicitFrequency ?? preset.frequency,
      AUDIO_MIN_FREQUENCY,
      AUDIO_MAX_FREQUENCY,
    ),
    sampleRate: normalize(explicitRate ?? preset.sampleRate, AUDIO_MIN_RATE, AUDIO_MAX_RATE),
    bits: normalize(explicitBits ?? preset.bits, AUDIO_MIN_BITS, AUDIO_MAX_BITS),
  };
}
