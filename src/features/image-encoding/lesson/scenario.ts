import type { EncodingOptions } from "../domain/model";

export type ImageScenario = "balanced" | "low-sampling" | "high-quantization";

export type ImageScenarioState = EncodingOptions & {
  scenario: ImageScenario;
  sampling: number;
};

export const DEFAULT_IMAGE_OPTIONS = { density: 4, bits: 8 } as const;

export const IMAGE_SCENARIO_PRESETS: Record<Exclude<ImageScenario, "balanced">, EncodingOptions> = {
  "low-sampling": { density: 2, bits: 8 },
  "high-quantization": { density: 8, bits: 2 },
};

export type ImageScenarioSearch = URLSearchParams | string | Record<string, unknown>;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function firstInteger(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : undefined;
}

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

/** Parse shareable lesson state: default → preset → first valid explicit value → clamp. */
export function parseImageEncodingScenario(input: ImageScenarioSearch): ImageScenarioState {
  const params = toParams(input);
  const requested = params.get("scenario");
  const scenario: ImageScenario =
    requested === "low-sampling" || requested === "high-quantization" ? requested : "balanced";
  const preset = scenario === "balanced" ? DEFAULT_IMAGE_OPTIONS : IMAGE_SCENARIO_PRESETS[scenario];
  const explicitSampling = firstInteger(params, "sampling");
  const explicitDensity = firstInteger(params, "density");
  const explicitBits = firstInteger(params, "bits");
  const density = clamp(explicitSampling ?? explicitDensity ?? preset.density, 2, 8);
  const bits = clamp(explicitBits ?? preset.bits, 2, 8);

  return { scenario, density, sampling: density, bits };
}
