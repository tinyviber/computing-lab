import type { DatabaseSync } from "node:sqlite";
import { coreStages } from "../../src/features/calculator/domain/stages.ts";
import type { CpuDraft, CpuJudgeResult } from "../../src/features/cpu/domain/protocol.ts";
import { cpuStageCount } from "../../src/features/cpu/domain/stages.ts";
import { sanitizeDraft } from "../../src/features/cpu/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { parseJsonColumn } from "../db/client.ts";
import { judgeCpuSubmission } from "../judge/cpu/judge.ts";
import { saveStageDraft } from "../judge/pipeline.ts";
import { labRoutes } from "./labRoutes.ts";

/**
 * Soft gate, not a wall: the banner tells students to finish the
 * calculator's core line first, but nothing blocks entry — the cpu lab is a
 * real course lab, just sequenced after it.
 */
function calculatorCoreComplete(db: DatabaseSync, userId: string): boolean {
  const row = db
    .prepare(
      "SELECT passed_stages FROM student_projects WHERE user_id = ? AND lab_id = 'calculator'",
    )
    .get(userId) as { passed_stages: string } | undefined;
  const passed = row ? parseJsonColumn<number[]>(row.passed_stages, []) : [];
  return coreStages().every((stage) => passed.includes(stage.index));
}

export function cpuRoutes() {
  // 20 submissions per stage per 10 minutes — the hidden set is large enough
  // that brute-forcing case values through submissions is useless anyway.
  const judgeLimiter = new SlidingWindowLimiter(20, 10 * 60 * 1000);
  return labRoutes<CpuDraft, CpuJudgeResult>({
    labId: "cpu",
    stageCount: cpuStageCount,
    projectExtras: (db, project) => ({
      calculatorCoreComplete: calculatorCoreComplete(db, project.userId),
    }),
    saveDraft: (db, project, stageIndex, body) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {})),
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|cpu|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      return judgeCpuSubmission(db, project, stageIndex, body.draft);
    },
  });
}
