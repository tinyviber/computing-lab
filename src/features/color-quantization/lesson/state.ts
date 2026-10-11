/**
 * Color-quantization lesson state: which stage, the draft toner pick /
 * mapping table + code per stage, and the last judge verdict. Pure
 * transitions — no React, no network.
 */

import type { QuantJudgeResult } from "../domain/protocol.ts";
import {
  SOURCE_COLOR_COUNT,
  TONER_COUNT,
  sanitizeSubset,
  sanitizeTable,
} from "../domain/quantize.ts";
import {
  getQuantStage,
  nextQuantStage,
  quantStageUnlocked,
  type QuantStageDef,
} from "../domain/stages.ts";

export type { SaveStatus } from "../../../shared/api/client";
import {
  markSaveStatus,
  statusForStage,
  type SaveStatusByStage,
} from "../../../shared/lab/saveStatus.ts";

/** Per-stage student work; persisted in the generic draft_graph column. */
export type StageDraft = {
  /** pick mode: selected absolute toner indices. */
  toners: number[];
  /** free mode: mapping table (toner index or -1 per source color). */
  table: number[] | null;
  /** Source of the student's choose_toners / map_color code (snapshot only). */
  code: string;
};

export type QuantLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, StageDraft>;
  judgeOutcome: QuantJudgeResult | null;
  saveStatusByStage: SaveStatusByStage;
  message: string | null;
};

export type QuantLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, StageDraft>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-toners"; toners: number[] }
  | { type: "set-table"; table: number[] }
  | { type: "set-code"; code: string }
  | { type: "judge-result"; outcome: QuantJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-conflict"; stageIndex: number }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function emptyDraft(): StageDraft {
  return { toners: [], table: null, code: "" };
}

export function draftOf(state: QuantLessonState, stageIndex = state.stageIndex): StageDraft {
  return state.drafts[stageIndex] ?? emptyDraft();
}

export function stageOf(state: QuantLessonState): QuantStageDef | undefined {
  return getQuantStage(state.stageIndex);
}

export function isStageUnlocked(state: QuantLessonState, stageIndex: number): boolean {
  return quantStageUnlocked(state.passedStages, stageIndex);
}

export function createQuantLessonState(stageIndex = 1): QuantLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    judgeOutcome: null,
    saveStatusByStage: {},
    message: null,
  };
}

export function transitionQuantLesson(
  state: QuantLessonState,
  action: QuantLessonAction,
): QuantLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, StageDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        const index = Number(key);
        drafts[index] = sanitizeDraft(draft);
      }
      const stageIndex = quantStageUnlocked(action.passedStages, state.stageIndex)
        ? state.stageIndex
        : action.currentStage;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        saveStatusByStage: {},
        judgeOutcome: null,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return { ...state, stageIndex: action.stageIndex, judgeOutcome: null };
    }

    case "set-toners": {
      const draft = draftOf(state);
      const toners = sanitizeSubset(action.toners) ?? draft.toners;
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: { ...draft, toners } },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        // A new selection invalidates the previous verdict.
        judgeOutcome: null,
      };
    }

    case "set-table": {
      const draft = draftOf(state);
      const table = sanitizeTable(action.table) ?? draft.table;
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: { ...draft, table } },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        judgeOutcome: null,
      };
    }

    case "set-code": {
      const draft = draftOf(state);
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: { ...draft, code: action.code } },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
      };
    }

    case "judge-result": {
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextQuantStage(action.outcome.passedStages),
      };
    }

    case "mark-saving":
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
      };
    case "mark-saved":
      // Only a save started from the stage's current dirty state may settle
      // it — a stale completion must not hide a newer dirty draft.
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved"),
      };
    case "mark-save-error":
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "error"),
      };

    case "mark-save-conflict":
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
      };
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}

/** Bound a restored draft at the domain edge; junk fields drop to defaults. */
export function sanitizeDraft(raw: unknown): StageDraft {
  if (!raw || typeof raw !== "object") return emptyDraft();
  const { toners, table, code } = raw as {
    toners?: unknown;
    table?: unknown;
    code?: unknown;
  };
  const cleanToners = (sanitizeSubset(toners) ?? []).slice(0, TONER_COUNT);
  const cleanTable =
    Array.isArray(table) && table.length === SOURCE_COLOR_COUNT ? sanitizeTable(table) : null;
  return {
    toners: cleanToners,
    table: cleanTable,
    code: typeof code === "string" ? code.slice(0, 8000) : "",
  };
}
