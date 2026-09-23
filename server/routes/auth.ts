import { Hono } from "hono";
import type { Context } from "hono";
import {
  MAX_PASSWORD_LENGTH,
  hashPassword,
  minPasswordLength,
  verifyPassword,
} from "../auth/password.ts";
import { SlidingWindowLimiter } from "../auth/rateLimit.ts";
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

/**
 * Whether this request reached us over HTTPS — directly or through the Caddy
 * reverse proxy (`X-Forwarded-Proto`). `LAB_SECURE_COOKIES=1` forces the flag
 * for deployments that terminate TLS further upstream.
 */
function secureRequest(c: Context<{ Variables: AppVariables }>): boolean {
  if (process.env.LAB_SECURE_COOKIES === "1") return true;
  if (new URL(c.req.url).protocol === "https:") return true;
  return c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

function clientIp(c: Context<{ Variables: AppVariables }>): string {
  const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || "local";
}

export function authRoutes() {
  const app = new Hono<{ Variables: AppVariables }>();
  // 10 failed attempts per 5 minutes per (ip, account) — in-memory only.
  const loginLimiter = new SlidingWindowLimiter(10, 5 * 60 * 1000);

  app.post("/login", async (c) => {
    const body = await c.req.json().catch(() => null);
    const { studentNo, password } = (body ?? {}) as Record<string, unknown>;
    if (typeof studentNo !== "string" || typeof password !== "string") {
      return jsonError(c, 400, "invalid-body");
    }
    const limitKey = `${clientIp(c)}|${studentNo}`;
    if (loginLimiter.exceeded(limitKey)) {
      return jsonError(c, 429, "too-many-attempts");
    }
    const db = c.get("db");
    const user = db
      .prepare(
        "SELECT id, student_no AS studentNo, name, role, password_hash AS passwordHash FROM users WHERE student_no = ?",
      )
      .get(studentNo) as (SessionUser & { passwordHash: string }) | undefined;
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      loginLimiter.hit(limitKey);
      return jsonError(c, 401, "invalid-credentials");
    }
    loginLimiter.reset(limitKey);
    const session = createSession(db, user.id);
    c.header("Set-Cookie", sessionCookieValue(session.id, session.expiresAt, secureRequest(c)));
    return c.json(mePayload(db, user));
  });

  app.post("/logout", (c) => {
    const sessionId = c.get("sessionId");
    if (sessionId) destroySession(c.get("db"), sessionId);
    c.header("Set-Cookie", clearedSessionCookie(secureRequest(c)));
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
    if (
      newPassword.length < minPasswordLength(user.role) ||
      newPassword.length > MAX_PASSWORD_LENGTH
    ) {
      return jsonError(c, 400, "weak-password");
    }
    if (currentPassword === newPassword) return jsonError(c, 400, "same-password");

    const account = c
      .get("db")
      .prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
      .get(user.id) as { passwordHash: string } | undefined;
    if (!account || !(await verifyPassword(currentPassword, account.passwordHash))) {
      return jsonError(c, 401, "current-password-incorrect");
    }

    c.get("db")
      .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
      .run(await hashPassword(newPassword), user.id);
    return c.json({ ok: true });
  });

  app.get("/me", (c) => {
    const user = c.get("user");
    if (!user) return jsonError(c, 401, "unauthenticated");
    return c.json(mePayload(c.get("db"), user));
  });

  return app;
}
