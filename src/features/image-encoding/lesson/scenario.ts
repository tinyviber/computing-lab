import { getImageFixture, type ImageFixtureId } from "../domain/fixture";
import { getHallucinationCase } from "../domain/restoration";
import {
  normalizeArtifact,
  normalizeColorStop,
  type Artifact,
  type ColorStop,
} from "../domain/stops";
import { stageCount } from "../domain/stages";

export type ImageScenarioSearch = URLSearchParams | string | Record<string, unknown>;

export type ImageScenarioState = {
  stageIndex: number;
  artifact: Artifact;
  caseId?: string;
};

export const DEFAULT_IMAGE_SCENARIO: ImageScenarioState = {
  stageIndex: 1,
  artifact: { image: "photo", resStop: 50, colorStop: "palette4" },
};

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

function fixtureFromParams(params: URLSearchParams): ImageFixtureId {
  const legacy = params.get("scenario");
  const requested = params.get("image") ?? params.get("fixture");
  if (legacy === "low-sampling") return "checkerboard";
  if (legacy === "high-quantization") return "gradient";
  return getImageFixture(requested as ImageFixtureId).id as ImageFixtureId;
}

function colorStopFromLegacy(params: URLSearchParams): ColorStop {
  const canonical = params.get("colors");
  if (canonical !== null) return normalizeColorStop(canonical);
  if (params.get("color") === "rgb24") return "rgb24";
  const bits = firstNumber(params, ["bits", "bitDepth"]);
  if (bits === undefined) return DEFAULT_IMAGE_SCENARIO.artifact.colorStop;
  if (bits >= 8) return "palette8";
  if (bits >= 4) return "palette4";
  return "palette2";
}

function stageFromParams(params: URLSearchParams): number {
  const requested = firstNumber(params, ["stage"]);
  if (requested !== undefined) {
    return Math.min(stageCount(), Math.max(1, Math.floor(requested)));
  }
  const view = params.get("view");
  if (view === "representation") return 1;
  if (view === "error") return 3;
  if (view !== null) return 2;
  return DEFAULT_IMAGE_SCENARIO.stageIndex;
}

export function parseImageEncodingScenario(input: ImageScenarioSearch): ImageScenarioState {
  const params = toParams(input);
  const legacy = params.get("scenario");
  const sampling =
    firstNumber(params, ["res", "sample", "sampling"]) ??
    (legacy === "low-sampling" ? 25 : legacy === "high-quantization" ? 50 : 50);
  const artifact = normalizeArtifact({
    image: fixtureFromParams(params),
    resStop: sampling,
    colorStop: colorStopFromLegacy(params),
  });
  const requestedCase = params.get("case") ?? undefined;
  const caseId = requestedCase && getHallucinationCase(requestedCase) ? requestedCase : undefined;
  return {
    stageIndex: stageFromParams(params),
    artifact,
    ...(caseId ? { caseId } : {}),
  };
}

export function serializeImageEncodingScenario(state: ImageScenarioState): string {
  const normalized = normalizeArtifact(state.artifact);
  const params = new URLSearchParams();
  params.set("stage", String(Math.min(stageCount(), Math.max(1, Math.floor(state.stageIndex)))));
  params.set("image", normalized.image);
  params.set("res", String(normalized.resStop));
  params.set("colors", normalized.colorStop);
  if (state.caseId && getHallucinationCase(state.caseId)) params.set("case", state.caseId);
  return params.toString();
}

export function scenarioSource(state: ImageScenarioState) {
  return getImageFixture(state.artifact.image);
}
