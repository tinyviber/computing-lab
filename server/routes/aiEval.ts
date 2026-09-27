import type { AiEvalDraft, AiEvalJudgeResult } from "../../src/features/ai-eval/domain/protocol.ts";
import type { Probe } from "../../src/features/ai-eval/domain/probe.ts";
import { MAX_PROBES_PER_STAGE, PHRASING_DIMS } from "../../src/features/ai-eval/domain/probe.ts";
import { sanitizeAiEvalDraft } from "../../src/features/ai-eval/domain/sanitize.ts";
import { AI_EVAL_STAGES } from "../../src/features/ai-eval/domain/stages.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { judgeAiEvalSubmission } from "../judge/ai-eval/judge.ts";
import {
  issueDraws,
  projectExtras,
  stampPredictionChange,
  verifySlot,
} from "../judge/ai-eval/hiddenBank.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

const DIMS = new Set<string>(PHRASING_DIMS.map((d) => d.id));

function parseProbe(raw: unknown): Probe | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as { questionId?: unknown; phrasing?: unknown; k?: unknown };
  if (typeof p.questionId !== "string" || p.questionId.length > 64) return null;
  if (!Array.isArray(p.phrasing) || p.phrasing.length > 2) return null;
  if (!p.phrasing.every((d) => typeof d === "string" && DIMS.has(d))) return null;
  if (!Number.isInteger(p.k) || (p.k as number) < 0) return null;
  return {
    questionId: p.questionId,
    phrasing: p.phrasing as Probe["phrasing"],
    k: p.k as number,
  };
}

export function aiEvalRoutes() {
  // Draws, verifies and submissions are each rate-limited: 20 per stage per
  // 10 minutes, keyed by user. Replay can't be brute-forced — the seed is
  // per-user — the cap just keeps the ledger bounded.
  const drawLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  const verifyLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  const judgeLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);

  const key = (userId: string, stageIndex: number) => `${userId}|ai-eval|${stageIndex}`;

  return labRoutes<AiEvalDraft, AiEvalJudgeResult>({
    labId: "ai-eval",
    stageCount: AI_EVAL_STAGES.length,
    adminPreview: true,
    projectExtras: (_db, project) => projectExtras(project),
    actions: {
      draws: (db, project, stageIndex, body) => {
        if (drawLimiter.exceeded(key(project.userId, stageIndex))) {
          return { error: "rate-limited", status: 429 };
        }
        drawLimiter.hit(key(project.userId, stageIndex));
        const raw = (body as { probes?: unknown }).probes;
        if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_PROBES_PER_STAGE) {
          return { error: "invalid-probe", status: 400 };
        }
        const probes = raw.map(parseProbe);
        if (probes.some((p) => p === null)) return { error: "invalid-probe", status: 400 };
        return issueDraws(db, project, stageIndex, probes as Probe[]);
      },
      verify: (db, project, stageIndex, body) => {
        if (verifyLimiter.exceeded(key(project.userId, stageIndex))) {
          return { error: "rate-limited", status: 429 };
        }
        verifyLimiter.hit(key(project.userId, stageIndex));
        const b = body as { drawId?: unknown; slotIndex?: unknown };
        if (typeof b.drawId !== "string" || !Number.isInteger(b.slotIndex)) {
          return { error: "invalid-slot", status: 400 };
        }
        return verifySlot(db, project, stageIndex, b.drawId, b.slotIndex as number);
      },
    },
    saveDraft: (db, project, stageIndex, body) => {
      const prior = project.drafts[String(stageIndex)];
      const draft = sanitizeAiEvalDraft(stageIndex, body.draft ?? {}, prior);
      // C2 timing evidence: any change to predictions bumps the server seq
      // so the judge can order it against firstDrawSeq.
      saveStageDraft(db, project, stageIndex, stampPredictionChange(draft, prior));
    },
    judge: (db, project, stageIndex, body) => {
      const k = key(project.userId, stageIndex);
      if (judgeLimiter.exceeded(k)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(k);
      return judgeAiEvalSubmission(db, project, stageIndex, body.draft);
    },
  });
}
