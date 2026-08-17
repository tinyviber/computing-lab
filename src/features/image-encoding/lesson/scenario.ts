import { getImageFixture, type ImageFixtureId } from "../domain/fixture";
import {
  MAX_BIT_DEPTH,
  MAX_PHASE,
  MAX_SAMPLING_PERCENT,
  MIN_BIT_DEPTH,
  MIN_PHASE,
  MIN_SAMPLING_PERCENT,
  isSamplingPhaseInert,
  normalizeBitDepth,
  normalizePhase,
  normalizeSamplingPercent,
} from "../domain/model";
import type { ImageView } from "./state";

export type ImageScenarioSearch = URLSearchParams | string | Record<string, unknown>;

export type ImageScenarioState = {
  fixture: ImageFixtureId;
  samplingPercent: number;
  bitDepth: number;
  phase: number;
  view: ImageView;
};

export const DEFAULT_IMAGE_SCENARIO: ImageScenarioState = {
  fixture: "photo",
  samplingPercent: 50,
  bitDepth: 4,
  phase: 0,
  view: "compare",
};

const IMAGE_VIEWS: readonly ImageView[] = [
  "compare",
  "sampling",
  "quantization",
  "representation",
  "error",
];

function toParams(input: ImageScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.set(key, String(firstValue));
  }
  return params;
}

function firstNumber(params: URLSearchParams, keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = params.get(key);
    if (value === null || value.trim() === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function firstInteger(params: URLSearchParams, keys: readonly string[]): number | undefined {
  const value = firstNumber(params, keys);
  return value !== undefined && Number.isInteger(value) ? value : undefined;
}

function fixtureFromParams(params: URLSearchParams): ImageFixtureId {
  const requested = params.get("image") ?? params.get("fixture");
  if (
    requested === "gradient" ||
    requested === "checkerboard" ||
    requested === "text-edge" ||
    requested === "pixel-grid" ||
    requested === "photo"
  )
    return requested;
  const legacy = params.get("scenario");
  if (legacy === "low-sampling") return "checkerboard";
  if (legacy === "high-quantization") return "gradient";
  return DEFAULT_IMAGE_SCENARIO.fixture;
}

function viewFromParams(params: URLSearchParams): ImageView {
  const requested = params.get("view");
  return IMAGE_VIEWS.includes(requested as ImageView)
    ? (requested as ImageView)
    : DEFAULT_IMAGE_SCENARIO.view;
}

function canonicalPhaseForFixture(
  fixture: ImageFixtureId,
  samplingPercent: number,
  phase: number,
): number {
  return isSamplingPhaseInert(getImageFixture(fixture), samplingPercent)
    ? MIN_PHASE
    : normalizePhase(phase);
}

export function parseImageEncodingScenario(input: ImageScenarioSearch): ImageScenarioState {
  const params = toParams(input);
  const fixture = fixtureFromParams(params);
  const legacy = params.get("scenario");
  const legacySampling =
    legacy === "low-sampling" ? 25 : legacy === "high-quantization" ? 75 : undefined;
  const samplingPercent = normalizeSamplingPercent(
    firstInteger(params, ["sample", "sampling"]) ??
      legacySampling ??
      DEFAULT_IMAGE_SCENARIO.samplingPercent,
  );
  const bitDepth = normalizeBitDepth(
    firstInteger(params, ["bits", "bitDepth"]) ??
      (legacy === "high-quantization" ? 2 : DEFAULT_IMAGE_SCENARIO.bitDepth),
  );
  const phase = canonicalPhaseForFixture(
    fixture,
    samplingPercent,
    firstNumber(params, ["phase"]) ?? DEFAULT_IMAGE_SCENARIO.phase,
  );
  return { fixture, samplingPercent, bitDepth, phase, view: viewFromParams(params) };
}

export function serializeImageEncodingScenario(state: ImageScenarioState): string {
  const params = new URLSearchParams();
  params.set("image", state.fixture);
  const samplingPercent = normalizeSamplingPercent(state.samplingPercent);
  params.set("sample", String(samplingPercent));
  params.set(
    "phase",
    canonicalPhaseForFixture(state.fixture, samplingPercent, state.phase).toFixed(2),
  );
  params.set("bits", String(normalizeBitDepth(state.bitDepth)));
  params.set("view", state.view);
  return params.toString();
}

export function scenarioSource(state: ImageScenarioState) {
  return getImageFixture(state.fixture);
}

export const IMAGE_SCENARIO_LIMITS = {
  minSampling: MIN_SAMPLING_PERCENT,
  maxSampling: MAX_SAMPLING_PERCENT,
  minBits: MIN_BIT_DEPTH,
  maxBits: MAX_BIT_DEPTH,
  minPhase: MIN_PHASE,
  maxPhase: MAX_PHASE,
};
