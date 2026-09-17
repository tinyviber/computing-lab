import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import {
  createSession,
  destroySession,
  sessionCookieValue,
  clearedSessionCookie,
  type SessionUser,
} from "../auth/session.ts";
import { jsonError, membershipsOf, type AppVariables } from "../http/context.ts";

function mePayload(db: Parameters<typeof membershipsOf>[0], user: SessionUser) {
  return {
    user: { id: user.id, studentNo: user.studentNo, name: user.name, role: user.role },
    memberships: membershipsOf(db, user),
  };
}

export function authRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  app.post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const { studentNo, password } = (body ?? {}) as Record<string, unknown>;
    if (typeof studentNo !== "string" || typeof password !== "string") {
      return jsonError(c, 400, "invalid-body");
    }
    const db = c.get("db");
    const user = db
      .prepare(
        "SELECT id, student_no AS studentNo, name, role, password_hash AS passwordHash FROM users WHERE student_no = ?",
      )
      .get(studentNo) as (SessionUser & { passwordHash: string }) | undefined;
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return jsonError(c, 401, "invalid-credentials");
    }
    const session = createSession(db, user.id);
    c.header("Set-Cookie", sessionCookieValue(session.id, session.expiresAt));
    return c.json(mePayload(db, user));
  });

  app.post("/logout", (c) => {
    const sessionId = c.get("sessionId");
    if (sessionId) destroySession(c.get("db"), sessionId);
    c.header("Set-Cookie", clearedSessionCookie());
    return c.json({ ok: true });
  });

  app.post("/change-password", async (c) => {
    const user = c.get("user");
    if (!user) return jsonError(c, 401, "unauthenticated");
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid-body");
    const { currentPassword, newPassword } = body as Record<string, unknown>;
    if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
      return jsonError(c, 400, "invalid-body");
    }
    if (newPassword.length < 4 || newPassword.length > 128) {
      return jsonError(c, 400, "weak-password");
    }
    if (currentPassword === newPassword) return jsonError(c, 400, "same-password");

    const account = c
      .get("db")
      .prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
      .get(user.id) as { passwordHash: string } | undefined;
    if (!account || !verifyPassword(currentPassword, account.passwordHash)) {
      return jsonError(c, 401, "current-password-incorrect");
    }

    c.get("db")
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .run(hashPassword(newPassword), user.id);
    return c.json({ ok: true });
  });

  app.get("/me", (c) => {
    const user = c.get("user");
    if (!user) return jsonError(c, 401, "unauthenticated");
    return c.json(mePayload(c.get("db"), user));
  });

  return app;
}
