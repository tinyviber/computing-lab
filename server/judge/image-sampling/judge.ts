/**
 * Image-sampling judge: evaluates a submitted resolution (w,h) against the
 * public+hidden gallery of the stage's category. Pure data in, verdict out —
 * student code is never executed here; `code` is stored as a snapshot only.
 */

import type { DatabaseSync } from "node:sqlite";
import { sanitizeResolution } from "../../../src/features/image-sampling/domain/downsample.ts";
import type { SamplingJudgeResult } from "../../../src/features/image-sampling/domain/protocol.ts";
import {
  confusionPairs,
  encodeVerdictDetail,
  judgeResolution,
} from "../../../src/features/image-sampling/domain/recognize.ts";
import {
  getSamplingStage,
  nextSamplingStage,
} from "../../../src/features/image-sampling/domain/stages.ts";
import {
  sanitizeDraft,
  type StageDraft,
} from "../../../src/features/image-sampling/lesson/state.ts";
import { newId } from "../../db/client.ts";
import type { ProjectRow } from "../run.ts";
import { judgeGalleryFor } from "./hiddenGallery.ts";

const LAB_ID = "image-sampling";

export function saveImageDraft(
  db: DatabaseSync,
  project: ProjectRow,
  stageIndex: number,
  raw: unknown,
): void {
  // draft_graph is a free JSON column; image drafts are {width,height,code},
  // not circuit graphs — the calculator type on ProjectRow doesn't apply here.
  const drafts: Record<string, unknown> = { ...project.draftGraph };
  drafts[String(stageIndex)] = sanitizeDraft(raw) satisfies StageDraft;
  db.prepare(
    "UPDATE student_projects SET draft_graph = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?",
  ).run(JSON.stringify(drafts), project.id);
}

export type ImageJudgeError = { error: string; status: number };

export function judgeImageSubmission(
  db: DatabaseSync,
  project: ProjectRow,
  stageIndex: number,
  rawResolution: unknown,
  rawCode?: unknown,
): SamplingJudgeResult | ImageJudgeError {
  const stage = getSamplingStage(stageIndex);
  if (!stage) return { error: "unknown-stage", status: 400 };
  if (stage.index > 1 && !project.passedStages.includes(stage.index - 1)) {
    return { error: "stage-locked", status: 409 };
  }

  const resolution = sanitizeResolution(rawResolution);
  if (!resolution) return { error: "invalid-resolution", status: 400 };
  if (stage.mode === "square" && resolution.width !== resolution.height) {
    return { error: "square-resolution-required", status: 400 };
  }
  if (stage.mode === "tall" && resolution.height <= resolution.width) {
    return { error: "tall-resolution-required", status: 400 };
  }

  const gallery = judgeGalleryFor(stage.category);
  const report = judgeResolution(gallery, gallery, resolution.width, resolution.height);
  const withinBudget = report.cells <= stage.cellBudget;
  const passed = withinBudget && report.accuracy >= stage.requiredAccuracy;

  const failing = report.verdicts.find((v) => !v.ok);
  const counterexample = failing
    ? encodeVerdictDetail(
        gallery.find((e) => e.id === failing.queryId)!,
        gallery.find((e) => e.id === failing.predictedId) ?? null,
        resolution.width,
        resolution.height,
        failing,
      )
    : null;
  const pairs = confusionPairs(gallery, resolution.width, resolution.height).slice(0, 6);

  const result: SamplingJudgeResult = {
    resolution: { width: resolution.width, height: resolution.height, cells: report.cells },
    identified: report.identified,
    total: report.total,
    accuracy: report.accuracy,
    requiredAccuracy: stage.requiredAccuracy,
    cellBudget: stage.cellBudget,
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
    resolution: result.resolution,
    accuracy: result.accuracy,
    identified: result.identified,
    total: result.total,
    requiredAccuracy: stage.requiredAccuracy,
    cellBudget: stage.cellBudget,
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
    JSON.stringify({ ...resolution, code }),
    report.identified,
    report.total,
    passed ? 1 : 0,
    JSON.stringify(testSummary),
  );

  if (passed) {
    const passedStages = [...new Set([...project.passedStages, stageIndex])].sort((a, b) => a - b);
    const currentStage = nextSamplingStage(passedStages);
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
