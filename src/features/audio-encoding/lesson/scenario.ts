/**
 * Scenario URL codec for the audio-encoding lab — lets a teacher share a
 * reproducible starting point: `?stage=2&rate=11025&bits=8&ch=2`.
 * Values are untrusted and re-sanitized at the domain boundary; anything
 * malformed is ignored.
 */

import {
  MAX_BIT_DEPTH,
  MAX_SAMPLE_RATE,
  MIN_BIT_DEPTH,
  MIN_SAMPLE_RATE,
  type AudioParams,
} from "../domain/audio.ts";
import { getAudioStage } from "../domain/stages.ts";
import type { AudioLessonAction, AudioLessonState } from "./state.ts";
import { isStageUnlocked } from "./state.ts";

export type AudioScenario = {
  stageIndex: number | null;
  params: Partial<AudioParams> | null;
};

const numberOrNull = (raw: unknown): number | null => {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

export function parseAudioScenario(search: Record<string, unknown>): AudioScenario {
  const stage = Number(search.stage);
  const stageIndex = Number.isInteger(stage) && getAudioStage(stage) ? stage : null;

  const params: Partial<AudioParams> = {};
  const rate = numberOrNull(search.rate);
  if (rate !== null) params.sampleRate = Math.round(clamp(rate, MIN_SAMPLE_RATE, MAX_SAMPLE_RATE));
  const bits = numberOrNull(search.bits);
  if (bits !== null) params.bitDepth = Math.round(clamp(bits, MIN_BIT_DEPTH, MAX_BIT_DEPTH));
  const ch = numberOrNull(search.ch);
  if (ch === 1 || ch === 2) params.channels = ch;

  return { stageIndex, params: Object.keys(params).length > 0 ? params : null };
}

export function encodeAudioScenario(scenario: {
  stageIndex: number;
  params?: Partial<AudioParams>;
}): Record<string, string | number> {
  const out: Record<string, string | number> = { stage: scenario.stageIndex };
  if (scenario.params?.sampleRate) out.rate = scenario.params.sampleRate;
  if (scenario.params?.bitDepth) out.bits = scenario.params.bitDepth;
  if (scenario.params?.channels) out.ch = scenario.params.channels;
  return out;
}

/**
 * Convert a scenario into actions to apply it to the lesson state.
 * Rules (same as the image labs):
 * - Stage specified but not unlocked: return [] (apply nothing).
 * - Stage specified and unlocked: select-stage, then apply params.
 * - Stage not specified: apply params to the current stage.
 */
export function audioScenarioActions(
  state: AudioLessonState,
  scenario: AudioScenario,
): AudioLessonAction[] {
  const actions: AudioLessonAction[] = [];
  if (scenario.stageIndex != null && !isStageUnlocked(state, scenario.stageIndex)) {
    return [];
  }
  if (scenario.stageIndex != null) {
    actions.push({ type: "select-stage", stageIndex: scenario.stageIndex });
  }
  if (scenario.params) {
    actions.push({ type: "set-params", params: scenario.params });
  }
  return actions;
}
