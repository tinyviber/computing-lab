import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { authRoutes } from "./auth.ts";
import { classMemberRoutes } from "./classMembers.ts";

async function setup() {
  const db = openMemoryDb();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    "c1",
    "一班",
    "CLASS26",
  );
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    "c2",
    "二班",
    "CLASS27",
  );
  const seed = async (studentNo: string, name: string, role: string, password = "pw") => {
    const id = newId();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(id, studentNo, name, await hashPassword(password), role);
    return id;
  };
  const join = (userId: string, classId: string, role: "student" | "teacher") =>
    db
      .prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)")
      .run(newId(), classId, userId, role);

  await seed("admin", "管理员", "admin", "admin-pass");
  const teacherId = await seed("teacher", "教师", "teacher", "teacher-pass");
  const otherTeacherId = await seed("teacher2", "别班教师", "teacher", "teacher-pass");
  const studentId = await seed("20260101", "张三", "user", "student-pass");
  const outsiderId = await seed("20260102", "李四", "user", "student-pass");
  join(teacherId, "c1", "teacher");
  join(otherTeacherId, "c2", "teacher");
  join(studentId, "c1", "student");

  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/auth", authRoutes());
  app.route("/api/classes/:classId/members", classMemberRoutes());
  return { db, app, ids: { teacherId, otherTeacherId, studentId, outsiderId } };
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

async function studentCount(db: ReturnType<typeof openMemoryDb>, classId: string) {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM class_members WHERE class_id = ? AND role = 'student'")
    .get(classId) as { n: number };
  return row.n;
}

describe("class member routes", () => {
  it("rejects anonymous callers, students, and teachers of other classes", async () => {
    const { app } = await setup();
    expect((await request(app, "GET", "/api/classes/c1/members", undefined)).status).toBe(401);

    const student = await login(app, "20260101", "student-pass");
    expect((await request(app, "GET", "/api/classes/c1/members", undefined, student)).status).toBe(
      403,
    );

    const otherTeacher = await login(app, "teacher2", "teacher-pass");
    expect(
      (await request(app, "GET", "/api/classes/c1/members", undefined, otherTeacher)).status,
    ).toBe(403);
    expect(
      (
        await request(
          app,
          "POST",
          "/api/classes/c1/members",
          { studentNo: "20260102" },
          otherTeacher,
        )
      ).status,
    ).toBe(403);
  });

  it("lists students and teachers of the caller's own class", async () => {
    const { app } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");
    const response = await request(app, "GET", "/api/classes/c1/members", undefined, teacher);
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      classId: string;
      className: string;
      students: { userId: string; studentNo: string; name: string }[];
      teachers: { studentNo: string; name: string }[];
    };
    expect(payload.classId).toBe("c1");
    expect(payload.className).toBe("一班");
    expect(payload.students).toHaveLength(1);
    expect(payload.students[0].studentNo).toBe("20260101");
    expect(payload.students[0].name).toBe("张三");
    expect(payload.teachers.map((t) => t.studentNo)).toEqual(["teacher"]);
  });

  it("enrolls an existing student account by student number", async () => {
    const { app, ids } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");

    const created = await request(
      app,
      "POST",
      "/api/classes/c1/members",
      { studentNo: "20260102" },
      teacher,
    );
    expect(created.status).toBe(201);
    const { member } = (await created.json()) as { member: { userId: string; name: string } };
    expect(member.userId).toBe(ids.outsiderId);
    expect(member.name).toBe("李四");

    expect(
      (await request(app, "POST", "/api/classes/c1/members", { studentNo: "20260102" }, teacher))
        .status,
    ).toBe(409);
    expect(
      (await request(app, "POST", "/api/classes/c1/members", { studentNo: "99999" }, teacher))
        .status,
    ).toBe(404);
    expect(
      (await request(app, "POST", "/api/classes/c1/members", { studentNo: "" }, teacher)).status,
    ).toBe(400);
  });

  it("refuses to seat staff accounts as students", async () => {
    const { app } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");
    expect(
      (await request(app, "POST", "/api/classes/c1/members", { studentNo: "teacher2" }, teacher))
        .status,
    ).toBe(400);
    expect(
      (await request(app, "POST", "/api/classes/c1/members", { studentNo: "admin" }, teacher))
        .status,
    ).toBe(400);
    // Even the caller's own teacher account cannot become a student row.
    expect(
      (await request(app, "POST", "/api/classes/c1/members", { studentNo: "teacher" }, teacher))
        .status,
    ).toBe(400);
  });

  it("creates a student account seated in the class in one request", async () => {
    const { db, app } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");

    const created = await request(
      app,
      "POST",
      "/api/classes/c1/members/students",
      { studentNo: "20260103", name: "王五", password: "pw1234" },
      teacher,
    );
    expect(created.status).toBe(201);
    const { member } = (await created.json()) as { member: { userId: string } };
    const row = db.prepare("SELECT role FROM users WHERE id = ?").get(member.userId) as {
      role: string;
    };
    expect(row.role).toBe("user");
    expect(await studentCount(db, "c1")).toBe(2);

    // The new account can sign in immediately.
    expect(await login(app, "20260103", "pw1234")).toBeTruthy();

    expect(
      (
        await request(
          app,
          "POST",
          "/api/classes/c1/members/students",
          { studentNo: "20260103", name: "重复", password: "pw1234" },
          teacher,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await request(
          app,
          "POST",
          "/api/classes/c1/members/students",
          { studentNo: "bad no!", name: "坏学号", password: "pw1234" },
          teacher,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          app,
          "POST",
          "/api/classes/c1/members/students",
          { studentNo: "20260104", name: "短密码", password: "123" },
          teacher,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          app,
          "POST",
          "/api/classes/c1/members/students",
          { studentNo: "20260105", name: "  ", password: "pw1234" },
          teacher,
        )
      ).status,
    ).toBe(400);
  });

  it("renames a student member", async () => {
    const { app, ids } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");
    const renamed = await request(
      app,
      "PATCH",
      `/api/classes/c1/members/${ids.studentId}`,
      { name: "张三丰" },
      teacher,
    );
    expect(renamed.status).toBe(200);
    expect(((await renamed.json()) as { member: { name: string } }).member.name).toBe("张三丰");

    expect(
      (
        await request(
          app,
          "PATCH",
          `/api/classes/c1/members/${ids.studentId}`,
          { name: "" },
          teacher,
        )
      ).status,
    ).toBe(400);
    expect(
      (await request(app, "PATCH", "/api/classes/c1/members/nobody", { name: "谁" }, teacher))
        .status,
    ).toBe(404);
    // Teacher members are out of scope.
    expect(
      (
        await request(
          app,
          "PATCH",
          `/api/classes/c1/members/${ids.teacherId}`,
          { name: "改名" },
          teacher,
        )
      ).status,
    ).toBe(403);
  });

  it("resets a student member's password and kills their sessions", async () => {
    const { db, app, ids } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");
    const student = await login(app, "20260101", "student-pass");

    const reset = await request(
      app,
      "PUT",
      `/api/classes/c1/members/${ids.studentId}/password`,
      { password: "new-pass-1" },
      teacher,
    );
    expect(reset.status).toBe(200);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE user_id = ?").get(ids.studentId),
    ).toEqual({ n: 0 });
    // The old cookie is dead; the new password logs in.
    expect((await request(app, "GET", "/api/auth/me", undefined, student)).status).toBe(401);
    expect(await login(app, "20260101", "new-pass-1")).toBeTruthy();

    expect(
      (
        await request(
          app,
          "PUT",
          `/api/classes/c1/members/${ids.studentId}/password`,
          { password: "12" },
          teacher,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await request(
          app,
          "PUT",
          `/api/classes/c1/members/${ids.teacherId}/password`,
          { password: "whatever-1" },
          teacher,
        )
      ).status,
    ).toBe(403);
  });

  it("removes a student member but never a teacher member", async () => {
    const { db, app, ids } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");

    expect(
      (await request(app, "DELETE", `/api/classes/c1/members/${ids.teacherId}`, undefined, teacher))
        .status,
    ).toBe(403);

    const removed = await request(
      app,
      "DELETE",
      `/api/classes/c1/members/${ids.studentId}`,
      undefined,
      teacher,
    );
    expect(removed.status).toBe(200);
    expect(await studentCount(db, "c1")).toBe(0);
    // The account itself survives — only this class's seat went away.
    expect(db.prepare("SELECT id FROM users WHERE id = ?").get(ids.studentId)).toBeTruthy();

    expect(
      (await request(app, "DELETE", `/api/classes/c1/members/${ids.studentId}`, undefined, teacher))
        .status,
    ).toBe(404);
  });

  it("accepts admin callers as teacher-equivalent on any class", async () => {
    const { app } = await setup();
    const admin = await login(app, "admin", "admin-pass");
    const response = await request(app, "GET", "/api/classes/c2/members", undefined, admin);
    expect(response.status).toBe(200);
    const { students } = (await response.json()) as { students: unknown[] };
    expect(students).toHaveLength(0);
  });
});
