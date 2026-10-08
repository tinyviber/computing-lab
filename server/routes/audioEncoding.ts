import { AUDIO_ENCODING_STAGES } from "../../src/features/audio-encoding/domain/stages.ts";
import type { AudioEncodingJudgeResult } from "../../src/features/audio-encoding/domain/protocol.ts";
import { sanitizeDraft, type StageDraft } from "../../src/features/audio-encoding/lesson/state.ts";
import { judgeAudioSubmission } from "../judge/audio-encoding/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function audioEncodingRoutes() {
  return labRoutes<StageDraft, AudioEncodingJudgeResult>({
    labId: "audio-encoding",
    stageCount: AUDIO_ENCODING_STAGES.length,
    saveDraft: (db, project, stageIndex, body) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {})),
    judge: (db, project, stageIndex, body) => judgeAudioSubmission(db, project, stageIndex, body),
  });
}
