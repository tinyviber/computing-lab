import { IMAGE_SAMPLING_STAGES } from "../../src/features/image-sampling/domain/stages.ts";
import type { SamplingJudgeResult } from "../../src/features/image-sampling/domain/protocol.ts";
import { sanitizeDraft, type StageDraft } from "../../src/features/image-sampling/lesson/state.ts";
import { judgeImageSubmission } from "../judge/image-sampling/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

/**
 * This lab is in admin preview: `adminPreview` turns class teachers away at
 * the API so the feature cannot leak into teacher-facing surfaces. Students
 * and admins (who hold teacher-equivalent membership) both reach it.
 */
export function imageSamplingRoutes() {
  return labRoutes<StageDraft, SamplingJudgeResult>({
    labId: "image-sampling",
    stageCount: IMAGE_SAMPLING_STAGES.length,
    adminPreview: true,
    saveDraft: (db, project, stageIndex, body) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {})),
    judge: (db, project, stageIndex, body) =>
      judgeImageSubmission(
        db,
        project,
        stageIndex,
        { width: body.width, height: body.height },
        body.code,
      ),
  });
}
