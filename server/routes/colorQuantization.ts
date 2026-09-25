import { COLOR_QUANT_STAGES } from "../../src/features/color-quantization/domain/stages.ts";
import type { QuantJudgeResult } from "../../src/features/color-quantization/domain/protocol.ts";
import {
  sanitizeDraft,
  type StageDraft,
} from "../../src/features/color-quantization/lesson/state.ts";
import { judgeQuantSubmission } from "../judge/color-quantization/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

/**
 * This lab is in admin preview: `adminPreview` turns class teachers away at
 * the API so the feature cannot leak into teacher-facing surfaces. Students
 * and admins (who hold teacher-equivalent membership) both reach it.
 */
export function colorQuantizationRoutes() {
  return labRoutes<StageDraft, QuantJudgeResult>({
    labId: "color-quantization",
    stageCount: COLOR_QUANT_STAGES.length,
    adminPreview: true,
    saveDraft: (db, project, stageIndex, body) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {})),
    judge: (db, project, stageIndex, body) =>
      judgeQuantSubmission(
        db,
        project,
        stageIndex,
        { toners: body.toners, table: body.table },
        body.code,
      ),
  });
}
