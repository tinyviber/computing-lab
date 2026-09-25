import type { IsDraft, IsJudgeResult } from "../../src/features/is-sim/domain/protocol.ts";
import { isSimStageCount } from "../../src/features/is-sim/domain/stages.ts";
import { sanitizeDraft } from "../../src/features/is-sim/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { judgeIsSimSubmission } from "../judge/is-sim/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function isSimRoutes() {
  // 20 submissions per stage per 10 minutes — the hidden set is scripted
  // per user, so brute-forcing values through submissions is useless anyway.
  const judgeLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  return labRoutes<IsDraft, IsJudgeResult>({
    labId: "is-sim",
    stageCount: isSimStageCount,
    saveDraft: (db, project, stageIndex, body) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {})),
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|is-sim|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeIsSimSubmission(db, project, stageIndex, body.draft);
    },
  });
}
