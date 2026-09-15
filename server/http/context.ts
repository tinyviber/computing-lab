import type { Context, Next } from "hono";
import type { DatabaseSync } from "node:sqlite";
import { SESSION_COOKIE, findSessionUser } from "../auth/session.ts";
import type { SessionUser } from "../auth/session.ts";

export type Membership = { classId: string; className: string; role: "student" | "teacher" };

export type AppVariables = {
  db: DatabaseSync;
  sessionId: string | null;
  user: SessionUser | null;
};

export function attachDb(db: DatabaseSync) {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    c.set("db", db);
    await next();
  };
}

export function attachSession() {
  return async (c: Context<{ Variables: AppVariables }>, next: Next) => {
    const header = c.req.header("cookie") ?? "";
    const match = header.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
    const sessionId = match ? decodeURIComponent(match[1]) : null;
    c.set("sessionId", sessionId);
    c.set("user", sessionId ? findSessionUser(c.get("db"), sessionId) : null);
    await next();
  };
}

export function membershipsOf(db: DatabaseSync, userId: string): Membership[] {
  return db
    .prepare(
      `SELECT m.class_id AS classId, c.name AS className, m.role
       FROM class_members m JOIN classes c ON c.id = m.class_id
       WHERE m.user_id = ?`,
    )
    .all(userId) as Membership[];
}

export function membershipOf(db: DatabaseSync, userId: string, classId: string): Membership | null {
  const row = db
    .prepare(
      `SELECT m.class_id AS classId, c.name AS className, m.role
       FROM class_members m JOIN classes c ON c.id = m.class_id
       WHERE m.user_id = ? AND m.class_id = ?`,
    )
    .get(userId, classId) as Membership | undefined;
  return row ?? null;
}

export function jsonError(c: Context, status: number, error: string) {
  return c.json({ error }, status as 400);
}

export type GuardFailure = { error: string; status: 401 | 403 };

/** Resolve the caller's membership in the `:classId` route param. */
export function requireMembership(
  c: Context<{ Variables: AppVariables }>,
  role?: "teacher",
): { user: SessionUser; membership: Membership } | GuardFailure {
  const user = c.get("user");
  if (!user) return { error: "unauthenticated", status: 401 };
  const classId = c.req.param("classId");
  const membership = classId ? membershipOf(c.get("db"), user.id, classId) : null;
  if (!membership) return { error: "not-a-member", status: 403 };
  if (role === "teacher" && membership.role !== "teacher") {
    return { error: "teacher-required", status: 403 };
  }
  return { user, membership };
}
