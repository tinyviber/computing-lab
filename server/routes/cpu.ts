import type { DatabaseSync } from "node:sqlite";
import { coreStages } from "../../src/features/calculator/domain/stages.ts";
import type { CpuDraft, CpuJudgeResult } from "../../src/features/cpu/domain/protocol.ts";
import { CPU_STAGES, cpuStageUnlocked, getCpuStage } from "../../src/features/cpu/domain/stages.ts";
import { sanitizeDraft } from "../../src/features/cpu/lesson/state.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
import { parseJsonColumn } from "../db/client.ts";
import { requireMembership, jsonError } from "../http/context.ts";
import { judgeCpuSubmission } from "../judge/cpu/judge.ts";
import { getOrCreateProject, saveStageDraft } from "../judge/pipeline.ts";
import { canAccessLab } from "../labs.ts";
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
  const routes = labRoutes<CpuDraft, CpuJudgeResult>({
    labId: "cpu",
    stageCount: CPU_STAGES.length,
    projectExtras: (db, project) => ({
      calculatorCoreComplete: calculatorCoreComplete(db, project.userId),
    }),
    saveDraft: (db, project, stageIndex, body, revision) =>
      saveStageDraft(db, project, stageIndex, sanitizeDraft(body.draft ?? {}), {
        revision,
      }),
    judge: (db, project, stageIndex, body) => {
      const key = `${project.userId}|cpu|${stageIndex}`;
      if (judgeLimiter.exceeded(key)) return { error: "rate-limited", status: 429 };
      judgeLimiter.hit(key);
      const rawAnswers = body.guidedAnswers;
      const guidedAnswers: Record<string, number> = {};
      if (rawAnswers && typeof rawAnswers === "object") {
        for (const [key, value] of Object.entries(rawAnswers as Record<string, unknown>)) {
          if (typeof value === "number") guidedAnswers[key] = value;
        }
      }
      return judgeCpuSubmission(db, project, stageIndex, body.draft, { guidedAnswers });
    },
  });

  routes.post("/guided-answer", async (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const db = c.get("db");
    if (!canAccessLab(db, "cpu", auth.user)) return jsonError(c, 403, "lab-not-available");

    const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null;
    const stageIndex = Number(body?.stageIndex);
    const promptId = body?.promptId;
    const optionIndex = body?.optionIndex;
    const stage = getCpuStage(stageIndex);
    if (!stage?.guided || typeof promptId !== "string") {
      return jsonError(c, 400, "invalid-guided-answer");
    }

    const project = getOrCreateProject<CpuDraft>(db, auth.user.id, auth.membership.classId, "cpu");
    if (!cpuStageUnlocked(project.passedStages, stageIndex)) {
      return jsonError(c, 409, "stage-locked");
    }

    const prompt = stage.guided.prompts.find((item) => item.id === promptId);
    if (
      !prompt ||
      typeof optionIndex !== "number" ||
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= prompt.options.length
    ) {
      return jsonError(c, 400, "invalid-guided-answer");
    }

    db.prepare(
      `INSERT OR IGNORE INTO cpu_guided_first_answers
       (project_id, stage_index, prompt_id, option_index) VALUES (?, ?, ?, ?)`,
    ).run(project.id, stageIndex, promptId, optionIndex);
    const first = db
      .prepare(
        `SELECT option_index AS optionIndex FROM cpu_guided_first_answers
         WHERE project_id = ? AND stage_index = ? AND prompt_id = ?`,
      )
      .get(project.id, stageIndex, promptId) as { optionIndex: number } | undefined;
    if (!first) return jsonError(c, 500, "internal-error");
    return c.json({ optionIndex: first.optionIndex });
  });

  return routes;
}
