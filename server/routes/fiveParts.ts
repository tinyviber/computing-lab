import { FIVE_PARTS_STAGES } from "../../src/features/five-parts/domain/stages.ts";
import type {
  FivePartsDraft,
  FivePartsJudgeResult,
} from "../../src/features/five-parts/domain/protocol.ts";
import { sanitizeDraft } from "../../src/features/five-parts/lesson/state.ts";
import { judgeFivePartsSubmission } from "../judge/five-parts/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function fivePartsRoutes() {
  return labRoutes<FivePartsDraft, FivePartsJudgeResult>({
    labId: "five-parts",
    stageCount: FIVE_PARTS_STAGES.length,
    saveDraft: (db, project, stageIndex, body, expectedRevision) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {}, stageIndex), {
        expectedRevision,
      }),
    judge: (db, project, stageIndex, body) =>
      judgeFivePartsSubmission(db, project, stageIndex, {
        a: body.a,
        b: body.b,
        answer: body.answer,
      }),
  });
}
