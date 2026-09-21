/**
 * Image-sampling lesson state: which stage, the draft resolution + code per
 * stage, the cell inspector selection, and the last judge verdict. Pure
 * transitions — no React, no network.
 */

import { MAX_RESOLUTION, MIN_RESOLUTION, type Resolution } from "../domain/downsample.ts";
import type { SamplingJudgeResult } from "../domain/protocol.ts";
import {
  getSamplingStage,
  nextSamplingStage,
  samplingStageUnlocked,
  type SamplingStageDef,
} from "../domain/stages.ts";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** Per-stage student work; persisted in the generic draft_graph column. */
export type StageDraft = {
  width: number | null;
  height: number | null;
  /** Source of the student's choose_size / cell_value code (snapshot only). */
  code: string;
};

export type CellPick = { cx: number; cy: number };

export type SamplingLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, StageDraft>;
  /** Output cell selected in the zoom inspector, if any. */
  selectedCell: CellPick | null;
  judgeOutcome: SamplingJudgeResult | null;
  saveStatus: SaveStatus;
  message: string | null;
};

export type SamplingLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, StageDraft>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-resolution"; width: number; height: number }
  | { type: "set-code"; code: string }
  | { type: "select-cell"; cell: CellPick | null }
  | { type: "judge-result"; outcome: SamplingJudgeResult }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

const clamp = (v: number) => Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, Math.round(v)));

export function emptyDraft(): StageDraft {
  return { width: null, height: null, code: "" };
}

export function draftOf(state: SamplingLessonState, stageIndex = state.stageIndex): StageDraft {
  return state.drafts[stageIndex] ?? emptyDraft();
}

/** Submitted resolution if the draft is complete and legal for the stage. */
export function draftResolution(
  state: SamplingLessonState,
  stage: SamplingStageDef = stageOf(state)!,
): Resolution | null {
  const draft = draftOf(state);
  if (draft.width == null || draft.height == null) return null;
  const width = clamp(draft.width);
  const height = stage.mode === "square" ? width : clamp(draft.height);
  return { width, height };
}

export function stageOf(state: SamplingLessonState): SamplingStageDef | undefined {
  return getSamplingStage(state.stageIndex);
}

export function isStageUnlocked(state: SamplingLessonState, stageIndex: number): boolean {
  return samplingStageUnlocked(state.passedStages, stageIndex);
}

export function createSamplingLessonState(stageIndex = 1): SamplingLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    selectedCell: null,
    judgeOutcome: null,
    saveStatus: "idle",
    message: null,
  };
}

export function transitionSamplingLesson(
  state: SamplingLessonState,
  action: SamplingLessonAction,
): SamplingLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, StageDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        const index = Number(key);
        drafts[index] = sanitizeDraft(draft);
      }
      const stageIndex = samplingStageUnlocked(action.passedStages, state.stageIndex)
        ? state.stageIndex
        : action.currentStage;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        selectedCell: null,
        saveStatus: "idle",
        judgeOutcome: null,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return {
        ...state,
        stageIndex: action.stageIndex,
        selectedCell: null,
        judgeOutcome: null,
      };
    }

    case "set-resolution": {
      const draft = draftOf(state);
      const next: StageDraft = {
        ...draft,
        width: clamp(action.width),
        height: clamp(action.height),
      };
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: next },
        selectedCell: null,
        saveStatus: "dirty",
        // A new resolution invalidates the previous verdict.
        judgeOutcome: null,
      };
    }

    case "set-code": {
      const draft = draftOf(state);
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: { ...draft, code: action.code } },
        saveStatus: "dirty",
      };
    }

    case "select-cell":
      return { ...state, selectedCell: action.cell };

    case "judge-result": {
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextSamplingStage(action.outcome.passedStages),
      };
    }

    case "mark-saving":
      return { ...state, saveStatus: "saving" };
    case "mark-saved":
      return { ...state, saveStatus: "saved" };
    case "mark-save-error":
      return { ...state, saveStatus: "error" };
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}

/** Bound a restored draft at the domain edge; junk fields drop to defaults. */
export function sanitizeDraft(raw: unknown): StageDraft {
  if (!raw || typeof raw !== "object") return emptyDraft();
  const { width, height, code } = raw as {
    width?: unknown;
    height?: unknown;
    code?: unknown;
  };
  const num = (v: unknown) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.max(MIN_RESOLUTION, Math.min(MAX_RESOLUTION, Math.round(v)))
      : null;
  return {
    width: num(width),
    height: num(height),
    code: typeof code === "string" ? code.slice(0, 8000) : "",
  };
}
