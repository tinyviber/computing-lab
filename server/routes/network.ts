import type { NetDraft, NetJudgeResult } from "../../src/features/network/domain/protocol.ts";
import { NET_STAGES } from "../../src/features/network/domain/stages.ts";
import { sanitizeDraft } from "../../src/features/network/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { judgeNetworkSubmission } from "../judge/network/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function networkRoutes() {
  // 20 submissions per stage per 10 minutes — hidden cases are seeded per
  // user, so brute-forcing a pass through submissions buys nothing.
  const judgeLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  return labRoutes<NetDraft, NetJudgeResult>({
    labId: "network",
    stageCount: NET_STAGES.length,
    saveDraft: (db, project, stageIndex, body) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {})),
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|network|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeNetworkSubmission(db, project, stageIndex, body.draft);
    },
  });
}
