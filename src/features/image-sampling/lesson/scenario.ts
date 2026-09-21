/**
 * URL scenario codec: ?stage=2&w=16&h=8 reproduces a chosen resolution so a
 * teacher can link a specific experiment. Values are clamped at the domain
 * boundary; anything malformed is ignored.
 */

import { sanitizeResolution } from "../domain/downsample.ts";
import { getSamplingStage } from "../domain/stages.ts";

export type SamplingScenario = {
  stageIndex: number | null;
  width: number | null;
  height: number | null;
};

export function parseSamplingScenario(search: Record<string, unknown>): SamplingScenario {
  const int = (v: unknown) => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const stageIndex = int(search.stage);
  const width = int(search.w);
  const height = int(search.h);
  const res =
    width == null && height == null
      ? null
      : sanitizeResolution({ width: width ?? 8, height: height ?? width ?? 8 });
  return {
    stageIndex: stageIndex != null && getSamplingStage(stageIndex) ? stageIndex : null,
    width: res?.width ?? null,
    height: res?.height ?? null,
  };
}

export function encodeSamplingScenario(scenario: SamplingScenario): Record<string, number> {
  const out: Record<string, number> = {};
  if (scenario.stageIndex != null) out.stage = scenario.stageIndex;
  if (scenario.width != null) out.w = scenario.width;
  if (scenario.height != null) out.h = scenario.height;
  return out;
}
