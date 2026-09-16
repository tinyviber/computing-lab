import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { authRoutes } from "./auth.ts";

function setup() {
  const db = openMemoryDb();
  const userId = newId();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    userId,
    "20260101",
    "张三",
    hashPassword("old-pass"),
  );
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/auth", authRoutes());
  return { db, userId, app };
}

async function login(app: Hono<{ Variables: AppVariables }>) {
  const response = await app.fetch(
    new Request("http://lab.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentNo: "20260101", password: "old-pass" }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

describe("password changes", () => {
  it("requires an authenticated session", async () => {
    const { app } = setup();
    const response = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("rejects the wrong current password and preserves the account", async () => {
    const { app, db, userId } = setup();
    const cookie = await login(app);
    const response = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "not-old", newPassword: "new-pass" }),
      }),
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "current-password-incorrect" });
    const row = db
      .prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
      .get(userId) as { passwordHash: string };
    expect(verifyPassword("old-pass", row.passwordHash)).toBe(true);
  });

  it("updates the password while keeping the current session valid", async () => {
    const { app, db, userId } = setup();
    const cookie = await login(app);
    const response = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "new-pass" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });

    const row = db
      .prepare("SELECT password_hash AS passwordHash FROM users WHERE id = ?")
      .get(userId) as { passwordHash: string };
    expect(verifyPassword("old-pass", row.passwordHash)).toBe(false);
    expect(verifyPassword("new-pass", row.passwordHash)).toBe(true);

    const me = await app.fetch(new Request("http://lab.test/api/auth/me", { headers: { cookie } }));
    expect(me.status).toBe(200);
  });

  it("rejects a repeated password and weak new password", async () => {
    const { app } = setup();
    const cookie = await login(app);
    const same = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "old-pass" }),
      }),
    );
    expect(same.status).toBe(400);
    expect(await same.json()).toEqual({ error: "same-password" });

    const weak = await app.fetch(
      new Request("http://lab.test/api/auth/change-password", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ currentPassword: "old-pass", newPassword: "123" }),
      }),
    );
    expect(weak.status).toBe(400);
    expect(await weak.json()).toEqual({ error: "weak-password" });
  });
});
