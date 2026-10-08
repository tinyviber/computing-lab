/**
 * Audio-encoding lesson state: which stage, the per-stage draft (chosen
 * digitization params + guided answers), and the last judge verdict.
 * Pure transitions — no React, no network, no audio buffers. The audio
 * content itself lives in the workbench's local state and is never
 * persisted or submitted.
 */

import type { AudioParams } from "../domain/audio.ts";
import {
  DEFAULT_PARAMS,
  MAX_BIT_DEPTH,
  MAX_SAMPLE_RATE,
  MIN_BIT_DEPTH,
  MIN_SAMPLE_RATE,
} from "../domain/audio.ts";
import type { AudioEncodingJudgeResult } from "../domain/protocol.ts";
import { audioStageUnlocked, getAudioStage, type AudioStageDef } from "../domain/stages.ts";

export type { SaveStatus } from "../../../shared/api/client";
import type { SaveStatus } from "../../../shared/api/client";

/** Per-stage student work; persisted in the generic draft_graph column. */
export type StageDraft = {
  /** Chosen target rate (Hz); null = not touched yet (UI shows defaults). */
  sampleRate: number | null;
  /** Chosen bit depth; null = not touched yet. */
  bitDepth: number | null;
  /** Chosen channel strategy; null = not touched yet. */
  channels: 1 | 2 | null;
  /** guided stage: promptId → chosen option index. */
  guidedAnswers: Record<string, number>;
};

export type AudioLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, StageDraft>;
  judgeOutcome: AudioEncodingJudgeResult | null;
  saveStatus: SaveStatus;
  message: string | null;
};

export type AudioLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, StageDraft>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-params"; params: Partial<AudioParams> }
  | { type: "set-guided-answer"; promptId: string; choice: number }
  | { type: "judge-result"; outcome: AudioEncodingJudgeResult }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function emptyDraft(): StageDraft {
  return { sampleRate: null, bitDepth: null, channels: null, guidedAnswers: {} };
}

export function draftOf(state: AudioLessonState, stageIndex = state.stageIndex): StageDraft {
  return state.drafts[stageIndex] ?? emptyDraft();
}

export function stageOf(state: AudioLessonState): AudioStageDef | undefined {
  return getAudioStage(state.stageIndex);
}

export function isStageUnlocked(state: AudioLessonState, stageIndex: number): boolean {
  return audioStageUnlocked(state.passedStages, stageIndex);
}

/** The params a stage draft resolves to — explicit picks over defaults. */
export function draftParams(state: AudioLessonState, stageIndex = state.stageIndex): AudioParams {
  const draft = draftOf(state, stageIndex);
  return {
    sampleRate: draft.sampleRate ?? DEFAULT_PARAMS.sampleRate,
    bitDepth: draft.bitDepth ?? DEFAULT_PARAMS.bitDepth,
    channels: draft.channels ?? DEFAULT_PARAMS.channels,
  };
}

const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Clamp an untrusted stored draft into the safe shape. */
export function sanitizeDraft(raw: unknown): StageDraft {
  const input = (raw ?? {}) as Record<string, unknown>;
  const rate =
    isInt(input.sampleRate) &&
    input.sampleRate >= MIN_SAMPLE_RATE &&
    input.sampleRate <= MAX_SAMPLE_RATE
      ? input.sampleRate
      : null;
  const bits =
    isInt(input.bitDepth) && input.bitDepth >= MIN_BIT_DEPTH && input.bitDepth <= MAX_BIT_DEPTH
      ? input.bitDepth
      : null;
  const channels = input.channels === 2 ? 2 : input.channels === 1 ? 1 : null;
  const guidedAnswers: Record<string, number> = {};
  const answers = input.guidedAnswers as Record<string, unknown> | undefined;
  if (answers && typeof answers === "object") {
    for (const [key, value] of Object.entries(answers)) {
      if (isInt(value) && value >= 0) guidedAnswers[key] = value;
    }
  }
  return { sampleRate: rate, bitDepth: bits, channels, guidedAnswers };
}

export function createAudioLessonState(stageIndex = 1): AudioLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    judgeOutcome: null,
    saveStatus: "idle",
    message: null,
  };
}

const markDirty = (state: AudioLessonState): AudioLessonState =>
  state.saveStatus === "dirty" ? state : { ...state, saveStatus: "dirty" };

export function transitionAudioLesson(
  state: AudioLessonState,
  action: AudioLessonAction,
): AudioLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, StageDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        drafts[Number(key)] = sanitizeDraft(draft);
      }
      const stageIndex = audioStageUnlocked(action.passedStages, state.stageIndex)
        ? state.stageIndex
        : action.currentStage;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        saveStatus: "idle",
        judgeOutcome: null,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return { ...state, stageIndex: action.stageIndex, judgeOutcome: null };
    }

    case "set-params": {
      const current = draftOf(state);
      const draft = sanitizeDraft({
        ...current,
        // `set-params` writes only the keys actually passed; unset keys keep
        // the draft's stored value (or null = untouched).
        sampleRate: action.params.sampleRate ?? current.sampleRate,
        bitDepth: action.params.bitDepth ?? current.bitDepth,
        channels: action.params.channels ?? current.channels,
        guidedAnswers: current.guidedAnswers,
      });
      return markDirty({
        ...state,
        judgeOutcome: null,
        drafts: { ...state.drafts, [state.stageIndex]: draft },
      });
    }

    case "set-guided-answer": {
      const current = draftOf(state);
      const draft: StageDraft = {
        ...current,
        guidedAnswers: { ...current.guidedAnswers, [action.promptId]: action.choice },
      };
      return markDirty({
        ...state,
        judgeOutcome: null,
        drafts: { ...state.drafts, [state.stageIndex]: draft },
      });
    }

    case "judge-result":
      return {
        ...state,
        judgeOutcome: action.outcome,
        currentStage: action.outcome.currentStage,
        passedStages: action.outcome.passedStages,
        saveStatus: "idle",
      };

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
    default:
      return state;
  }
}
