/**
 * Wire protocol between the color-quantization UI and the server judge.
 * The submission is data only — a toner subset (pick stages) or a mapping
 * table (free stages) plus an optional source-code snapshot kept for
 * review. Student code is never executed server-side.
 */

import type { QuantMode } from "./stages.ts";

/** A palette-indexed image in transport form: width, height, 1 byte/cell b64. */
export type PackedImage = { width: number; height: number; b64: string };

export type QuantSubmission = {
  stageIndex: number;
  /** pick mode: absolute toner indices to load (subset of 0..7). */
  toners?: number[];
  /** free mode: one entry per source color — toner index or -1 (paper). */
  table?: number[];
  /** Optional snapshot of the student's source; never executed. */
  code?: string;
};

export type QuantCounterexample = {
  query: { id: string; label: string; source: PackedImage; printed: PackedImage };
  collided: { id: string; label: string; source: PackedImage; printed: PackedImage } | null;
  collidedWith: { id: string; label: string }[];
};

export type QuantJudgeResult = {
  mode: QuantMode;
  /** The effective mapping table the printer applied (always 14 entries). */
  table: number[];
  /** Distinct toners actually used by the effective table. */
  tonersUsed: number[];
  slotsUsed: number;
  /** pick mode only: hard cap on loaded cartridges. */
  slotsBudget: number | null;
  /** free mode only: entries differing from the default nearest table. */
  overrides: number | null;
  overrideBudget: number | null;
  identified: number;
  total: number;
  accuracy: number;
  requiredAccuracy: number;
  withinBudget: boolean;
  passed: boolean;
  counterexample: QuantCounterexample | null;
  confusionPairs: { aId: string; aLabel: string; bId: string; bLabel: string }[];
  submissionId: string;
  currentStage: number;
  passedStages: number[];
};
