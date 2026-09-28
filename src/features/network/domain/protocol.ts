/** Wire shapes between the network lab client and the judge. */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { NetCase } from "./scenario.ts";
import type { NetDraft } from "./topology.ts";

export type NetSubmission = { stageIndex: number; draft: NetDraft };

export type NetCounterexample = {
  name: string;
  category: string;
  /** Chinese one-liner: which probe failed and what happened instead. */
  detail: string;
  /** The full case so the UI can replay it into the trace view. */
  netCase: NetCase;
};

export type NetTestSummary = {
  categories: Record<string, { passed: number; total: number }>;
  results: { name: string; category: string; passed: boolean }[];
  counterexample: NetCounterexample | null;
  error?: string;
};

export type NetJudgeResult = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: NetTestSummary;
  submissionId?: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: null;
};

export type NetProjectPayload = LabProjectPayload<NetDraft>;
