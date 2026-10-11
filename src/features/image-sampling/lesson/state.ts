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

export type { SaveStatus } from "../../../shared/api/client";
import {
  markSaveStatus,
  statusForStage,
  type SaveStatusByStage,
} from "../../../shared/lab/saveStatus.ts";

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
  /** The local drafts a save conflict replaced — kept so the learner can
   *  restore their unsaved version explicitly after reconciling. */
  conflictedLocalDrafts: Record<number, StageDraft>;
  /** Server-assigned revision of each stage's latest applied write — the
   *  next autosave for that stage sends it back as `expectedRevision`. */
  draftRevisions: Record<number, number>;
  /** Output cell selected in the zoom inspector, if any. */
  selectedCell: CellPick | null;
  judgeOutcome: SamplingJudgeResult | null;
  saveStatusByStage: SaveStatusByStage;
  message: string | null;
};

export type SamplingLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, StageDraft>;
      /** Server revisions of the applied drafts, seeded into expectedRevision. */
      draftRevisions?: Record<number, number>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-resolution"; width: number; height: number }
  | { type: "set-code"; code: string }
  | { type: "select-cell"; cell: CellPick | null }
  | { type: "judge-result"; outcome: SamplingJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-conflict"; stageIndex: number }
  | {
      type: "resolve-save-conflict";
      stageIndex: number;
      /** The draft the server holds for the stage; absent → the stage's empty draft. */
      draft?: StageDraft;
      /** Server revision now stored for the stage — seeds the next save. */
      revision?: number;
    }
  | { type: "restore-conflict-draft"; stageIndex: number }
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
    conflictedLocalDrafts: {},
    draftRevisions: {},
    selectedCell: null,
    judgeOutcome: null,
    saveStatusByStage: {},
    message: null,
  };
}

export function transitionSamplingLesson(
  state: SamplingLessonState,
  action: SamplingLessonAction,
): SamplingLessonState {
  switch (action.type) {
    case "load-project": {
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        draftRevisions[Number(key)] = rev;
      }
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
        conflictedLocalDrafts: {},
        draftRevisions,
        selectedCell: null,
        saveStatusByStage: {},
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
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        // A new resolution invalidates the previous verdict.
        judgeOutcome: null,
      };
    }

    case "set-code": {
      const draft = draftOf(state);
      const stage = stageOf(state);
      const next: StageDraft = {
        ...draft,
        code: action.code,
        ...(stage?.requiresChooseSize ? { width: null, height: null } : {}),
      };
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: next },
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        judgeOutcome: stage?.requiresChooseSize ? null : state.judgeOutcome,
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
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
      };
    case "mark-saved": {
      // Only a save started from the stage's current dirty state may settle
      // it — a stale completion must not hide a newer dirty draft.
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      // A fresh applied write supersedes any conflict backup for the stage.
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      return {
        ...state,
        conflictedLocalDrafts,
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved"),
      };
    }
    case "mark-save-error":
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "error"),
      };

    case "mark-save-conflict": {
      // "saving" is the write that was refused; "dirty" means the learner
      // edited past it — the conflict still lands so it stays visible.
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
      };
    }

    case "resolve-save-conflict": {
      // Per-stage reconcile after a refused write: swap ONLY the conflicted
      // stage's draft for the server's copy and land its conflict flag in the
      // same transition — every other stage's local draft and save flag is
      // left untouched. The replaced local draft is stashed in
      // conflictedLocalDrafts so the learner can still recover it. Settles
      // while the stage waits on its save — and on a dirty flag too: a
      // fenced stage cannot retry its own save, so the reconcile must still
      // land (the stash keeps those newer edits recoverable the same way).
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty") return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      const localDraft = state.drafts[action.stageIndex];
      if (localDraft !== undefined) conflictedLocalDrafts[action.stageIndex] = localDraft;
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: sanitizeDraft(action.draft ?? {}) },
        conflictedLocalDrafts,
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
        selectedCell: action.stageIndex === state.stageIndex ? null : state.selectedCell,
        judgeOutcome: action.stageIndex === state.stageIndex ? null : state.judgeOutcome,
      };
    }

    case "restore-conflict-draft": {
      // The learner explicitly keeps their pre-conflict version: it returns
      // as a dirty draft and autosave re-arms — expectedRevision is now the
      // reconciled server revision, so the write supersedes legitimately
      // (or loses OCC to an even newer write → a fresh conflict).
      const backup = state.conflictedLocalDrafts[action.stageIndex];
      if (backup === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: backup },
        conflictedLocalDrafts,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
        selectedCell: action.stageIndex === state.stageIndex ? null : state.selectedCell,
        judgeOutcome: action.stageIndex === state.stageIndex ? null : state.judgeOutcome,
      };
    }
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
