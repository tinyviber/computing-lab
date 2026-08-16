import {
  SOUND_MAX_BIT_DEPTH,
  SOUND_MAX_PHASE,
  SOUND_MAX_SAMPLE_RATE,
  SOUND_MIN_BIT_DEPTH,
  SOUND_MIN_PHASE,
  SOUND_MIN_SAMPLE_RATE,
  type SoundConfig,
} from "../domain/model";
import { SOUND_FIXTURES, type SoundSource } from "../domain/fixtures";

export type SoundMode = "compare" | "aliasing" | "quantization";
export type SoundView = "compare" | "samples" | "levels" | "error";
export type SoundLoop = "off" | { startMs: number; endMs: number };

export type SoundScenario = SoundConfig & {
  source: SoundSource;
  mode: SoundMode;
  loop: SoundLoop;
  view: SoundView;
  durationMs?: number;
};

export const DEFAULT_SOUND_SCENARIO: SoundScenario = {
  source: "pure440",
  sampleRate: 8000,
  bitDepth: 8,
  phase: 0,
  mode: "compare",
  loop: "off",
  view: "compare",
};

export type SoundScenarioSearch = URLSearchParams | string | Record<string, unknown>;

const SOURCES = new Set<SoundSource>(Object.keys(SOUND_FIXTURES) as SoundSource[]);
const MODES = new Set<SoundMode>(["compare", "aliasing", "quantization"]);
const VIEWS = new Set<SoundView>(["compare", "samples", "levels", "error"]);

function toParams(input: SoundScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.set(key, String(firstValue));
  }
  return params;
}

function firstFinite(params: URLSearchParams, key: string): number | undefined {
  const raw = params.get(key);
  if (raw === null || raw.trim() === "") return undefined;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function bounded(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
  integer = false,
): number {
  if (value === undefined) return fallback;
  return Math.min(max, Math.max(min, integer ? Math.round(value) : value));
}

function firstEnum<T extends string>(
  params: URLSearchParams,
  key: string,
  values: Set<T>,
): T | undefined {
  const raw = params.get(key);
  return raw !== null && values.has(raw as T) ? (raw as T) : undefined;
}

function parseLoop(raw: string | null): SoundLoop | undefined {
  if (raw === null || raw === "off") return raw === "off" ? "off" : undefined;
  if (raw === "on") return { startMs: 0, endMs: SOUND_FIXTURES.pure440.durationMs };
  const parts = raw.split(/[,:-]/).map(Number);
  if (parts.length !== 2 || parts.some((value) => !Number.isFinite(value))) return undefined;
  const [startMs, endMs] = parts;
  if (startMs < 0 || endMs > 1000 || startMs >= endMs) return undefined;
  return { startMs, endMs };
}

export function parseSoundScenario(input: SoundScenarioSearch): SoundScenario {
  const params = toParams(input);
  const sourceKeyPresent = params.has("source");
  const sampleRateKeyPresent = params.has("sampleRate");
  const bitDepthKeyPresent = params.has("bitDepth");
  const phaseKeyPresent = params.has("phase");
  const modeKeyPresent = params.has("mode");
  const loopKeyPresent = params.has("loop");
  const viewKeyPresent = params.has("view");

  const legacyScenario = params.get("scenario");
  const legacySource: SoundSource = legacyScenario === "sawtooth" ? "sawtooth" : "pure440";
  const legacyRate = legacyScenario === "low-frequency" ? 4000 : DEFAULT_SOUND_SCENARIO.sampleRate;
  const legacyBits = legacyScenario === "low-bits" ? 4 : DEFAULT_SOUND_SCENARIO.bitDepth;

  const requestedSource = firstEnum(params, "source", SOURCES);
  const loop = loopKeyPresent ? parseLoop(params.get("loop")) : undefined;
  return {
    source: sourceKeyPresent ? (requestedSource ?? DEFAULT_SOUND_SCENARIO.source) : legacySource,
    sampleRate: bounded(
      sampleRateKeyPresent ? firstFinite(params, "sampleRate") : firstFinite(params, "rate"),
      sampleRateKeyPresent ? DEFAULT_SOUND_SCENARIO.sampleRate : legacyRate,
      SOUND_MIN_SAMPLE_RATE,
      SOUND_MAX_SAMPLE_RATE,
      true,
    ),
    bitDepth: bounded(
      bitDepthKeyPresent ? firstFinite(params, "bitDepth") : firstFinite(params, "bits"),
      bitDepthKeyPresent ? DEFAULT_SOUND_SCENARIO.bitDepth : legacyBits,
      SOUND_MIN_BIT_DEPTH,
      SOUND_MAX_BIT_DEPTH,
      true,
    ),
    phase: bounded(
      phaseKeyPresent ? firstFinite(params, "phase") : undefined,
      DEFAULT_SOUND_SCENARIO.phase,
      SOUND_MIN_PHASE,
      SOUND_MAX_PHASE,
    ),
    mode: modeKeyPresent
      ? (firstEnum(params, "mode", MODES) ?? DEFAULT_SOUND_SCENARIO.mode)
      : DEFAULT_SOUND_SCENARIO.mode,
    loop: loopKeyPresent ? (loop ?? DEFAULT_SOUND_SCENARIO.loop) : DEFAULT_SOUND_SCENARIO.loop,
    view: viewKeyPresent
      ? (firstEnum(params, "view", VIEWS) ?? DEFAULT_SOUND_SCENARIO.view)
      : DEFAULT_SOUND_SCENARIO.view,
  };
}

export const parseAudioEncodingScenario = parseSoundScenario;

function loopValue(loop: SoundLoop): string {
  return loop === "off" ? "off" : `${loop.startMs},${loop.endMs}`;
}

export function serializeSoundScenario(scenario: SoundScenario): string {
  const params = new URLSearchParams();
  if (scenario.source !== DEFAULT_SOUND_SCENARIO.source) params.set("source", scenario.source);
  if (scenario.sampleRate !== DEFAULT_SOUND_SCENARIO.sampleRate) {
    params.set("sampleRate", String(scenario.sampleRate));
  }
  if (scenario.bitDepth !== DEFAULT_SOUND_SCENARIO.bitDepth) {
    params.set("bitDepth", String(scenario.bitDepth));
  }
  if (scenario.phase !== DEFAULT_SOUND_SCENARIO.phase) params.set("phase", String(scenario.phase));
  if (scenario.mode !== DEFAULT_SOUND_SCENARIO.mode) params.set("mode", scenario.mode);
  if (scenario.loop !== DEFAULT_SOUND_SCENARIO.loop) params.set("loop", loopValue(scenario.loop));
  if (scenario.view !== DEFAULT_SOUND_SCENARIO.view) params.set("view", scenario.view);
  return params.toString();
}

export const serializeAudioEncodingScenario = serializeSoundScenario;
