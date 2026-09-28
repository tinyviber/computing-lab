/**
 * Wire protocol between the greenhouse lab UI and the server judge —
 * shared by `server/judge/greenhouse/judge.ts` (producer) and the lab
 * page (consumer) so the payload shapes live exactly once.
 *
 * The case schema (`GhCase`/`GhExpect`) also lives here: public cases
 * (client `lesson/publicCases.ts`) and hidden cases (server
 * `judge/greenhouse/hiddenSet.ts`) share it, and a judge counterexample
 * carries its failing scenario verbatim for replay.
 */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { ActuatorId, SensorId } from "./model.ts";
import type { RuleRow } from "./rules.ts";
import type { SimInput, TraceRow } from "./simulate.ts";

/** Per-stage student work; persisted in the generic draft_graph column. */
export type GhDraft = {
  /** C1: the thermostat setpoint in whole °C (16–28). Unused later. */
  setpoint?: number;
  /** C2+: the rule table (row order = priority, top first). */
  rules?: RuleRow[];
};

/** POST /judge body: the draft to grade. */
export type GhSubmission = {
  stageIndex: number;
  draft: GhDraft;
};

/** Expectations a case asserts over the full trace (issue §5). */
export type GhExpect = {
  /** Target band per env var (fixed-point, closed interval). */
  inBand?: Partial<Record<SensorId, [number, number]>>;
  /** Fraction of scored ticks that must be inside `inBand` (0–1). */
  inBandRatio?: number;
  /** Ticks before this index are transient and don't count (inclusive start). */
  scoreFrom?: number;
  /** Max counted switches per actuator; the first flip off the initial state is free. */
  switchCount?: Partial<Record<ActuatorId, number>>;
  /** Hard bound per env var (closed interval); clamped ticks count as violations. */
  neverExceeded?: Partial<Record<SensorId, [number, number]>>;
  /** Env must end inside every inBand band on the last tick. */
  endInBand?: boolean;
  /** A rule row driving this actuator ON must appear in firedRows. */
  mustUse?: ActuatorId[];
};

export type GhCase = SimInput & {
  name: string;
  category: string;
  expect: GhExpect;
};

export type GhMetricId =
  | "no-rule-fired"
  | "leaf-one-sided"
  | "neverExceeded"
  | "inBand"
  | "endInBand"
  | "switchCount"
  | "mustUse";

/** The first thing that broke the case, localized for the UI. */
export type GhFirstViolation = {
  /** Tick of the violation (0 for structural/degenerate failures). */
  tick: number;
  metric: GhMetricId;
  /** Measured value: an env reading, a counted-switch total, or a ratio ‰. */
  value: number;
  /** The asserted interval it violated, when applicable. */
  band: [number, number] | null;
  /** Which env var / actuator the metric refers to. */
  subject?: SensorId | ActuatorId;
};

/** Trace rows around `firstViolation`: ±TRACE_WINDOW ticks. */
export const TRACE_WINDOW = 8;

/** Metrics every verdict reports — the summary block for the UI. */
export type GhCaseMetrics = {
  inBandTicks: number;
  scoredTicks: number;
  /** inBandTicks / scoredTicks, in permille for exact integer reporting. */
  inBandPermille: number;
  /** Counted switches per actuator (first flip off the initial state is free). */
  switchCount: Record<ActuatorId, number>;
};

export type GhCounterexample = {
  name: string;
  category: string;
  /** The verdict's Chinese one-liner. */
  reason: string | null;
  firstViolation: GhFirstViolation;
  metrics: GhCaseMetrics;
  window: TraceRow[];
  /** The failing scenario verbatim, so the page can replay it on the latest draft. */
  scenario: GhCase;
};

export type GhTestSummary = {
  categories: Record<string, { passed: number; total: number }>;
  results: { name: string; category: string; passed: boolean }[];
  /** First failing case, in run order; null on a full pass. */
  counterexample: GhCounterexample | null;
  error: string | null;
};

export type GhJudgeResult = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: GhTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: null;
};

export type GhProjectPayload = LabProjectPayload<GhDraft>;
