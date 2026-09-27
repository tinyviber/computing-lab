/**
 * ai-eval wire protocol (issue #61 §5 — frozen field list).
 *
 * Evidence model: the transcript records *how* each answer was drawn —
 * `{probe:{questionId,phrasing,k}, drawId, collectedAt}` — never the answer
 * text. The judge recomputes every drawId under the same per-user seed and
 * checks it against the server-side issued-draws ledger, so fabricated or
 * hand-edited evidence fails `transcript-mismatch`.
 *
 * Server-managed fields (`_srv`, `verifyLog`, `predictedAt`) are written by
 * the /draws, /verify and PUT /draft handlers and copied from the stored
 * draft during sanitize — clients can read them but never set them.
 */

import type { MatrixColumn, PhrasingDim, Probe } from "./probe.ts";

/* ------------------------------- probes ------------------------------ */

export type { Probe } from "./probe.ts";

export type TranscriptRow = {
  probe: Probe;
  drawId: string;
  /** Append sequence within the stage (1-based), system-recorded. */
  collectedAt: number;
};

export type IssuedDraw = { probe: Probe; drawId: string; seq: number };

/** Server-side counters persisted inside each stage draft. */
export type ServerDraftMarks = {
  /** Monotone per-stage event counter — orders predictedAt vs firstDrawSeq. */
  seq: number;
  /** Draws the server actually dispensed (recompute + membership evidence). */
  issued: IssuedDraw[];
  /** `seq` at the first issued draw — the C2 prediction deadline. */
  firstDrawSeq: number | null;
};

/* ------------------------------- drafts ------------------------------ */

/** C1 档位判定. */
export type StabilityRating = "stable" | "wobbly" | "volatile";
export const STABILITY_RATINGS: readonly StabilityRating[] = ["stable", "wobbly", "volatile"];
export const RATING_LABELS: Record<StabilityRating, string> = {
  stable: "稳定",
  wobbly: "摇摆",
  volatile: "多变",
};

/** C3 裁决. `fieldId` required when v === "doubt" — must come from /verify. */
export type VerdictChoice = { v: "trust" | "doubt" | "human"; fieldId?: string };

/**
 * One flat draft shape per stage (fields are per-stage unions). The frozen
 * C1/C2/C3 field lists map as:
 *   C1 {transcript, ratings}
 *   C2 {predictions, predictedAt, transcript, matrix}
 *   C3 {transcript, verdicts, verifyLog}
 * `_srv`/`predictedAt`/`verifyLog` are server-managed.
 */
export type AiEvalDraft = {
  transcript: TranscriptRow[];
  /** C1: questionId → rating. */
  ratings: Record<string, StabilityRating>;
  /** C2: dim → "答案会变吗" prediction. */
  predictions: Partial<Record<PhrasingDim, boolean>>;
  /** C2: column ("base"|dim) → drawIds (repeat control + one per dim). */
  matrix: Record<string, string[]>;
  /** C3: drawId → verdict. */
  verdicts: Record<string, VerdictChoice>;
  /** C3: fieldIds returned by /verify, in call order (server-written). */
  verifyLog: string[];
  /** C2: `_srv.seq` when predictions last changed (server-written). */
  predictedAt: number | null;
  _srv?: ServerDraftMarks;
};

export function emptyAiEvalDraft(): AiEvalDraft {
  return {
    transcript: [],
    ratings: {},
    predictions: {},
    matrix: {},
    verdicts: {},
    verifyLog: [],
    predictedAt: null,
  };
}

/* ------------------------------ judge out ---------------------------- */

export type AiEvalCounterexample = {
  kind: "transcript" | "rating" | "prediction" | "verdict" | "route";
  itemId: string;
  expected: string;
  actual: string;
  evidence?: {
    answerExcerpt?: string;
    factField?: { id: string; value: string | null };
  };
};

export type AiEvalCategory = { name: string; passed: number; total: number };

export type AiEvalTestSummary = {
  categories: AiEvalCategory[];
  counterexample: AiEvalCounterexample | null;
  degenerate: "all-same-rating" | "all-trust" | "all-doubt" | "all-human" | null;
  error:
    | "transcript-mismatch"
    | "insufficient-observations"
    | "prediction-after-draw"
    | "unverified-cite"
    | "reason-conflict"
    | "answer-leak"
    | "quota-exceeded"
    | "rate-limited"
    | null;
};

export type AiEvalJudgeResult = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: AiEvalTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: null;
};

/* ------------------------------ draw wire ---------------------------- */

/** One /draws response item — `flags`/`entryId` never leave the server. */
export type DrawPayload = {
  probe: Probe;
  drawId: string;
  questionId: string;
  questionText: string;
  text: string;
  slots: { fieldId: string; slot: string; value: string }[];
  cites: string[];
};

export type DrawsRequest = { stageIndex: number; probes: Probe[] };
export type DrawsResponse = { draws: DrawPayload[] };

export type VerifyRequest = { stageIndex: number; drawId: string; slotIndex: number };
export type VerifyResponse = {
  fieldId: string;
  truth: string | null;
  quotaLeft: number;
};

/* ------------------------------ judge-free constants ---------------- */

/** What GET /project exposes to the client under `extras.aiEval`. */
export type AiEvalQuestionBrief = { id: string; text: string; category: string };

export type AiEvalProjectExtras = {
  aiEval: {
    stages: {
      "1": { questions: AiEvalQuestionBrief[] };
      "2": { question: AiEvalQuestionBrief; columns: readonly MatrixColumn[] };
      "3": { quota: number; drawCount: number };
    };
  };
};

/* --------------------------- bounds (issue §5) ----------------------- */

export const MAX_TRANSCRIPT_ROWS = 32;
export const MAX_VERDICTS = 64;
export const MAX_ISSUED = 40;
export const C3_DRAW_COUNT = 10;
export const VERIFY_QUOTA = 8;
export const C1_OBS_FOR_STABLE = 6;
export const C1_MIN_OBS = 3;
/** distinct/obs ≥ this → 多变; distinct === 1 → 稳定; else → 摇摆. */
export const VOLATILE_RATIO = 0.6;
/** C2 pass bars: prediction accuracy and matrix structure. */
export const C2_MIN_ACCURACY = 0.8;
export const C2_MIN_DIMS = 2;
export const C2_MIN_CELLS = 2;
/** C3 pass bars: recall / false-flag / human-defer ceiling. */
export const C3_MIN_RECALL = 0.75;
export const C3_MAX_FALSE_FLAG = 0.34;
export const C3_MAX_DEFER = 0.3;
