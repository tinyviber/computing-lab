import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import {
  createSession,
  destroySession,
  sessionCookieValue,
  clearedSessionCookie,
} from "../auth/session.ts";
import { newId } from "../db/client.ts";
import { jsonError, membershipsOf, type AppVariables } from "../http/context.ts";

const STUDENT_NO = /^[A-Za-z0-9_-]{2,32}$/;

function mePayload(
  db: Parameters<typeof membershipsOf>[0],
  user: { id: string; studentNo: string; name: string },
) {
  return {
    user: { id: user.id, studentNo: user.studentNo, name: user.name },
    memberships: membershipsOf(db, user.id),
  };
}

export function authRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();

  // Join a class: invite code + student number + name + password.
  // Creates the account (first time) or re-binds an existing account to the class.
  app.post("/join", async (c) => {
    const body = await c.req.json().catch(() => null);
    if (!body || typeof body !== "object") return jsonError(c, 400, "invalid-body");
    const { inviteCode, studentNo, name, password } = body as Record<string, unknown>;
    if (
      typeof inviteCode !== "string" ||
      typeof studentNo !== "string" ||
      typeof name !== "string" ||
      typeof password !== "string"
    ) {
      return jsonError(c, 400, "invalid-body");
    }
    if (!STUDENT_NO.test(studentNo)) return jsonError(c, 400, "invalid-student-no");
    if (name.trim().length === 0 || name.length > 64) return jsonError(c, 400, "invalid-name");
    if (password.length < 4 || password.length > 128) return jsonError(c, 400, "weak-password");

    const db = c.get("db");
    const klass = db
      .prepare("SELECT id, name FROM classes WHERE invite_code = ?")
      .get(inviteCode.trim()) as { id: string; name: string } | undefined;
    if (!klass) return jsonError(c, 404, "invite-code-not-found");

    let user = db
      .prepare(
        "SELECT id, student_no AS studentNo, name, password_hash AS passwordHash FROM users WHERE student_no = ?",
      )
      .get(studentNo) as
      { id: string; studentNo: string; name: string; passwordHash: string } | undefined;

    if (user) {
      // Existing account: verify password and real name before adding membership.
      if (!verifyPassword(password, user.passwordHash)) return jsonError(c, 401, "wrong-password");
      const existing = db
        .prepare("SELECT id FROM class_members WHERE class_id = ? AND user_id = ?")
        .get(klass.id, user.id);
      if (!existing) {
        db.prepare(
          "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
        ).run(newId(), klass.id, user.id);
      }
    } else {
      const userId = newId();
      db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
        userId,
        studentNo,
        name.trim(),
        hashPassword(password),
      );
      db.prepare(
        "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
      ).run(newId(), klass.id, userId);
      user = { id: userId, studentNo, name: name.trim(), passwordHash: "" };
    }

    const session = createSession(db, user.id);
    c.header("Set-Cookie", sessionCookieValue(session.id, session.expiresAt));
    return c.json(mePayload(db, user));
  });

  app.post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const { studentNo, password } = (body ?? {}) as Record<string, unknown>;
    if (typeof studentNo !== "string" || typeof password !== "string") {
      return jsonError(c, 400, "invalid-body");
    }
    const db = c.get("db");
    const user = db
      .prepare(
        "SELECT id, student_no AS studentNo, name, password_hash AS passwordHash FROM users WHERE student_no = ?",
      )
      .get(studentNo) as
      { id: string; studentNo: string; name: string; passwordHash: string } | undefined;
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
