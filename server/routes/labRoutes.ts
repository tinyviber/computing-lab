/**
 * Shared lab pipeline: every lab exposes GET /project, PUT /draft, and
 * POST /judge under /api/classes/:classId/labs/<lab>. Each route file only
 * declares its stage contract and the three data functions — access control,
 * stage validation, and payload shape live here once.
 */

import { Hono, type Context } from "hono";
import type { DatabaseSync } from "node:sqlite";
import type { SessionUser } from "../auth/session.ts";
import {
  jsonError,
  requireMembership,
  type AppVariables,
  type GuardFailure,
  type Membership,
} from "../http/context.ts";
import { getOrCreateProject, type LabJudgeError, type ProjectRow } from "../judge/pipeline.ts";
import { isLabHidden } from "../labs.ts";

type LabContext = Context<{ Variables: AppVariables }>;
type LabAuth = { user: SessionUser; membership: Membership };

type LabSpec<TDraft, TOutcome> = {
  labId: string;
  stageCount: () => number;
  /** Admin-preview labs turn class teachers away (students still enter). */
  adminPreview?: boolean;
  /** Extra top-level fields merged into the GET /project payload. */
  projectExtras?: (db: DatabaseSync, project: ProjectRow<TDraft>) => Record<string, unknown>;
  saveDraft: (
    db: DatabaseSync,
    project: ProjectRow<TDraft>,
    stageIndex: number,
    body: Record<string, unknown>,
  ) => void;
  judge: (
    db: DatabaseSync,
    project: ProjectRow<TDraft>,
    stageIndex: number,
    body: Record<string, unknown>,
  ) => TOutcome | LabJudgeError;
};

export function labRoutes<TDraft, TOutcome extends object>(
  spec: LabSpec<TDraft, TOutcome>,
): Hono<{ Variables: AppVariables }> {
  const app = new Hono<{ Variables: AppVariables }>();

  const requireAccess = (c: LabContext): LabAuth | GuardFailure => {
    const auth = requireMembership(c);
    if ("error" in auth) return auth;
    // Hidden labs are admin-only until an admin reopens them.
    if (auth.user.role !== "admin" && isLabHidden(c.get("db"), spec.labId)) {
      return { error: "lab-not-available", status: 403 };
    }
    if (spec.adminPreview && auth.user.role === "teacher") {
      return { error: "lab-not-available", status: 403 };
    }
    return auth;
  };

  const projectOf = (db: DatabaseSync, auth: LabAuth) =>
    getOrCreateProject<TDraft>(db, auth.user.id, auth.membership.classId, spec.labId);

  const stageIndexOf = (body: unknown): number | null => {
    const stageIndex = Number((body as { stageIndex?: unknown } | null)?.stageIndex);
    return Number.isInteger(stageIndex) && stageIndex >= 1 && stageIndex <= spec.stageCount()
      ? stageIndex
      : null;
  };

  app.get("/project", (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const project = projectOf(c.get("db"), auth);
    return c.json({
      labId: project.labId,
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: project.drafts,
      ...(spec.projectExtras?.(c.get("db"), project) ?? {}),
    });
  });

  app.put("/draft", async (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = stageIndexOf(body);
    if (stageIndex === null) return jsonError(c, 400, "invalid-stage");
    const db = c.get("db");
    spec.saveDraft(db, projectOf(db, auth), stageIndex, body as Record<string, unknown>);
    return c.json({ ok: true, savedAt: new Date().toISOString() });
  });

  app.post("/judge", async (c) => {
    const auth = requireAccess(c);
    if ("error" in auth) return jsonError(c, auth.status, auth.error);
    const body = await c.req.json().catch(() => null);
    const stageIndex = stageIndexOf(body);
    if (stageIndex === null) return jsonError(c, 400, "invalid-stage");
    const db = c.get("db");
    const outcome = spec.judge(
      db,
      projectOf(db, auth),
      stageIndex,
      body as Record<string, unknown>,
    );
    if ("error" in outcome) {
      return jsonError(c, (outcome as LabJudgeError).status, (outcome as LabJudgeError).error);
    }
    return c.json(outcome);
  });

  return app;
}
