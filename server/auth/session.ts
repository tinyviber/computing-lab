import type { DatabaseSync } from "node:sqlite";
import { newId } from "../db/client.ts";

export const SESSION_COOKIE = "lab_session";
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export type SessionUser = {
  id: string;
  studentNo: string;
  name: string;
};

export function createSession(db: DatabaseSync, userId: string): { id: string; expiresAt: Date } {
  const id = newId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  db.prepare("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)").run(
    id,
    userId,
    expiresAt.toISOString(),
  );
  return { id, expiresAt };
}

export function findSessionUser(db: DatabaseSync, sessionId: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.student_no AS studentNo, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
    .get(sessionId, new Date().toISOString()) as SessionUser | undefined;
  return row ?? null;
}

export function destroySession(db: DatabaseSync, sessionId: string): void {
  db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
}

export function sessionCookieValue(sessionId: string, expiresAt: Date): string {
  return `${SESSION_COOKIE}=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
}
