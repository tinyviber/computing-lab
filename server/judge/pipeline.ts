/**
 * Shared lab judge pipeline. Every lab judge runs the same authority chain —
 * the lab plugs in its stage table, sanitizer, and hidden judgement; the
 * surrounding record-keeping lives here once:
 *
 *   gate the stage → sanitize the submission → run hidden judgement →
 *   record the submission row → advance stage progress
 *
 * The client only ever runs public cases; grading authority is server-side
 * and a submission row plus the project progress update commit as one write
 * unit — a crash between them would record a pass the student never got
 * credit for.
 */

import type { DatabaseSync } from "node:sqlite";
import type { ComponentDef } from "../../src/features/calculator/domain/graph.ts";
import { newId, parseJsonColumn } from "../db/client.ts";

/** Machine-readable failure returned by any lab judge before grading starts. */
export type LabJudgeError = { error: string; status: number };

/**
 * `student_projects` row decoded into camelCase. `drafts` is typed per-lab via
 * `TDraft` — the column stores whatever shape the lab's draft type defines.
 */
export type ProjectRow<TDraft = unknown> = {
  id: string;
  userId: string;
  classId: string;
  labId: string;
  currentStage: number;
  passedStages: number[];
  unlockedSubmodules: ComponentDef[];
  drafts: Record<string, TDraft>;
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

function toProject<TDraft>(row: RawProject): ProjectRow<TDraft> {
  return {
    id: row.id,
    userId: row.user_id,
    classId: row.class_id,
    labId: row.lab_id,
    currentStage: row.current_stage,
    passedStages: parseJsonColumn<number[]>(row.passed_stages, []),
    unlockedSubmodules: parseJsonColumn<ComponentDef[]>(row.unlocked_submodules, []),
    drafts: parseJsonColumn<Record<string, TDraft>>(row.draft_graph, {}),
  };
}

export function getOrCreateProject<TDraft = unknown>(
  db: DatabaseSync,
  userId: string,
  classId: string,
  labId: string,
): ProjectRow<TDraft> {
  // INSERT OR IGNORE makes the get-or-create atomic under (user_id, lab_id);
  // a concurrent insert wins and is returned instead of a UNIQUE crash.
  db.prepare(
    "INSERT OR IGNORE INTO student_projects (id, user_id, class_id, lab_id) VALUES (?, ?, ?, ?)",
  ).run(newId(), userId, classId, labId);
  const row = db
    .prepare("SELECT * FROM student_projects WHERE user_id = ? AND lab_id = ?")
    .get(userId, labId) as RawProject;
  return toProject<TDraft>(row);
}

/**
 * Stage gate shared by every lab judge: the stage must exist and the lab's
 * own unlock rule must hold (linear for the image labs, prerequisite list
 * for the calculator). Returns the narrowed stage on success so callers can
 * keep `stage` typed after the gate.
 */
export function gateStage<TStage>(
  stage: TStage | undefined,
  unlocked: (stage: TStage) => boolean,
): { stage: TStage } | LabJudgeError {
  if (!stage) return { error: "unknown-stage", status: 400 };
  if (!unlocked(stage)) return { error: "stage-locked", status: 409 };
  return { stage };
}

/**
 * Persists one stage's already-sanitized draft into the project's drafts map.
 * `extras.unlockedSubmodules` additionally rewrites the component library in
 * the same update (calculator autosaves learner-made components with drafts).
 */
export function saveStageDraft<TDraft>(
  db: DatabaseSync,
  project: ProjectRow<TDraft>,
  stageIndex: number,
  draft: TDraft,
  extras?: { unlockedSubmodules?: unknown[] },
): void {
  const drafts = { ...project.drafts, [String(stageIndex)]: draft };
  if (extras?.unlockedSubmodules === undefined) {
    db.prepare(
      "UPDATE student_projects SET draft_graph = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
    ).run(JSON.stringify(drafts), project.id);
    return;
  }
  db.prepare(
    "UPDATE student_projects SET draft_graph = ?, unlocked_submodules = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(JSON.stringify(drafts), JSON.stringify(extras.unlockedSubmodules), project.id);
}

/**
 * Writes the submissions row and returns its id. Callers wrap this with the
 * progress update in one `withTransaction` so the two never diverge.
 */
export function insertSubmission(
  db: DatabaseSync,
  entry: {
    projectId: string;
    userId: string;
    labId: string;
    stageIndex: number;
    snapshot: unknown;
    score: number;
    total: number;
    passed: boolean;
    testSummary: unknown;
  },
): string {
  const submissionId = newId();
  db.prepare(
    `INSERT INTO submissions
       (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    submissionId,
    entry.projectId,
    entry.userId,
    entry.labId,
    entry.stageIndex,
    JSON.stringify(entry.snapshot),
    entry.score,
    entry.total,
    entry.passed ? 1 : 0,
    JSON.stringify(entry.testSummary),
  );
  return submissionId;
}

/**
 * Records a passed stage: merges it into the sorted, deduplicated
 * passedStages set and asks the lab's own `nextStage` where the student's
 * pointer goes. `extras.unlockedSubmodules` additionally rewrites the
 * component library in the same update (calculator component unlocks).
 */
export function advanceStage<TDraft>(
  db: DatabaseSync,
  project: ProjectRow<TDraft>,
  stageIndex: number,
  nextStage: (passedStages: readonly number[]) => number,
  extras?: { unlockedSubmodules?: unknown[] },
): { currentStage: number; passedStages: number[] } {
  // Passes may arrive out of order; keep the set sorted and deduplicated.
  const passedStages = [...new Set([...project.passedStages, stageIndex])].sort((a, b) => a - b);
  const currentStage = nextStage(passedStages);
  if (extras?.unlockedSubmodules === undefined) {
    db.prepare(
      `UPDATE student_projects
       SET current_stage = ?, passed_stages = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(currentStage, JSON.stringify(passedStages), project.id);
    return { currentStage, passedStages };
  }
  db.prepare(
    `UPDATE student_projects
     SET current_stage = ?, passed_stages = ?, unlocked_submodules = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ?`,
  ).run(
    currentStage,
    JSON.stringify(passedStages),
    JSON.stringify(extras.unlockedSubmodules),
    project.id,
  );
  return { currentStage, passedStages };
}
