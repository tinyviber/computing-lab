/**
 * Wire protocol between the network lab UI and the server judge —
 * shared by `server/judge/network/judge.ts` (producer) and the lab page
 * (consumer) so the payload shapes live exactly once.
 */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { NetTopology } from "./model.ts";
import type { DropDiff, FloodDiff, HopDiff, MacDiff, NetCase, PathDiff } from "./scenario.ts";
import type { DropRow, SimOutcome, TraceRow } from "./simulate.ts";

/** Per-stage student work; persisted in the generic draft_graph column. */
export type NetDraft = NetTopology;

/** POST /judge body: the topology to grade. */
export type NetSubmission = {
  stageIndex: number;
  draft: NetDraft;
};

export type NetCounterexample = {
  name: string;
  category: string;
  /** Why the run ended early ("budget"); null = ran to completion. */
  reason: "done" | "budget" | null;
  eventsUsed: number;
  eventBudget: number;
  outcome: SimOutcome;
  /** The failing scenario verbatim, so the page can replay it on the latest draft. */
  scenario: NetCase;
  pathDiff: PathDiff | null;
  dropDiff: DropDiff | null;
  macDiff: MacDiff[];
  floodDiff: FloodDiff | null;
  hopDiff: HopDiff[];
  /** The failing run's hop trace + drop rows. */
  trace: TraceRow[];
  drops: DropRow[];
};

export type NetTestSummary = {
  categories: Record<string, { passed: number; total: number }>;
  results: { name: string; category: string; passed: boolean }[];
  /** First failing case, in run order; null on a full pass. */
  counterexample: NetCounterexample | null;
  /** Structural misconfiguration (中文) — fail-fast before any case ran. */
  error: string | null;
};

export type NetJudgeResult = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: NetTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: null;
};

export type NetProjectPayload = LabProjectPayload<NetDraft>;
