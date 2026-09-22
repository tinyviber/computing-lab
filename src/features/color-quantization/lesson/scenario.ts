/**
 * Scenario URL codec for the color-quantization lab — lets a teacher share
 * a reproducible starting point: `?stage=2&toners=0,1,2,5` (pick stages) or
 * `&table=1,-1,…` (free stages). Values are untrusted and re-sanitized at
 * the domain boundary; anything malformed is ignored.
 */

import { sanitizeSubset, sanitizeTable } from "../domain/quantize.ts";
import { getQuantStage } from "../domain/stages.ts";

export type QuantScenario = {
  stageIndex: number | null;
  toners: number[] | null;
  table: number[] | null;
};

function parseIntList(raw: unknown): number[] | null {
  if (typeof raw !== "string") return null;
  const values = raw
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v));
  return values.length ? values : null;
}

export function parseQuantScenario(search: Record<string, unknown>): QuantScenario {
  const stage = Number(search.stage);
  const stageIndex = Number.isInteger(stage) && getQuantStage(stage) ? stage : null;
  return {
    stageIndex,
    toners: sanitizeSubset(parseIntList(search.toners)),
    table: sanitizeTable(parseIntList(search.table)),
  };
}

export function encodeQuantScenario(scenario: {
  stageIndex: number;
  toners?: number[];
  table?: number[] | null;
}): Record<string, string | number> {
  const out: Record<string, string | number> = { stage: scenario.stageIndex };
  if (scenario.toners?.length) out.toners = scenario.toners.join(",");
  if (scenario.table?.length) out.table = scenario.table.join(",");
  return out;
}
