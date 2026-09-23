/**
 * Server-side judge: runs hidden test vectors against a submitted circuit
 * snapshot, persists the Submission, and advances stage progress on a full
 * pass. All grading authority lives here; the client only runs public cases.
 */

import type { DatabaseSync } from "node:sqlite";
import { runCases, type CaseResult } from "../../src/features/calculator/domain/evaluate.ts";
import { isValidComponentIdentifier } from "../../src/features/calculator/domain/componentize.ts";
import {
  findContractIssues,
  sanitizeGraph,
  type Bit,
  type CircuitGraph,
  type ComponentDef,
} from "../../src/features/calculator/domain/graph.ts";
import {
  getStage,
  nextMainlineStage,
  stagePrerequisites,
} from "../../src/features/calculator/domain/stages.ts";
import { newId } from "../db/client.ts";
import { hiddenTestsFor } from "./testcases.ts";

export type TestSummary = {
  categories: Record<string, { passed: number; total: number }>;
  results: { name: string; category: string; passed: boolean }[];
  /** First failing hidden case, in runCases order; null on a full pass. */
  counterexample: {
    name: string;
    category: string;
    inputs: Record<string, Bit>;
    expected: Record<string, Bit>;
    actual: Record<string, Bit | null>;
  } | null;
  error: string | null;
};

export type ProjectRow = {
  id: string;
  userId: string;
  classId: string;
  labId: string;
  currentStage: number;
  passedStages: number[];
  unlockedSubmodules: ComponentDef[];
  draftGraph: Record<string, CircuitGraph>;
};

type RawProject = {
  id: string;
  user_id: string;
  class_id: string;
  lab_id: string;
  current_stage: number;
  passed_stages: string;
  unlocked_submodules: string;
  draft_graph: string;
};

function toProject(row: RawProject): ProjectRow {
  return {
    id: row.id,
    userId: row.user_id,
    classId: row.class_id,
    labId: row.lab_id,
    currentStage: row.current_stage,
    passedStages: JSON.parse(row.passed_stages) as number[],
    unlockedSubmodules: JSON.parse(row.unlocked_submodules) as ComponentDef[],
    draftGraph: JSON.parse(row.draft_graph) as Record<string, CircuitGraph>,
  };
}

export function getOrCreateProject(
  db: DatabaseSync,
  userId: string,
  classId: string,
  labId: string,
): ProjectRow {
  const existing = db
    .prepare("SELECT * FROM student_projects WHERE user_id = ? AND lab_id = ?")
    .get(userId, labId) as RawProject | undefined;
  if (existing) return toProject(existing);
  const id = newId();
  db.prepare(
    "INSERT INTO student_projects (id, user_id, class_id, lab_id) VALUES (?, ?, ?, ?)",
  ).run(id, userId, classId, labId);
  return toProject(db.prepare("SELECT * FROM student_projects WHERE id = ?").get(id) as RawProject);
}

export function saveDraft(
  db: DatabaseSync,
  project: ProjectRow,
  stageIndex: number,
  graph: unknown,
  rawComponents?: unknown,
): void {
  const drafts = { ...project.draftGraph, [String(stageIndex)]: sanitizeGraph(graph) };
  if (rawComponents === undefined) {
    db.prepare(
      "UPDATE student_projects SET draft_graph = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(JSON.stringify(drafts), project.id);
    return;
  }
  const submodules = [...mergeCustomComponents(project.unlockedSubmodules, rawComponents)];
  db.prepare(
    "UPDATE student_projects SET draft_graph = ?, unlocked_submodules = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(JSON.stringify(drafts), JSON.stringify(submodules), project.id);
}

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

export type JudgeOutcome = {
  score: number;
  total: number;
  passed: boolean;
  testSummary: TestSummary;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
  unlockedComponent: string | null;
};

export function judgeSubmission(
  db: DatabaseSync,
  project: ProjectRow,
  stageIndex: number,
  rawGraph: unknown,
  rawComponents?: unknown,
): JudgeOutcome | { error: string; status: number } {
  const stage = getStage(stageIndex);
  if (!stage) return { error: "unknown-stage", status: 400 };
  // Core stages are always judgeable in any order; optional stages declare
  // their own local prerequisite, with legacy challenges defaulting to all
  // core stages.
  const prerequisites = stagePrerequisites(stage);
  if (!prerequisites.every((index) => project.passedStages.includes(index))) {
    return { error: "stage-locked", status: 409 };
  }

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

  const categories: TestSummary["categories"] = {};
  for (const r of results as CaseResult[]) {
    const bucket = (categories[r.category] ??= { passed: 0, total: 0 });
    bucket.total += 1;
    if (r.passed) bucket.passed += 1;
  }
  const firstError = results.find((r) => r.error)?.error;
  const failIndex = results.findIndex((r) => !r.passed);
  const testSummary: TestSummary = {
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

  const submissionId = newId();
  db.prepare(
    `INSERT INTO submissions
       (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    submissionId,
    project.id,
    project.userId,
    project.labId,
    stageIndex,
    JSON.stringify(graph),
    score,
    total,
    passed ? 1 : 0,
    JSON.stringify(testSummary),
  );

  let currentStage = project.currentStage;
  let passedStages = project.passedStages;
  let unlockedComponent: string | null = null;
  if (passed) {
    // Passes may arrive out of order; keep the set sorted and deduplicated.
    passedStages = [...new Set([...project.passedStages, stageIndex])].sort((a, b) => a - b);
    currentStage = nextMainlineStage(passedStages);
    if (stage.unlocks) {
      unlockedComponent = stage.unlocks;
      const unlockName = stage.unlocks.toLocaleLowerCase();
      const rest = submodules.filter((s) => s.name.toLocaleLowerCase() !== unlockName);
      submodules.splice(0, submodules.length, ...rest, { name: stage.unlocks, graph });
    }
    db.prepare(
      `UPDATE student_projects
       SET current_stage = ?, passed_stages = ?, unlocked_submodules = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(currentStage, JSON.stringify(passedStages), JSON.stringify(submodules), project.id);
  } else if (rawComponents !== undefined) {
    // Keep learner-made blocks even when the current circuit still needs work.
    db.prepare(
      "UPDATE student_projects SET unlocked_submodules = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(JSON.stringify(submodules), project.id);
  }

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
