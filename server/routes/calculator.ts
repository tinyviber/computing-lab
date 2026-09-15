import { Hono } from "hono";
import { getOrCreateProject, judgeSubmission, saveDraft } from "../judge/run.ts";
import { jsonError, requireMembership, type AppVariables } from "../http/context.ts";

const LAB_ID = "calculator";

export function calculatorRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  // Load (or lazily create) the student's project for this lab.
  app.get("/project", (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const project = getOrCreateProject(c.get("db"), auth.user.id, auth.membership.classId, LAB_ID);
    return c.json({
      labId: project.labId,
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      unlockedSubmodules: project.unlockedSubmodules,
      draftGraph: project.draftGraph,
    });
  });

  // Silent autosave of the canvas draft for one stage.
  app.put("/draft", async (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = Number((body as { stageIndex?: unknown })?.stageIndex);
    if (!Number.isInteger(stageIndex) || stageIndex < 1 || stageIndex > 7) {
      return jsonError(c, 400, "invalid-stage");
    }
    const db = c.get("db");
    const project = getOrCreateProject(db, auth.user.id, auth.membership.classId, LAB_ID);
    saveDraft(db, project, stageIndex, (body as { graph?: unknown })?.graph ?? {});
    return c.json({ ok: true, savedAt: new Date().toISOString() });
  });

  // Authoritative submission: hidden tests run here.
  app.post("/judge", async (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = Number((body as { stageIndex?: unknown })?.stageIndex);
    if (!Number.isInteger(stageIndex) || stageIndex < 1 || stageIndex > 7) {
      return jsonError(c, 400, "invalid-stage");
    }
    const db = c.get("db");
    const project = getOrCreateProject(db, auth.user.id, auth.membership.classId, LAB_ID);
    const outcome = judgeSubmission(db, project, stageIndex, (body as { graph?: unknown })?.graph);
    if ("error" in outcome) return jsonError(c, outcome.status, outcome.error);
    return c.json(outcome);
  });

  return app;
}
