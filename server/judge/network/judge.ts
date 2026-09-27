/**
 * Network lab judge: rebuilds the contract topology (fixed skeleton +
 * the fields this stage lets the student edit), rejects structural and
 * configuration violations outright, then runs the hidden, per-user
 * seeded probe cases with the same pure engine the preview used. A pass
 * needs every case green.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  NetJudgeResult,
  NetTestSummary,
} from "../../../src/features/network/domain/protocol.ts";
import { seedFor } from "../../../src/features/network/domain/rng.ts";
import {
  applyEdit,
  runCases,
  validateNet,
  validateStructure,
} from "../../../src/features/network/domain/scenario.ts";
import {
  getNetStage,
  netPrefill,
  netRequiredMap,
  netStageUnlocked,
} from "../../../src/features/network/domain/stages.ts";
import {
  NET_LAB_ID,
  sanitizeTopology,
  type NetDraft,
  type NetTopology,
} from "../../../src/features/network/domain/topology.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { hiddenNetCases } from "./hiddenSet.ts";

function nextNetStage(passedStages: readonly number[]): number {
  for (let i = 1; i <= 4; i += 1) {
    if (!passedStages.includes(i)) return i;
  }
  return 4; // all cores done; X1 is reached from the rail, not the pointer
}

export function judgeNetSubmission(
  db: DatabaseSync,
  project: ProjectRow<NetDraft>,
  stageIndex: number,
  rawDraft: unknown,
): NetJudgeResult | LabJudgeError {
  const gated = gateStage(getNetStage(stageIndex), (stage) =>
    netStageUnlocked(stage, project.passedStages),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const draft = sanitizeTopology(rawDraft);
  const seed = seedFor(project.userId, NET_LAB_ID, stage.index);
  const prefill = netPrefill(stage, seed);

  // Two-part contract: structure on the raw draft, fields on the merged view.
  const structureIssues = validateStructure(draft, prefill);
  const net: NetTopology = applyEdit(prefill, draft, stage.edit);
  const issues = [...structureIssues, ...validateNet(net, netRequiredMap(stage, seed))];
  if (issues.length > 0) {
    const testSummary: NetTestSummary = {
      categories: { 配置: { passed: 0, total: 1 } },
      results: [{ name: "结构与配置检查", category: "配置", passed: false }],
      counterexample: null,
      error: issues
        .slice(0, 3)
        .map((i) => i.message)
        .join("；"),
    };
    const result: NetJudgeResult = {
      score: 0,
      total: hiddenNetCases(stage.index, seed).length,
      passed: false,
      testSummary,
      submissionId: "",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      unlockedComponent: null,
    };
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: draft,
      score: 0,
      total: result.total,
      passed: false,
      testSummary,
    });
    return result;
  }

  const cases = hiddenNetCases(stage.index, seed);
  const verdicts = runCases(net, cases);

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
  const testSummary: NetTestSummary = {
    categories,
    results: verdicts.map((v) => ({ name: v.name, category: v.category, passed: v.passed })),
    counterexample:
      failing && testCase
        ? {
            name: failing.name,
            category: failing.category,
            detail: failing.detail,
            netCase: testCase,
          }
        : null,
    error: undefined,
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
