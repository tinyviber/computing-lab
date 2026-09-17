import { Hono } from "hono";
import { getOrCreateImageProject, judgeImageSubmission, saveImageDraft } from "../judge/image.ts";
import { jsonError, requireMembership, type AppVariables } from "../http/context.ts";

export function imageEncodingRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.get("/project", (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const project = getOrCreateImageProject(c.get("db"), auth.user.id, auth.membership.classId);
    return c.json({
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      artifact: project.artifact,
      draft: project.draft,
    });
  });

  app.put("/draft", async (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const input =
      body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (!input) return jsonError(c, 400, "invalid-draft");
    const project = getOrCreateImageProject(c.get("db"), auth.user.id, auth.membership.classId);
    const draft = saveImageDraft(c.get("db"), project, input.artifact, input.draft);
    return c.json({ ok: true, draft, savedAt: new Date().toISOString() });
  });

  app.post("/judge", async (c) => {
    const auth = requireMembership(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const input =
      body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
    if (!input) return jsonError(c, 400, "invalid-evidence");
    const stageIndex = Number(input.stageIndex);
    if (!Number.isInteger(stageIndex)) return jsonError(c, 400, "invalid-stage");
    const project = getOrCreateImageProject(c.get("db"), auth.user.id, auth.membership.classId);
    const outcome = judgeImageSubmission(
      c.get("db"),
      project,
      stageIndex,
      input.artifact,
      input.evidence,
    );
    if ("error" in outcome) return jsonError(c, outcome.status, outcome.error);
    return c.json(outcome);
  });

  return app;
}
