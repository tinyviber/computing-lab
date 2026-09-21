import { Hono } from "hono";
import { getOrCreateProject } from "../judge/run.ts";
import { judgeImageSubmission, saveImageDraft } from "../judge/image-sampling/judge.ts";
import {
  jsonError,
  requireMembership,
  type AppVariables,
  type GuardFailure,
} from "../http/context.ts";
import type { Context } from "hono";
import { samplingStageCount } from "../../src/features/image-sampling/domain/stages.ts";

const LAB_ID = "image-sampling";

/**
 * This lab is in admin preview: class teachers are turned away at the API so
 * the feature cannot leak into teacher-facing surfaces. Students and admins
 * (who hold teacher-equivalent membership) both reach it.
 */
function requireImageLabAccess(
  c: Context<{ Variables: AppVariables }>,
): { user: { id: string }; membership: { classId: string } } | GuardFailure {
  const auth = requireMembership(c);
  if ("error" in auth) return auth;
  if (auth.user.role === "teacher") return { error: "lab-not-available", status: 403 };
  return auth;
}

export function imageSamplingRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  // Load (or lazily create) the student's project for this lab.
  app.get("/project", (c) => {
    const auth = requireImageLabAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const project = getOrCreateProject(c.get("db"), auth.user.id, auth.membership.classId, LAB_ID);
    return c.json({
      labId: project.labId,
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: project.draftGraph,
    });
  });

  // Silent autosave of the per-stage {width, height, code} draft.
  app.put("/draft", async (c) => {
    const auth = requireImageLabAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = Number((body as { stageIndex?: unknown })?.stageIndex);
    if (!Number.isInteger(stageIndex) || stageIndex < 1 || stageIndex > samplingStageCount()) {
      return jsonError(c, 400, "invalid-stage");
    }
    const db = c.get("db");
    const project = getOrCreateProject(db, auth.user.id, auth.membership.classId, LAB_ID);
    saveImageDraft(db, project, stageIndex, (body as { draft?: unknown })?.draft ?? {});
    return c.json({ ok: true, savedAt: new Date().toISOString() });
  });

  // Authoritative submission: the hidden gallery runs here.
  app.post("/judge", async (c) => {
    const auth = requireImageLabAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = Number((body as { stageIndex?: unknown })?.stageIndex);
    if (!Number.isInteger(stageIndex) || stageIndex < 1 || stageIndex > samplingStageCount()) {
      return jsonError(c, 400, "invalid-stage");
    }
    const db = c.get("db");
    const project = getOrCreateProject(db, auth.user.id, auth.membership.classId, LAB_ID);
    const outcome = judgeImageSubmission(
      db,
      project,
      stageIndex,
      {
        width: (body as { width?: unknown })?.width,
        height: (body as { height?: unknown })?.height,
      },
      (body as { code?: unknown })?.code,
    );
    if ("error" in outcome) return jsonError(c, outcome.status, outcome.error);
    return c.json(outcome);
  });

  return app;
}
