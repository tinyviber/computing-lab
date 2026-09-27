/**
 * Greenhouse judge: re-runs the submitted draft through the hidden,
 * per-user-seeded scenario set with the SAME pure `simulate` the browser
 * preview used, then grades the trajectory. A pass needs every case green.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  GhDraft,
  GhJudgeResult,
  GhTestSummary,
} from "../../../src/features/greenhouse/domain/protocol.ts";
import { TRACE_WINDOW } from "../../../src/features/greenhouse/domain/protocol.ts";
import {
  getGhStage,
  greenhouseStageUnlocked,
  nextGreenhouseStage,
} from "../../../src/features/greenhouse/domain/stages.ts";
import { judgeCase } from "../../../src/features/greenhouse/lesson/scenario.ts";
import { sanitizeDraft } from "../../../src/features/greenhouse/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { hiddenCasesFor } from "./hiddenSet.ts";

export function judgeGreenhouseSubmission(
  db: DatabaseSync,
  project: ProjectRow<GhDraft>,
  stageIndex: number,
  rawDraft: unknown,
): GhJudgeResult | LabJudgeError {
  const gated = gateStage(getGhStage(stageIndex), (stage) =>
    greenhouseStageUnlocked(project.passedStages, stage.index),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const draft = sanitizeDraft(rawDraft);

  const cases = hiddenCasesFor(stage.index, project.userId);
  const verdicts = cases.map((testCase) => judgeCase(draft, stage, testCase));

  const score = verdicts.filter((v) => v.passed).length;
  const total = verdicts.length;
  const passed = total > 0 && score === total;

  const categories: GhTestSummary["categories"] = {};
  for (const verdict of verdicts) {
    const tally = categories[verdict.category] ?? { passed: 0, total: 0 };
    tally.total += 1;
    if (verdict.passed) tally.passed += 1;
    categories[verdict.category] = tally;
  }

  const failingIndex = verdicts.findIndex((v) => !v.passed);
  const failing = failingIndex >= 0 ? verdicts[failingIndex] : undefined;
  const testCase = failing ? cases[failingIndex] : undefined;
  const counterexample: GhTestSummary["counterexample"] =
    failing?.violation && testCase
      ? {
          name: failing.name,
          category: failing.category,
          reason: failing.reason,
          firstViolation: failing.violation,
          metrics: failing.metrics,
          window: failing.run.trace.slice(
            Math.max(0, failing.violation.tick - TRACE_WINDOW),
            failing.violation.tick + TRACE_WINDOW + 1,
          ),
          scenario: testCase,
        }
      : null;

  const testSummary: GhTestSummary = {
    categories,
    results: verdicts
      .slice(0, 32)
      .map((v) => ({ name: v.name, category: v.category, passed: v.passed })),
    counterexample,
    error: null,
  };

  const result: GhJudgeResult = {
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
      snapshot: draft,
      score,
      total,
      passed,
      testSummary,
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextGreenhouseStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
