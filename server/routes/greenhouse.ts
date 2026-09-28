import type { GhDraft, GhJudgeResult } from "../../src/features/greenhouse/domain/protocol.ts";
import { GREENHOUSE_STAGES } from "../../src/features/greenhouse/domain/stages.ts";
import { sanitizeDraft } from "../../src/features/greenhouse/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { judgeGreenhouseSubmission } from "../judge/greenhouse/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function greenhouseRoutes() {
  // 20 submissions per stage per 10 minutes — the hidden set is seeded
  // per user, so brute-forcing values through submissions is useless anyway.
  const judgeLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  return labRoutes<GhDraft, GhJudgeResult>({
    labId: "greenhouse",
    stageCount: GREENHOUSE_STAGES.length,
    saveDraft: (db, project, stageIndex, body) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {})),
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|greenhouse|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeGreenhouseSubmission(db, project, stageIndex, body.draft);
    },
  });
}
