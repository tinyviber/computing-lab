import type { NetJudgeResult } from "../../src/features/network/domain/protocol.ts";
import { NET_STAGES } from "../../src/features/network/domain/stages.ts";
import { sanitizeTopology, type NetDraft } from "../../src/features/network/domain/topology.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { judgeNetSubmission } from "../judge/network/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

export function networkRoutes() {
  // 20 submissions per stage per 10 minutes — hidden probes are seeded per
  // user, so brute-forcing configs through submissions is useless anyway.
  const judgeLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  return labRoutes<NetDraft, NetJudgeResult>({
    labId: "network-sim",
    stageCount: NET_STAGES.length,
    adminPreview: true,
    saveDraft: (db, project, stageIndex, body) =>
      saveStageDraft(db, project, stageIndex, sanitizeTopology(body.draft ?? {})),
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|network-sim|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeNetSubmission(db, project, stageIndex, body.draft);
    },
  });
}
