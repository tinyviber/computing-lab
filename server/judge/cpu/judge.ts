/**
 * Cpu judge: interprets the submitted instruction rows against the hidden,
 * per-user-seeded case set. The student submits bounded data — never code —
 * and the same pure `runProgram` the browser used grades it here. A pass
 * needs every case green AND, for the branch stage, both directions of the
 * last JZ exercised across the set.
 */

import type { DatabaseSync } from "node:sqlite";
import { judgeCase, type CaseVerdict } from "../../../src/features/cpu/domain/machine.ts";
import type {
  CpuDraft,
  CpuJudgeResult,
  CpuTestSummary,
} from "../../../src/features/cpu/domain/protocol.ts";
import { seedFor } from "../../../src/features/cpu/domain/rng.ts";
import {
  cpuStageUnlocked,
  getCpuStage,
  guidedProgram,
  nextCpuStage,
  type CpuStageDef,
} from "../../../src/features/cpu/domain/stages.ts";
import { sanitizeDraft } from "../../../src/features/cpu/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { hiddenCasesFor } from "./hiddenSet.ts";

/** Did the run's last JZ resolve taken (true) / not-taken (false)? */
function lastBranch(verdict: CaseVerdict): boolean | null {
  const row = [...verdict.run.trace].reverse().find((t) => t.decoded.op === "JZ");
  return row?.branchTaken ?? null;
}

/**
 * Guided stages gate on the prediction walk, not just the program: every
 * prompt must come back with a correct option index — the server re-checks
 * each answer rather than trusting a bare "done" flag from the client.
 */
function guidedAnswersComplete(
  stage: CpuStageDef,
  answers: Record<string, number> | undefined,
): boolean {
  if (!stage.guided) return true;
  if (!answers) return false;
  return stage.guided.prompts.every(
    (prompt) => prompt.options[answers[prompt.id] ?? -1]?.correct === true,
  );
}

export function judgeCpuSubmission(
  db: DatabaseSync,
  project: ProjectRow<CpuDraft>,
  stageIndex: number,
  rawDraft: unknown,
  options?: { guidedAnswers?: Record<string, number> },
): CpuJudgeResult | LabJudgeError {
  const gated = gateStage(getCpuStage(stageIndex), (stage) =>
    cpuStageUnlocked(project.passedStages, stage.index),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  if (!guidedAnswersComplete(stage, options?.guidedAnswers)) {
    return { error: "guided-incomplete", status: 400 };
  }

  const draft = sanitizeDraft(rawDraft);
  // Guided programs are prefill + editable slots — locked rows in the
  // submission are ignored, exactly like the client-side normalization.
  const program = stage.guided ? { rows: guidedProgram(stage, draft.rows) } : draft;

  const seed = seedFor(project.userId, project.labId, stage.index);
  const cases = hiddenCasesFor(stage.index, seed);
  const verdicts = cases.map((testCase) =>
    judgeCase(program.rows, testCase, {
      scratchCells: stage.scratchCells,
      maxCycles: stage.maxCycles,
      requireSelfModFetch: stage.requireSelfModFetch,
    }),
  );

  const score = verdicts.filter((v) => v.passed).length;
  const total = verdicts.length;
  const branchesTaken = verdicts.filter((v) => lastBranch(v) === true).length;
  const branchesSkipped = verdicts.filter((v) => lastBranch(v) === false).length;
  const branchOneWayOnly =
    stage.branchTwoWays === true && (branchesTaken === 0 || branchesSkipped === 0);
  const passed = total > 0 && score === total && !branchOneWayOnly;

  const categories: CpuTestSummary["categories"] = {};
  for (const verdict of verdicts) {
    const tally = categories[verdict.category] ?? { passed: 0, total: 0 };
    tally.total += 1;
    if (verdict.passed) tally.passed += 1;
    categories[verdict.category] = tally;
  }

  const failing = verdicts.find((v) => !v.passed);
  const testCase = failing ? cases.find((c) => c.name === failing.name) : undefined;
  const counterexample: CpuTestSummary["counterexample"] =
    failing && testCase
      ? {
          name: failing.name,
          category: failing.category,
          reason: failing.reason,
          cyclesUsed: failing.cyclesUsed,
          cycleBudget: testCase.expect.cycles,
          initMem: testCase.initMem,
          initRegs: testCase.initRegs,
          memDiff: failing.memDiff,
          regDiff: failing.regDiff,
          branchMismatch: failing.branchMismatch || undefined,
          selfModMissing: failing.selfModMissing || undefined,
          trace: failing.run.trace,
          finalRegs: failing.run.final.regs,
          selfModFetch: failing.run.selfModFetch,
        }
      : null;

  const testSummary: CpuTestSummary = {
    categories,
    results: verdicts.map((v) => ({ name: v.name, category: v.category, passed: v.passed })),
    counterexample,
    branchOneWayOnly,
    error: null,
  };

  const result: CpuJudgeResult = {
    score,
    total,
    passed,
    testSummary,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
    unlockedComponent: null,
  };

  // Submission row + progress update commit together.
  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: program,
      score,
      total,
      passed,
      testSummary,
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextCpuStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
