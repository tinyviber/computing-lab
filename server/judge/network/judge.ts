/**
 * Network lab judge: grades the submitted topology against the hidden,
 * per-user-seeded case set. The student submits bounded data — never
 * code — and the same pure `simulate` the browser preview used decides
 * every case here. A pass needs every case green.
 *
 * Defense layers, in order:
 * 1. `sanitizeDraft` normalizes the wire shape (ids, addresses, routes,
 *    link bounds).
 * 2. `enforceStageContract` re-asserts every field the stage does not
 *    open for editing, from the seeded prefill — crafted drafts can hurt
 *    the student, never help.
 * 3. `findContractIssues` fails fast on semantic misconfiguration with
 *    the same Chinese explanations the page shows.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  NetDraft,
  NetJudgeResult,
  NetTestSummary,
} from "../../../src/features/network/domain/protocol.ts";
import {
  enforceStageContract,
  findContractIssues,
} from "../../../src/features/network/domain/model.ts";
import { planFor } from "../../../src/features/network/domain/plan.ts";
import { seedFor } from "../../../src/features/network/domain/rng.ts";
import { judgeNetCase } from "../../../src/features/network/domain/scenario.ts";
import {
  getNetStage,
  isNetStageUnlocked,
  nextNetStage,
} from "../../../src/features/network/domain/stages.ts";
import { sanitizeDraft } from "../../../src/features/network/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { hiddenNetCases } from "./hiddenSet.ts";

export function judgeNetworkSubmission(
  db: DatabaseSync,
  project: ProjectRow<NetDraft>,
  stageIndex: number,
  rawDraft: unknown,
): NetJudgeResult | LabJudgeError {
  const gated = gateStage(getNetStage(stageIndex), (stage) =>
    isNetStageUnlocked(project.passedStages, stage.index),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const seed = seedFor(project.userId, project.labId, stage.index);
  const { topology: prefill, plan } = planFor(stage.index, seed);
  const draft = enforceStageContract(sanitizeDraft(rawDraft), prefill, stage.editable);

  const issues = findContractIssues(draft);
  const cases = issues.length === 0 ? hiddenNetCases(stage.index, plan) : [];
  const verdicts = cases.map((testCase) => judgeNetCase(draft, testCase, stage.maxEvents));

  const score = verdicts.filter((v) => v.passed).length;
  const total = verdicts.length;
  const passed = total > 0 && score === total;

  const categories: NetTestSummary["categories"] = {};
  for (const verdict of verdicts) {
    const tally = categories[verdict.category] ?? { passed: 0, total: 0 };
    tally.total += 1;
    if (verdict.passed) tally.passed += 1;
    categories[verdict.category] = tally;
  }

  const failingIndex = verdicts.findIndex((v) => !v.passed);
  const failing = failingIndex >= 0 ? verdicts[failingIndex] : undefined;
  const testCase = failing ? cases[failingIndex] : undefined;
  const counterexample: NetTestSummary["counterexample"] =
    failing && testCase
      ? {
          name: failing.name,
          category: failing.category,
          reason: failing.reason,
          eventsUsed: failing.eventsUsed,
          eventBudget: testCase.expect.events,
          scenario: testCase,
          outcome: failing.outcome,
          pathDiff: failing.pathDiff,
          dropDiff: failing.dropDiff,
          macDiff: failing.macDiff,
          floodDiff: failing.floodDiff,
          hopDiff: failing.hopDiff,
          trace: failing.run.trace,
          drops: failing.run.drops,
        }
      : null;

  const testSummary: NetTestSummary = {
    categories,
    results: verdicts.map((v) => ({ name: v.name, category: v.category, passed: v.passed })),
    counterexample,
    error: issues.length > 0 ? issues.join("；") : null,
  };

  const result: NetJudgeResult = {
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
      const progress = advanceStage(db, project, stageIndex, nextNetStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
