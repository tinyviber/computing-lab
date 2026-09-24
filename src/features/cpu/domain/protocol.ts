/**
 * Wire protocol between the cpu lab UI and the server judge — shared by
 * `server/judge/cpu/judge.ts` (producer) and the lab page (consumer) so the
 * payload shapes live exactly once.
 */

import type { LabProjectPayload } from "../../../shared/api/client.ts";
import type { InstrRow } from "./isa.ts";
import type { RunReason, TraceRow } from "./machine.ts";

/** Per-stage student work; persisted in the generic draft_graph column. */
export type CpuDraft = { rows: InstrRow[] };

/** POST /judge body: the program to grade. */
export type CpuSubmission = {
  stageIndex: number;
  draft: CpuDraft;
};

export type CpuCounterexample = {
  name: string;
  category: string;
  /** Why the run ended before the contract could be checked (null = wrong answer on a halted run). */
  reason: RunReason | null;
  cyclesUsed: number;
  /** The case's cycle budget — over-budget is a fail even when final state is right. */
  cycleBudget: number;
  initMem: Record<number, number>;
  initRegs?: { A?: number; B?: number };
  memDiff: { addr: number; expected: number; actual: number }[];
  regDiff: { reg: string; expected: number; actual: number }[];
  branchMismatch?: boolean;
  selfModMissing?: boolean;
  /**
   * The failing run's per-cycle trace — already bounded by the stage's
   * maxCycles (≤256) — so the student can see where it went wrong.
   */
  trace: TraceRow[];
  /** Register pair after the last committed cycle (the run's terminal A/B). */
  finalRegs: { A: number; B: number };
  /** The run fetched an instruction byte it had itself STOREd (self-modifying). */
  selfModFetch: boolean;
};

export type CpuTestSummary = {
  categories: Record<string, { passed: number; total: number }>;
  results: { name: string; category: string; passed: boolean }[];
  /** First failing case, in run order; null on a full pass. */
  counterexample: CpuCounterexample | null;
  /** C3+: the hidden set never saw one branch direction. */
  branchOneWayOnly: boolean;
  error: string | null;
};

export type CpuJudgeResult = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: CpuTestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: null;
};

/**
 * GET /project payload: the generic lab envelope plus the soft gate flag —
 * `false` shows the "建议先完成计算器实验" banner without blocking entry.
 */
export type CpuProjectPayload = LabProjectPayload<CpuDraft> & {
  calculatorCoreComplete: boolean;
};
