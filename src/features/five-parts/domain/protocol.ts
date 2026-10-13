/**
 * Wire protocol between the five-parts lab UI and the server judge.
 * Submissions are data only — the observed inputs or a picked option id —
 * never anything executable. The server owns every correct option id and
 * the verdict copy; the client only ever sends which option was picked.
 */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { StorageState } from "./storage.ts";

/** Per-stage student work; persisted in the generic draft_graph column. */
export type FivePartsDraft = {
  /** Observed inputs (observe page, shared with the think page); 0–9. */
  a: number;
  b: number;
  /** Walkthrough position on step-through pages (observe 0–4, phone 0–5). */
  step: number;
  /** Option id picked on a question page, if any. */
  answer: string | null;
  /** Memory-vs-storage demo state on the storage page. */
  storage: StorageState;
};

export type FivePartsJudgeResult = {
  passed: boolean;
  /** The page this verdict belongs to — a late reply never lands elsewhere. */
  stageIndex: number;
  /** Server-written feedback for the picked option; null for the observe record. */
  feedback: string | null;
  parts: { id: string; label: string; ok: boolean; detail: string | null }[];
  submissionId: string;
  currentStage: number;
  passedStages: number[];
};

export type FivePartsProjectPayload = LabProjectPayload<FivePartsDraft>;
