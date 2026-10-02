/**
 * Scenario URL codec for the color-quantization lab — lets a teacher share
 * a reproducible starting point: `?stage=2&toners=0,1,2,5` (pick stages) or
 * `&table=1,-1,…` (free stages). Values are untrusted and re-sanitized at
 * the domain boundary; anything malformed is ignored.
 */

import { sanitizeSubset, sanitizeTable } from "../domain/quantize.ts";
import { getQuantStage } from "../domain/stages.ts";
import type { QuantLessonAction, QuantLessonState } from "./state.ts";
import { isStageUnlocked } from "./state.ts";

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

/**
 * Convert a scenario into actions to apply it to the lesson state.
 * Rules:
 * - If stage specified but not unlocked: return [] (apply nothing).
 * - If stage specified and unlocked: select-stage, then apply params.
 * - If stage not specified: apply params to current stage.
 */
export function quantScenarioActions(
  state: QuantLessonState,
  scenario: QuantScenario,
): QuantLessonAction[] {
  const actions: QuantLessonAction[] = [];

  // If stage specified but not unlocked, drop everything
  if (scenario.stageIndex != null && !isStageUnlocked(state, scenario.stageIndex)) {
    return [];
  }

  // If stage specified and unlocked, select it
  if (scenario.stageIndex != null) {
    actions.push({ type: "select-stage", stageIndex: scenario.stageIndex });
  }

  // Apply toners/table
  if (scenario.toners) {
    actions.push({ type: "set-toners", toners: scenario.toners });
  }
  if (scenario.table) {
    actions.push({ type: "set-table", table: scenario.table });
  }

  return actions;
}
