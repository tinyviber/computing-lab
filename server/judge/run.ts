/**
 * Server-side judge: runs hidden test vectors against a submitted circuit
 * snapshot. Calculator-specific parts live here — contract checks, hidden
 * cases, component unlocks — while the shared pipeline (stage gate, draft
 * and submission persistence, stage advancement) comes from ./pipeline.ts.
 */

import type { DatabaseSync } from "node:sqlite";
import { runCases, type CaseResult } from "../../src/features/calculator/domain/evaluate.ts";
import { isValidComponentIdentifier } from "../../src/features/calculator/domain/componentize.ts";
import {
  findContractIssues,
  sanitizeGraph,
  type CircuitGraph,
  type ComponentDef,
} from "../../src/features/calculator/domain/graph.ts";
import {
  getStage,
  nextMainlineStage,
  stagePrerequisites,
} from "../../src/features/calculator/domain/stages.ts";
import type {
  CalculatorJudgeResult,
  CalculatorTestSummary,
} from "../../src/features/calculator/domain/protocol.ts";
import { withTransaction } from "../db/client.ts";
import {
  advanceStage,
  insertSubmission,
  saveStageDraft,
  gateStage,
  type LabJudgeError,
  type ProjectRow,
} from "./pipeline.ts";
import { hiddenTestsFor } from "./testcases.ts";

export type { CalculatorJudgeResult as JudgeOutcome, CalculatorTestSummary as TestSummary };

function componentMap(submodules: ComponentDef[]): Record<string, CircuitGraph> {
  return Object.fromEntries(submodules.map((s) => [s.name, s.graph]));
}

function submittedCustomComponents(raw: unknown): ComponentDef[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((value): ComponentDef[] => {
    if (!value || typeof value !== "object") return [];
    const candidate = value as { name?: unknown; graph?: unknown; custom?: unknown };
    if (
      candidate.custom !== true ||
      typeof candidate.name !== "string" ||
      !isValidComponentIdentifier(candidate.name)
    ) {
      return [];
    }
    return [{ name: candidate.name.trim(), graph: sanitizeGraph(candidate.graph), custom: true }];
  });
}

/**
 * The server owns stage-unlocked components. Learner-made components may be
 * added or updated, but a request can never replace an official component.
 */
function mergeCustomComponents(existing: ComponentDef[], raw: unknown): ComponentDef[] {
  // Omitting components means "leave the saved component library alone".
  // When the client sends the list, it is authoritative for learner-made
  // components so that deleting one can be persisted by autosave.
  if (raw === undefined) return existing;

  const officialNames = new Set(
    existing
      .filter((component) => !component.custom)
      .map((component) => component.name.toLocaleLowerCase()),
  );
  const submitted = submittedCustomComponents(raw).filter(
    (component) => !officialNames.has(component.name.toLocaleLowerCase()),
  );
  const submittedByName = new Map(
    submitted.map((component) => [component.name.toLocaleLowerCase(), component]),
  );
  const merged: ComponentDef[] = [];

  for (const component of existing) {
    if (!component.custom) {
      merged.push(component);
      continue;
    }
    const replacement = submittedByName.get(component.name.toLocaleLowerCase());
    if (replacement) {
      merged.push(replacement);
      submittedByName.delete(component.name.toLocaleLowerCase());
    }
  }

  merged.push(...submittedByName.values());
  return merged;
}

export function saveDraft(
  db: DatabaseSync,
  project: ProjectRow<CircuitGraph>,
  stageIndex: number,
  graph: unknown,
  rawComponents?: unknown,
): void {
  const submodules =
    rawComponents === undefined
      ? undefined
      : [...mergeCustomComponents(project.unlockedSubmodules, rawComponents)];
  saveStageDraft(db, project, stageIndex, sanitizeGraph(graph), {
    unlockedSubmodules: submodules,
  });
}

export function judgeSubmission(
  db: DatabaseSync,
  project: ProjectRow<CircuitGraph>,
  stageIndex: number,
  rawGraph: unknown,
  rawComponents?: unknown,
): CalculatorJudgeResult | LabJudgeError {
  // Core stages are always judgeable in any order; optional stages declare
  // their own local prerequisite, with legacy challenges defaulting to all
  // core stages.
  const gated = gateStage(getStage(stageIndex), (stage) =>
    stagePrerequisites(stage).every((index) => project.passedStages.includes(index)),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const graph = sanitizeGraph(rawGraph);
  const submodules = [...mergeCustomComponents(project.unlockedSubmodules, rawComponents)];
  const cases = hiddenTestsFor(stageIndex);
  // Structural gate before any truth-table work: a graph whose contract is
  // already broken (missing/undriven pins, multi-driven ports) fails here
  // with a readable reason instead of "losing" a percentage of cases.
  const structureIssues = findContractIssues(graph, stage.inputs, stage.outputs);
  const { results, score, total } = structureIssues.length
    ? { results: [] as CaseResult[], score: 0, total: cases.length }
    : runCases(graph, cases, componentMap(submodules));

  const categories: CalculatorTestSummary["categories"] = {};
  for (const r of results as CaseResult[]) {
    const bucket = (categories[r.category] ??= { passed: 0, total: 0 });
    bucket.total += 1;
    if (r.passed) bucket.passed += 1;
  }
  const firstError = results.find((r) => r.error)?.error;
  const failIndex = results.findIndex((r) => !r.passed);
  const testSummary: CalculatorTestSummary = {
    categories,
    results: results.map((r) => ({ name: r.name, category: r.category, passed: r.passed })),
    counterexample:
      failIndex >= 0
        ? {
            name: results[failIndex].name,
            category: results[failIndex].category,
            inputs: cases[failIndex].inputs,
            expected: results[failIndex].expected,
            actual: results[failIndex].actual,
          }
        : null,
    error: structureIssues.length
      ? `结构问题：${structureIssues.join("；")}`
      : firstError
        ? `${firstError.kind}: ${firstError.detail}`
        : null,
  };
  const passed = score === total && total > 0;

  // Submission row + project progress are one write unit — a crash between
  // them would record a pass the student never got credit for.
  let currentStage = project.currentStage;
  let passedStages = project.passedStages;
  let unlockedComponent: string | null = null;
  const submissionId = withTransaction(db, () => {
    const submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: graph,
      score,
      total,
      passed,
      testSummary,
    });

    if (passed) {
      if (stage.unlocks) {
        unlockedComponent = stage.unlocks;
        const unlockName = stage.unlocks.toLocaleLowerCase();
        const rest = submodules.filter((s) => s.name.toLocaleLowerCase() !== unlockName);
        submodules.splice(0, submodules.length, ...rest, { name: stage.unlocks, graph });
      }
      const progress = advanceStage(db, project, stageIndex, nextMainlineStage, {
        unlockedSubmodules: submodules,
      });
      currentStage = progress.currentStage;
      passedStages = progress.passedStages;
    } else if (rawComponents !== undefined) {
      // Keep learner-made blocks even when the current circuit still needs work.
      db.prepare(
        "UPDATE student_projects SET unlocked_submodules = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
      ).run(JSON.stringify(submodules), project.id);
    }
    return submissionId;
  });

  return {
    score,
    total,
    passed,
    testSummary,
    submissionId,
    currentStage,
    passedStages,
    unlockedComponent,
  };
}
