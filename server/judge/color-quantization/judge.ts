/**
 * Color-quantization judge: evaluates a submitted toner choice against the
 * public+hidden gallery of the stage's category. Pure data in, verdict out —
 * student code is never executed here; `code` is stored as a snapshot only.
 *
 *   pick stage: submission is the set of loaded toner cartridges; the
 *               printer applies its fixed nearest-toner rule.
 *   free stage: submission is a full mapping table over the source colors;
 *               entries must stay inside the stage's fixed loadout, and at
 *               most `overrideBudget` may differ from the default table.
 */

import type { DatabaseSync } from "node:sqlite";
import type { QuantJudgeResult } from "../../../src/features/color-quantization/domain/protocol.ts";
import {
  countOverrides,
  nnTable,
  sanitizeSubset,
  sanitizeTable,
  usedToners,
} from "../../../src/features/color-quantization/domain/quantize.ts";
import {
  confusionPairs,
  encodeVerdictDetail,
  judgeMapping,
} from "../../../src/features/color-quantization/domain/recognize.ts";
import {
  getQuantStage,
  nextQuantStage,
} from "../../../src/features/color-quantization/domain/stages.ts";
import {
  sanitizeDraft,
  type StageDraft,
} from "../../../src/features/color-quantization/lesson/state.ts";
import { newId } from "../../db/client.ts";
import type { ProjectRow } from "../run.ts";
import { judgeGalleryFor } from "./hiddenSet.ts";

const LAB_ID = "color-quantization";

export function saveQuantDraft(
  db: DatabaseSync,
  project: ProjectRow,
  stageIndex: number,
  raw: unknown,
): void {
  // draft_graph is a free JSON column; quantization drafts are
  // {toners,table,code}, not circuit graphs — the calculator type on
  // ProjectRow doesn't apply here.
  const drafts: Record<string, unknown> = { ...project.draftGraph };
  drafts[String(stageIndex)] = sanitizeDraft(raw) satisfies StageDraft;
  db.prepare(
    "UPDATE student_projects SET draft_graph = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(JSON.stringify(drafts), project.id);
}

export type QuantJudgeError = { error: string; status: number };

export function judgeQuantSubmission(
  db: DatabaseSync,
  project: ProjectRow,
  stageIndex: number,
  rawSubmission: unknown,
  rawCode?: unknown,
): QuantJudgeResult | QuantJudgeError {
  const stage = getQuantStage(stageIndex);
  if (!stage) return { error: "unknown-stage", status: 400 };
  if (stage.index > 1 && !project.passedStages.includes(stage.index - 1)) {
    return { error: "stage-locked", status: 409 };
  }
  const submission = (rawSubmission ?? {}) as { toners?: unknown; table?: unknown };

  // Resolve the effective mapping table for the stage's mode.
  let table: number[];
  let overrides: number | null = null;
  if (stage.mode === "pick") {
    const subset = sanitizeSubset(submission.toners);
    if (!subset || subset.length === 0) return { error: "invalid-toners", status: 400 };
    table = nnTable(subset);
  } else {
    const cleaned = sanitizeTable(submission.table);
    if (!cleaned) return { error: "invalid-table", status: 400 };
    const loadout = stage.fixedLoadout!;
    if (cleaned.some((v) => v >= 0 && !loadout.includes(v))) {
      return { error: "toner-not-loaded", status: 400 };
    }
    overrides = countOverrides(cleaned, nnTable(loadout));
    table = cleaned;
  }

  const gallery = judgeGalleryFor(stage.category);
  const report = judgeMapping(gallery, table);
  const toners = usedToners(table);

  const withinBudget =
    stage.mode === "pick"
      ? toners.length <= stage.tonerSlots!
      : overrides! <= stage.overrideBudget!;
  const passed = withinBudget && report.accuracy >= stage.requiredAccuracy;

  const failing = report.verdicts.find((v) => !v.ok);
  const counterexample = failing
    ? encodeVerdictDetail(
        gallery.find((e) => e.id === failing.queryId)!,
        gallery.find((e) => e.id === failing.collidedWith[0]?.id) ?? null,
        table,
        failing,
      )
    : null;
  const pairs = confusionPairs(gallery, table).slice(0, 6);

  const result: QuantJudgeResult = {
    mode: stage.mode,
    table,
    tonersUsed: toners,
    slotsUsed: toners.length,
    slotsBudget: stage.tonerSlots,
    overrides,
    overrideBudget: stage.overrideBudget,
    identified: report.identified,
    total: report.total,
    accuracy: report.accuracy,
    requiredAccuracy: stage.requiredAccuracy,
    withinBudget,
    passed,
    counterexample,
    confusionPairs: pairs,
    submissionId: newId(),
    currentStage: project.currentStage,
    passedStages: project.passedStages,
  };

  const code = typeof rawCode === "string" ? rawCode.slice(0, 8000) : undefined;
  const testSummary = {
    tonersUsed: toners,
    slotsUsed: result.slotsUsed,
    overrides: result.overrides,
    accuracy: result.accuracy,
    identified: result.identified,
    total: result.total,
    requiredAccuracy: stage.requiredAccuracy,
    withinBudget,
    counterexample,
    confusionPairs: pairs,
    error: null,
  };
  db.prepare(
    `INSERT INTO submissions
       (id, project_id, user_id, lab_id, stage_index, snapshot_graph, score, total, passed, test_summary)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    result.submissionId,
    project.id,
    project.userId,
    LAB_ID,
    stageIndex,
    JSON.stringify({ mode: stage.mode, submission, code }),
    report.identified,
    report.total,
    passed ? 1 : 0,
    JSON.stringify(testSummary),
  );

  if (passed) {
    const passedStages = [...new Set([...project.passedStages, stageIndex])].sort((a, b) => a - b);
    const currentStage = nextQuantStage(passedStages);
    db.prepare(
      `UPDATE student_projects
       SET current_stage = ?, passed_stages = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ?`,
    ).run(currentStage, JSON.stringify(passedStages), project.id);
    result.passedStages = passedStages;
    result.currentStage = currentStage;
  }

  return result;
}
