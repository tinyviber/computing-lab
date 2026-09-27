import { COLOR_QUANT_STAGES } from "../../src/features/color-quantization/domain/stages.ts";
import type { QuantJudgeResult } from "../../src/features/color-quantization/domain/protocol.ts";
import {
  sanitizeDraft,
  type StageDraft,
} from "../../src/features/color-quantization/lesson/state.ts";
import { judgeQuantSubmission } from "../judge/color-quantization/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function colorQuantizationRoutes() {
  return labRoutes<StageDraft, QuantJudgeResult>({
    labId: "color-quantization",
    stageCount: COLOR_QUANT_STAGES.length,
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
