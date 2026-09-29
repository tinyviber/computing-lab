/**
 * Decoding lesson state: which stage, the draft per stage (code, signature,
 * concept answers, per-file verdicts), and the last judge verdict. Pure
 * transitions — no React, no network.
 */

import type { PixelMatrix } from "../domain/bmp.ts";
import type {
  DecodingDraft,
  DecodingJudgeResult,
  DecoderChoice,
  LabPayload,
} from "../domain/protocol.ts";
import {
  decodingStageUnlocked,
  getDecodingStage,
  nextDecodingStage,
  type DecodingStageDef,
} from "../domain/stages.ts";

export type { SaveStatus } from "../../../shared/api/client";
import type { SaveStatus } from "../../../shared/api/client";

export type DecodingLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, DecodingDraft>;
  /** Per-user stage payloads issued by the server at project load. */
  payloads: Record<number, LabPayload>;
  judgeOutcome: DecodingJudgeResult | null;
  saveStatus: SaveStatus;
  message: string | null;
};

export type DecodingLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, DecodingDraft>;
      payloads: Record<number, LabPayload>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-code"; code: string }
  | { type: "set-signature"; signature: string }
  | { type: "answer-prompt"; promptId: string; option: number }
  | {
      type: "set-verdict";
      fileIndex: number;
      verdict: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } | null;
    }
  | { type: "judge-result"; outcome: DecodingJudgeResult }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function emptyDraft(): DecodingDraft {
  return { code: "", signature: "", conceptAnswers: {}, verdicts: [] };
}

export function draftOf(state: DecodingLessonState, stageIndex = state.stageIndex): DecodingDraft {
  return state.drafts[stageIndex] ?? emptyDraft();
}

export function stageOf(state: DecodingLessonState): DecodingStageDef | undefined {
  return getDecodingStage(state.stageIndex);
}

export function isStageUnlocked(state: DecodingLessonState, stageIndex: number): boolean {
  return decodingStageUnlocked(state.passedStages, stageIndex);
}

/** Prompt ids already answered correctly in the current stage's draft. */
export function answeredPromptIds(state: DecodingLessonState): Set<string> {
  return new Set(Object.keys(draftOf(state).conceptAnswers));
}

/** Every concept prompt of the stage answered — required before submit. */
export function allPromptsAnswered(state: DecodingLessonState): boolean {
  const stage = stageOf(state);
  if (!stage?.prompts?.length) return true;
  const answered = answeredPromptIds(state);
  return stage.prompts.every((p) => answered.has(p.id));
}

export function createDecodingLessonState(stageIndex = 1): DecodingLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    payloads: {},
    judgeOutcome: null,
    saveStatus: "idle",
    message: null,
  };
}

function touchDraft(state: DecodingLessonState, draft: DecodingDraft): DecodingLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: draft },
    saveStatus: "dirty",
  };
}

export function transitionDecodingLesson(
  state: DecodingLessonState,
  action: DecodingLessonAction,
): DecodingLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, DecodingDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        drafts[Number(key)] = sanitizeDraft(draft);
      }
      const stageIndex = decodingStageUnlocked(action.passedStages, state.stageIndex)
        ? state.stageIndex
        : action.currentStage;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        payloads: action.payloads,
        saveStatus: "idle",
        judgeOutcome: null,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return { ...state, stageIndex: action.stageIndex, judgeOutcome: null };
    }

    case "set-code":
      return touchDraft(state, { ...draftOf(state), code: action.code });

    case "set-signature":
      return touchDraft(state, { ...draftOf(state), signature: action.signature });

    case "answer-prompt": {
      const draft = draftOf(state);
      const stage = stageOf(state);
      // Only correct picks are recorded — a wrong option just shows its note.
      const prompt = stage?.prompts?.find((p) => p.id === action.promptId);
      if (!prompt || !(prompt.options[action.option]?.correct === true)) return state;
      return touchDraft(state, {
        ...draft,
        conceptAnswers: { ...draft.conceptAnswers, [action.promptId]: action.option },
      });
    }

    case "set-verdict": {
      const draft = draftOf(state);
      const verdicts = [...draft.verdicts];
      verdicts[action.fileIndex] = action.verdict;
      return touchDraft(state, { ...draft, verdicts });
    }

    case "judge-result":
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextDecodingStage(action.outcome.passedStages),
      };

    case "mark-saving":
      return { ...state, saveStatus: "saving" };
    case "mark-saved":
      // Only a save started from the current dirty state may settle it.
      return { ...state, saveStatus: state.saveStatus === "saving" ? "saved" : state.saveStatus };
    case "mark-save-error":
      return { ...state, saveStatus: state.saveStatus === "saving" ? "error" : state.saveStatus };
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}

/** Bound a restored draft at the domain edge; junk fields drop to defaults. */
export function sanitizeDraft(raw: unknown): DecodingDraft {
  if (!raw || typeof raw !== "object") return emptyDraft();
  const { code, signature, conceptAnswers, verdicts } = raw as {
    code?: unknown;
    signature?: unknown;
    conceptAnswers?: unknown;
    verdicts?: unknown;
  };
  const answers: Record<string, number> = {};
  if (conceptAnswers && typeof conceptAnswers === "object") {
    for (const [key, value] of Object.entries(conceptAnswers as Record<string, unknown>)) {
      if (typeof key === "string" && Number.isInteger(value) && (value as number) >= 0) {
        answers[key.slice(0, 64)] = value as number;
      }
    }
  }
  const verdictList: DecodingDraft["verdicts"] = [];
  if (Array.isArray(verdicts)) {
    for (const entry of verdicts.slice(0, 8)) {
      if (!entry || typeof entry !== "object") {
        verdictList.push(null);
        continue;
      }
      const { decoder, text, pixels } = entry as {
        decoder?: unknown;
        text?: unknown;
        pixels?: unknown;
      };
      if (decoder !== "text" && decoder !== "image") {
        verdictList.push(null);
        continue;
      }
      const verdict: { decoder: DecoderChoice; text?: string; pixels?: PixelMatrix } = { decoder };
      if (typeof text === "string") verdict.text = text.slice(0, 200);
      if (Array.isArray(pixels)) verdict.pixels = pixels as PixelMatrix;
      verdictList.push(verdict);
    }
  }
  return {
    code: typeof code === "string" ? code.slice(0, 12000) : "",
    signature: typeof signature === "string" ? signature.slice(0, 8) : "",
    conceptAnswers: answers,
    verdicts: verdictList,
  };
}
