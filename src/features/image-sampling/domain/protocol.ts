/**
 * Wire protocol between the image-sampling UI and the server judge.
 * The submission is data only — a resolution plus an optional source-code
 * snapshot kept for review. Student code is never executed server-side.
 */

import type { Resolution } from "./downsample.ts";
import type { CandidateDistance } from "./recognize.ts";

/** A bitmap in transport form: width, height, then 1 bit per cell, MSB-first. */
export type PackedImage = { width: number; height: number; b64: string };

export type SamplingSubmission = {
  stageIndex: number;
  width: number;
  height: number;
  /** Optional snapshot of the student's choose_size source; never executed. */
  code?: string;
};

export type SamplingCounterexample = {
  query: { id: string; label: string; full: PackedImage; small: PackedImage };
  predicted: { id: string; label: string; full: PackedImage; small: PackedImage } | null;
  collidedWith: { id: string; label: string }[];
  ranking: CandidateDistance[];
};

export type SamplingJudgeResult = {
  resolution: Resolution & { cells: number };
  /** Judges the combined public+hidden gallery. */
  identified: number;
  total: number;
  accuracy: number;
  requiredAccuracy: number;
  cellBudget: number;
  withinBudget: boolean;
  passed: boolean;
  counterexample: SamplingCounterexample | null;
  confusionPairs: { aId: string; aLabel: string; bId: string; bLabel: string }[];
  submissionId: string;
  currentStage: number;
  passedStages: number[];
};
