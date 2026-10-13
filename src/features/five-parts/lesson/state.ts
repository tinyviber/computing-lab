/**
 * Five-parts lesson state: which page (stage), each page's draft (inputs a/b,
 * walkthrough step, picked answer, storage demo), and the judge verdict per
 * page. Pure transitions — no React, no network.
 */

import { clampDigit, STEP_COUNT } from "../domain/demo.ts";
import { PHONE_STEP_COUNT } from "../domain/phone.ts";
import type { FivePartsDraft, FivePartsJudgeResult } from "../domain/protocol.ts";
import {
  FIVE_PARTS_STAGES,
  fivePartsStageUnlocked,
  getFivePartsStage,
  nextFivePartsStage,
} from "../domain/stages.ts";
import {
  applyStorageOp,
  initialStorage,
  sanitizeStorage,
  type StorageOp,
} from "../domain/storage.ts";

export type { SaveStatus } from "../../../shared/api/client";
import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";

export type FivePartsLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, FivePartsDraft>;
  /** The local drafts a save conflict replaced — kept so the learner can
   *  restore their unsaved version explicitly after reconciling. */
  conflictedLocalDrafts: Record<number, FivePartsDraft>;
  /** Server-assigned revision of each stage's latest applied write. */
  draftRevisions: Record<number, number>;
  /** Latest verdict per page — a reply only ever shows on its own page. */
  verdicts: Record<number, FivePartsJudgeResult>;
  saveStatusByStage: SaveStatusByStage;
  /** Stages with an unreconciled sync-error — the retry stays visible. */
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type FivePartsLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, FivePartsDraft>;
      draftRevisions?: Record<number, number>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-input"; field: "a" | "b"; value: number }
  | { type: "set-step"; step: number }
  | { type: "set-answer"; optionId: string }
  | { type: "storage-op"; op: StorageOp }
  | { type: "judge-result"; outcome: FivePartsJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | {
      type: "resolve-save-conflict";
      stageIndex: number;
      draft?: FivePartsDraft;
      revision?: number;
    }
  | { type: "restore-conflict-draft"; stageIndex: number }
  | { type: "discard-conflict-draft"; stageIndex: number }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function emptyDraft(): FivePartsDraft {
  // First-run defaults per the lab spec: 3 and 5, nothing stepped yet.
  return { a: 3, b: 5, step: 0, answer: null, storage: initialStorage() };
}

/** Last walkthrough step on a page: the add demo has 4, the phone photo 5. */
export function stepCountFor(stageIndex: number): number {
  return getFivePartsStage(stageIndex)?.id === "phone" ? PHONE_STEP_COUNT : STEP_COUNT;
}

export function draftOf(
  state: FivePartsLessonState,
  stageIndex = state.stageIndex,
): FivePartsDraft {
  return state.drafts[stageIndex] ?? emptyDraft();
}

export function isStageUnlocked(state: FivePartsLessonState, stageIndex: number): boolean {
  return fivePartsStageUnlocked(state.passedStages, stageIndex);
}

export function createFivePartsLessonState(stageIndex = 1): FivePartsLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    conflictedLocalDrafts: {},
    draftRevisions: {},
    verdicts: {},
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    message: null,
  };
}

function withoutVerdict(
  verdicts: FivePartsLessonState["verdicts"],
  stageIndex: number,
): FivePartsLessonState["verdicts"] {
  if (!(stageIndex in verdicts)) return verdicts;
  const next = { ...verdicts };
  delete next[stageIndex];
  return next;
}

function touchDraft(state: FivePartsLessonState, draft: FivePartsDraft): FivePartsLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: draft },
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
  };
}

export function transitionFivePartsLesson(
  state: FivePartsLessonState,
  action: FivePartsLessonAction,
): FivePartsLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, FivePartsDraft> = {};
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        draftRevisions[Number(key)] = rev;
      }
      for (const [key, draft] of Object.entries(action.drafts)) {
        drafts[Number(key)] = sanitizeDraft(draft, Number(key));
      }
      const stageIndex = fivePartsStageUnlocked(action.passedStages, action.currentStage)
        ? action.currentStage
        : Math.min(nextFivePartsStage(action.passedStages), FIVE_PARTS_STAGES.length);
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        conflictedLocalDrafts: {},
        draftRevisions,
        saveStatusByStage: {},
        unresolvedSyncConflicts: {},
        verdicts: {},
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return { ...state, stageIndex: action.stageIndex };
    }

    case "set-input": {
      const draft = draftOf(state);
      // Changing an input restarts the demonstration — a result computed
      // from older numbers must never stay on screen.
      return touchDraft(state, {
        ...draft,
        [action.field]: clampDigit(action.value),
        step: 0,
      });
    }

    case "set-step": {
      const draft = draftOf(state);
      const step = Math.max(0, Math.min(stepCountFor(state.stageIndex), Math.trunc(action.step)));
      return touchDraft(state, { ...draft, step });
    }

    case "set-answer": {
      const draft = draftOf(state);
      // A new pick waits for its own verdict; the old one must not linger.
      return {
        ...touchDraft(state, { ...draft, answer: action.optionId }),
        verdicts: withoutVerdict(state.verdicts, state.stageIndex),
      };
    }

    case "storage-op": {
      const draft = draftOf(state);
      return touchDraft(state, { ...draft, storage: applyStorageOp(draft.storage, action.op) });
    }

    case "judge-result":
      return {
        ...state,
        verdicts: { ...state.verdicts, [action.outcome.stageIndex]: action.outcome },
        passedStages: action.outcome.passedStages,
        currentStage: nextFivePartsStage(action.outcome.passedStages),
      };

    case "mark-saving":
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
      };
    case "mark-saved": {
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
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

    case "mark-save-sync-error": {
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "sync-error"),
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          true,
        ),
      };
    }

    case "resolve-save-conflict": {
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      const localDraft = state.drafts[action.stageIndex];
      if (localDraft !== undefined) conflictedLocalDrafts[action.stageIndex] = localDraft;
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.stageIndex]: sanitizeDraft(action.draft ?? {}, action.stageIndex),
        },
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
        verdicts: withoutVerdict(state.verdicts, action.stageIndex),
      };
    }

    case "restore-conflict-draft": {
      const backup = state.conflictedLocalDrafts[action.stageIndex];
      if (backup === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: backup },
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
        verdicts: withoutVerdict(state.verdicts, action.stageIndex),
      };
    }

    case "discard-conflict-draft": {
      if (state.conflictedLocalDrafts[action.stageIndex] === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      return {
        ...state,
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        saveStatusByStage:
          status === "conflict"
            ? markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved")
            : state.saveStatusByStage,
      };
    }
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}

/** Bound a restored draft at the domain edge; junk fields drop to defaults. */
export function sanitizeDraft(raw: unknown, stageIndex = 1): FivePartsDraft {
  if (!raw || typeof raw !== "object") return emptyDraft();
  const { a, b, step, answer, storage } = raw as {
    a?: unknown;
    b?: unknown;
    step?: unknown;
    answer?: unknown;
    storage?: unknown;
  };
  const stepValue = typeof step === "number" && Number.isFinite(step) ? Math.trunc(step) : 0;
  return {
    a: clampDigit(a ?? 3),
    b: clampDigit(b ?? 5),
    step: Math.max(0, Math.min(stepCountFor(stageIndex), stepValue)),
    answer: typeof answer === "string" && answer.length > 0 && answer.length <= 32 ? answer : null,
    storage: sanitizeStorage(storage),
  };
}
