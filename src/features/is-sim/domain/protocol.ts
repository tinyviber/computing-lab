/**
 * Wire protocol between the is-sim lab UI and the server judge — shared
 * by `server/judge/is-sim/judge.ts` (producer) and the lab page
 * (consumer) so the payload shapes live exactly once.
 */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { IsTopology } from "./model.ts";
import type {
  DbDiff,
  FiredDiff,
  IsCase,
  PendingQueue,
  SeenDiff,
  UnapprovedHit,
} from "./scenario.ts";
import type { DroppedEvent, SimReason, TraceRow } from "./sim.ts";

/** Per-stage student work; persisted in the generic draft_graph column. */
export type IsDraft = IsTopology;

/** POST /judge body: the topology to grade. */
export type IsSubmission = {
  stageIndex: number;
  draft: IsDraft;
};

export type IsCounterexample = {
  name: string;
  category: string;
  /** Why the run ended early ("budget"); null = scenario ran to completion. */
  reason: SimReason | null;
  eventsUsed: number;
  /** The case's event budget — over-budget is a fail even when state is right. */
  eventBudget: number;
  /** The failing scenario verbatim, so the page can replay it on the latest draft. */
  scenario: IsCase;
  dbDiff: DbDiff[];
  seenDiff: SeenDiff[];
  firedDiff: FiredDiff[];
  unapproved: UnapprovedHit[];
  pending: PendingQueue[];
  dropped: DroppedEvent[];
  /** The failing run's trace — bounded by the stage's maxEvents. */
  trace: TraceRow[];
};

export type IsTestSummary = {
  categories: Record<string, { passed: number; total: number }>;
  results: { name: string; category: string; passed: boolean }[];
  /** First failing case, in run order; null on a full pass. */
  counterexample: IsCounterexample | null;
  error: string | null;
};

export type IsJudgeResult = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: IsTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: null;
};

export type IsProjectPayload = LabProjectPayload<IsDraft>;
