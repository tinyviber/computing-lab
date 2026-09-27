/**
 * ai-eval lesson state: the reducer behind the lab page. The draft holds
 * evidence only — transcript rows (`{probe, drawId}`), ratings, predictions,
 * matrix cells, verdicts. Answer payloads live in `drawsById` (display
 * cache); server-managed fields (`_srv`, `verifyLog`, `predictedAt`) arrive
 * inside stored drafts and are never edited by actions.
 */

import type { SaveStatus } from "../../../shared/api/client";
import type { MatrixColumn, PhrasingDim, Probe } from "../domain/probe.ts";
import {
  emptyAiEvalDraft,
  type AiEvalDraft,
  type AiEvalJudgeResult,
  type AiEvalProjectExtras,
  type DrawPayload,
  type StabilityRating,
  type TranscriptRow,
  type VerdictChoice,
} from "../domain/protocol.ts";
import { sanitizeAiEvalDraft } from "../domain/sanitize.ts";
import {
  aiEvalStageUnlocked,
  getAiEvalStage,
  nextAiEvalStage,
  type AiEvalStageDef,
} from "../domain/stages.ts";

export type { SaveStatus };

export type AiEvalLessonState = {
  stageIndex: number;
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, AiEvalDraft>;
  /** Question briefs + quota info exposed by GET /project extras. */
  extras: AiEvalProjectExtras["aiEval"] | null;
  /** drawId → payload cache for rendering (never persisted in drafts). */
  drawsById: Record<string, DrawPayload>;
  judgeOutcome: AiEvalJudgeResult | null;
  saveStatus: SaveStatus;
  message: string | null;
};

export type AiEvalLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, AiEvalDraft>;
      extras: AiEvalProjectExtras["aiEval"] | null;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "draws-received"; draws: DrawPayload[] }
  | {
      type: "issued-appended";
      stageIndex: number;
      entries: { probe: Probe; drawId: string; seq: number }[];
    }
  | { type: "collect"; drawId: string }
  | { type: "uncollect"; drawId: string }
  | { type: "set-rating"; questionId: string; rating: StabilityRating | null }
  | { type: "set-prediction"; dim: PhrasingDim; value: boolean }
  | { type: "set-matrix-column"; column: MatrixColumn; drawIds: string[] }
  | { type: "set-verdict"; drawId: string; choice: VerdictChoice | null }
  | { type: "judge-result"; outcome: AiEvalJudgeResult }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function stageOf(state: AiEvalLessonState): AiEvalStageDef | undefined {
  return getAiEvalStage(state.stageIndex);
}

export function isStageUnlocked(state: AiEvalLessonState, stageIndex: number): boolean {
  return aiEvalStageUnlocked(state.passedStages, stageIndex);
}

export function draftOf(state: AiEvalLessonState, stageIndex = state.stageIndex): AiEvalDraft {
  return state.drafts[stageIndex] ?? emptyAiEvalDraft();
}

export function createAiEvalLessonState(stageIndex = 1): AiEvalLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    extras: null,
    drawsById: {},
    judgeOutcome: null,
    saveStatus: "idle",
    message: null,
  };
}

export function sanitizeDraft(raw: unknown): AiEvalDraft {
  return sanitizeAiEvalDraft(0, raw, undefined);
}

function withDraft(state: AiEvalLessonState, draft: AiEvalDraft): AiEvalLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: draft },
    saveStatus: "dirty",
    judgeOutcome: null,
  };
}

export function transitionAiEvalLesson(
  state: AiEvalLessonState,
  action: AiEvalLessonAction,
): AiEvalLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, AiEvalDraft> = {};
      for (const [key, raw] of Object.entries(action.drafts)) {
        // Stored drafts carry server marks; keep them as-is (sanitize would
        // need the stage context — they were sanitized on write).
        drafts[Number(key)] = { ...emptyAiEvalDraft(), ...raw };
      }
      const stageIndex = aiEvalStageUnlocked(action.passedStages, action.currentStage)
        ? action.currentStage
        : 1;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        extras: action.extras,
        saveStatus: "idle",
        judgeOutcome: null,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return { ...state, stageIndex: action.stageIndex, judgeOutcome: null };
    }

    case "draws-received": {
      const drawsById = { ...state.drawsById };
      for (const d of action.draws) drawsById[d.drawId] = d;
      return { ...state, drawsById };
    }

    case "issued-appended": {
      // Local mirror of the server-side issued ledger; the real one is
      // rewritten by /draws server-side and re-synced on next load — the
      // sanitize step strips client `_srv` so this never leaks upstream.
      const draft = state.drafts[action.stageIndex] ?? emptyAiEvalDraft();
      const srv = draft._srv ?? { seq: 0, issued: [], firstDrawSeq: null };
      const known = new Set(srv.issued.map((i) => i.drawId));
      const fresh = action.entries.filter((e) => !known.has(e.drawId));
      if (fresh.length === 0) return state;
      const issued = [...srv.issued, ...fresh];
      const seq = Math.max(srv.seq, ...fresh.map((e) => e.seq));
      const firstDrawSeq = srv.firstDrawSeq ?? Math.min(...fresh.map((e) => e.seq));
      return {
        ...state,
        drafts: {
          ...state.drafts,
          [action.stageIndex]: { ...draft, _srv: { seq, issued, firstDrawSeq } },
        },
      };
    }

    case "collect": {
      const draft = draftOf(state);
      const payload = state.drawsById[action.drawId];
      if (!payload) return state;
      if (draft.transcript.some((r) => r.drawId === action.drawId)) return state;
      const row: TranscriptRow = {
        probe: payload.probe,
        drawId: payload.drawId,
        collectedAt: draft.transcript.length + 1,
      };
      return withDraft(state, { ...draft, transcript: [...draft.transcript, row] });
    }

    case "uncollect": {
      const draft = draftOf(state);
      const transcript = draft.transcript.filter((r) => r.drawId !== action.drawId);
      return withDraft(state, { ...draft, transcript });
    }

    case "set-rating": {
      const draft = draftOf(state);
      const ratings = { ...draft.ratings };
      if (action.rating === null) delete ratings[action.questionId];
      else ratings[action.questionId] = action.rating;
      return withDraft(state, { ...draft, ratings });
    }

    case "set-prediction": {
      const draft = draftOf(state);
      const predictions = { ...draft.predictions, [action.dim]: action.value };
      return withDraft(state, { ...draft, predictions });
    }

    case "set-matrix-column": {
      const draft = draftOf(state);
      const matrix = { ...draft.matrix };
      if (action.drawIds.length === 0) delete matrix[action.column];
      else matrix[action.column] = action.drawIds;
      return withDraft(state, { ...draft, matrix });
    }

    case "set-verdict": {
      const draft = draftOf(state);
      const verdicts = { ...draft.verdicts };
      if (action.choice === null) delete verdicts[action.drawId];
      else verdicts[action.drawId] = action.choice;
      return withDraft(state, { ...draft, verdicts });
    }

    case "judge-result":
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextAiEvalStage(action.outcome.passedStages),
      };

    case "mark-saving":
      return { ...state, saveStatus: "saving" };
    case "mark-saved":
      return { ...state, saveStatus: state.saveStatus === "saving" ? "saved" : state.saveStatus };
    case "mark-save-error":
      return { ...state, saveStatus: state.saveStatus === "saving" ? "error" : state.saveStatus };
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}
