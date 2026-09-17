import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword, verifyPassword } from "../auth/password.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { adminRoutes } from "./admin.ts";
import { authRoutes } from "./auth.ts";
import { dashboardRoutes } from "./dashboard.ts";

function setup() {
  const db = openMemoryDb();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    "c1",
    "测试班级",
    "CLASS26",
  );
  const seed = (studentNo: string, name: string, role: string, password = "pw") => {
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(newId(), studentNo, name, hashPassword(password), role);
  };
  seed("admin", "管理员", "admin", "admin-pass");
  seed("teacher", "教师", "teacher", "teacher-pass");
  seed("20260101", "张三", "user", "student-pass");

  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/auth", authRoutes());
  app.route("/api/admin", adminRoutes());
  app.route("/api/classes/:classId/dashboard", dashboardRoutes());
  return { db, app };
}

async function login(app: Hono<{ Variables: AppVariables }>, studentNo: string, password: string) {
  const response = await app.fetch(
    new Request("http://lab.test/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ studentNo, password }),
    }),
  );
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!.split(";", 1)[0];
}

function post(
  app: Hono<{ Variables: AppVariables }>,
  path: string,
  body: unknown,
  cookie?: string,
) {
  return app.fetch(
    new Request(`http://lab.test${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: JSON.stringify(body),
    }),
  );
}

describe("admin guard", () => {
  it("rejects anonymous, student, and teacher callers", async () => {
    const { app } = setup();
    const anonymous = await post(app, "/api/admin/users", {});
    expect(anonymous.status).toBe(401);

    const student = await post(
      app,
      "/api/admin/users",
      {},
      await login(app, "20260101", "student-pass"),
    );
    expect(student.status).toBe(403);
    expect(await student.json()).toEqual({ error: "admin-required" });

    const teacher = await post(
      app,
      "/api/admin/users",
      {},
      await login(app, "teacher", "teacher-pass"),
    );
    expect(teacher.status).toBe(403);
  });
});

describe("single account creation", () => {
  it("creates a student account that can log in", async () => {
    const { db, app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await post(
      app,
      "/api/admin/users",
      { studentNo: "20260102", name: "李四", password: "pw-1234", classId: "c1" },
      cookie,
    );
    expect(response.status).toBe(201);
    const row = db
      .prepare("SELECT role, password_hash AS passwordHash FROM users WHERE student_no = ?")
      .get("20260102") as { role: string; passwordHash: string };
    expect(row.role).toBe("user");
    expect(verifyPassword("pw-1234", row.passwordHash)).toBe(true);
    const member = db
      .prepare(
        `SELECT m.role FROM class_members m JOIN users u ON u.id = m.user_id
         WHERE u.student_no = ? AND m.class_id = 'c1'`,
      )
      .get("20260102") as { role: string };
    expect(member.role).toBe("student");

    const loginResponse = await app.fetch(
      new Request("http://lab.test/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ studentNo: "20260102", password: "pw-1234" }),
      }),
    );
    expect(loginResponse.status).toBe(200);
  });

  it("rejects a duplicate student number with 409", async () => {
    const { app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await post(
      app,
      "/api/admin/users",
      { studentNo: "20260101", name: "重复", password: "pw-1234" },
      cookie,
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "student-no-taken" });
  });
});

describe("batch import", () => {
  it("imports CSV rows, assigns classes, and reports per-row failures", async () => {
    const { db, app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const csv = [
      "学号,姓名,密码,角色,班级邀请码",
      "20260110,王五,pw-a,学生,CLASS26",
      "t1001,赵老师,pw-b,教师,CLASS26",
      "20260101,重复学号,pw-c",
      "bad no,坏学号,pw-d",
      "20260111,无班级,pw-e,,NOPE",
    ].join("\n");
    const response = await post(app, "/api/admin/users/import", { csv }, cookie);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      created: number;
      exists: number;
      failed: number;
      rows: { line: number; studentNo: string; status: string; error?: string }[];
    };
    expect(payload.created).toBe(2);
    expect(payload.exists).toBe(1);
    expect(payload.failed).toBe(2);

    const teacherRow = db
      .prepare(
        `SELECT u.role, m.role AS memberRole FROM users u
         JOIN class_members m ON m.user_id = u.id WHERE u.student_no = 't1001'`,
      )
      .get() as { role: string; memberRole: string };
    expect(teacherRow).toEqual({ role: "teacher", memberRole: "teacher" });

    const missing = payload.rows.find((row) => row.studentNo === "20260111");
    expect(missing?.status).toBe("error");
    expect(missing?.error).toBe("class-not-found");
  });

  it("imports a JSON users array", async () => {
    const { db, app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await post(
      app,
      "/api/admin/users/import",
      { users: [{ studentNo: "20260120", name: "JSON 学生", password: "pw-json" }] },
      cookie,
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { created: number };
    expect(payload.created).toBe(1);
    expect(db.prepare("SELECT role FROM users WHERE student_no = '20260120'").get()).toEqual({
      role: "user",
    });
  });
});

describe("class management", () => {
  it("creates a class and lists it with its invite code", async () => {
    const { app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const created = await post(app, "/api/admin/classes", { name: "2026-新班" }, cookie);
    expect(created.status).toBe(201);
    const { class: klass } = (await created.json()) as { class: { inviteCode: string } };
    expect(klass.inviteCode).toMatch(/^[A-Z0-9]{8}$/);

    const list = await app.fetch(
      new Request("http://lab.test/api/admin/classes", { headers: { cookie } }),
    );
    const { classes } = (await list.json()) as {
      classes: { name: string; inviteCode: string }[];
    };
    expect(classes.map((c) => c.name)).toContain("2026-新班");
  });
});

describe("admin teacher access", () => {
  it("lets an admin read a class dashboard without a membership row", async () => {
    const { app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const response = await app.fetch(
      new Request("http://lab.test/api/classes/c1/dashboard", { headers: { cookie } }),
    );
    expect(response.status).toBe(200);
  });

  it("denies dashboard access to a student member", async () => {
    const { db, app } = setup();
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as {
        id: string;
      }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
    ).run(newId(), "c1", studentId);
    const cookie = await login(app, "20260101", "student-pass");
    const response = await app.fetch(
      new Request("http://lab.test/api/classes/c1/dashboard", { headers: { cookie } }),
    );
    expect(response.status).toBe(403);
  });
});
