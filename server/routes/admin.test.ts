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

function request(
  app: Hono<{ Variables: AppVariables }>,
  method: string,
  path: string,
  body: unknown,
  cookie?: string,
) {
  return app.fetch(
    new Request(`http://lab.test${path}`, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
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

  it("deletes an empty class but refuses a class with members", async () => {
    const { db, app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const created = await post(app, "/api/admin/classes", { name: "空班级" }, cookie);
    const { class: empty } = (await created.json()) as { class: { id: string } };

    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), studentId);

    const refused = await request(app, "DELETE", "/api/admin/classes/c1", undefined, cookie);
    expect(refused.status).toBe(409);
    expect(await refused.json()).toEqual({ error: "class-not-empty" });

    const removed = await request(
      app,
      "DELETE",
      `/api/admin/classes/${empty.id}`,
      undefined,
      cookie,
    );
    expect(removed.status).toBe(200);
    expect(db.prepare("SELECT id FROM classes WHERE id = ?").get(empty.id)).toBeUndefined();
  });
});

describe("role editing", () => {
  it("promotes a user to teacher and syncs membership role", async () => {
    const { db, app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, 'c1', ?, 'student')",
    ).run(newId(), studentId);

    const response = await request(
      app,
      "PUT",
      `/api/admin/users/${studentId}/role`,
      { role: "teacher" },
      cookie,
    );
    expect(response.status).toBe(200);
    expect(db.prepare("SELECT role FROM users WHERE id = ?").get(studentId)).toEqual({
      role: "teacher",
    });
    expect(
      db
        .prepare("SELECT role FROM class_members WHERE class_id = 'c1' AND user_id = ?")
        .get(studentId),
    ).toEqual({ role: "teacher" });

    const dashboard = await app.fetch(
      new Request("http://lab.test/api/classes/c1/dashboard", {
        headers: { cookie: await login(app, "20260101", "student-pass") },
      }),
    );
    expect(dashboard.status).toBe(200);
  });

  it("refuses to set anyone's role to admin", async () => {
    const { db, app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    const response = await request(
      app,
      "PUT",
      `/api/admin/users/${studentId}/role`,
      { role: "admin" },
      cookie,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "admin-role-not-editable" });
  });

  it("refuses to edit the caller's own role", async () => {
    const { db, app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const adminId = (
      db.prepare("SELECT id FROM users WHERE student_no = 'admin'").get() as { id: string }
    ).id;
    const response = await request(
      app,
      "PUT",
      `/api/admin/users/${adminId}/role`,
      { role: "user" },
      cookie,
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "cannot-edit-own-role" });
  });
});

describe("member removal", () => {
  it("removes a member while other memberships survive", async () => {
    const { db, app } = setup();
    const cookie = await login(app, "admin", "admin-pass");
    const studentId = (
      db.prepare("SELECT id FROM users WHERE student_no = '20260101'").get() as { id: string }
    ).id;
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES ('c2', '二班', 'CLASS2')").run();
    for (const classId of ["c1", "c2"]) {
      db.prepare(
        "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
      ).run(newId(), classId, studentId);
    }

    const removed = await request(
      app,
      "DELETE",
      `/api/admin/classes/c1/members/${studentId}`,
      undefined,
      cookie,
    );
    expect(removed.status).toBe(200);
    const remaining = db
      .prepare("SELECT class_id AS classId FROM class_members WHERE user_id = ?")
      .all(studentId) as { classId: string }[];
    expect(remaining.map((row) => row.classId)).toEqual(["c2"]);

    const again = await request(
      app,
      "DELETE",
      `/api/admin/classes/c1/members/${studentId}`,
      undefined,
      cookie,
    );
    expect(again.status).toBe(404);
    expect(await again.json()).toEqual({ error: "membership-not-found" });
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
