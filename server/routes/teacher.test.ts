import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { adminRoutes } from "./admin.ts";
import { authRoutes } from "./auth.ts";
import { calculatorRoutes } from "./calculator.ts";
import { dashboardRoutes } from "./dashboard.ts";
import { labsRoutes } from "./labs.ts";
import { teacherRoutes } from "./teacher.ts";

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
  const studentId = await seed("20260101", "张三", "user", "student-pass");
  const student2Id = await seed("20260102", "李四", "user", "student-pass");
  join(teacherId, "c1", "teacher");
  join(studentId, "c1", "student");
  join(student2Id, "c2", "student");

  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/auth", authRoutes());
  app.route("/api/admin", adminRoutes());
  app.route("/api/teacher", teacherRoutes());
  app.route("/api/classes/:classId/dashboard", dashboardRoutes());
  app.route("/api/classes/:classId/labs/calculator", calculatorRoutes());
  app.route("/api/labs", labsRoutes());
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

async function catalogVisible(
  app: Hono<{ Variables: AppVariables }>,
  cookie: string,
  labId = "calculator",
) {
  const response = await request(app, "GET", "/api/labs", undefined, cookie);
  const { labs } = (await response.json()) as { labs: { id: string; visible: boolean }[] };
  return labs.find((l) => l.id === labId)!.visible;
}

describe("teacher lab routes", () => {
  it("rejects anonymous and student callers", async () => {
    const { app } = await setup();
    expect((await request(app, "GET", "/api/teacher/labs", undefined)).status).toBe(401);
    const student = await login(app, "20260101", "student-pass");
    expect((await request(app, "GET", "/api/teacher/labs", undefined, student)).status).toBe(403);
    expect(
      (
        await request(
          app,
          "PUT",
          "/api/teacher/labs/calculator/classes/c1/open",
          { open: false },
          student,
        )
      ).status,
    ).toBe(403);
  });

  it("lists only the caller's classes with per-class gates", async () => {
    const { app } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");
    const response = await request(app, "GET", "/api/teacher/labs", undefined, teacher);
    expect(response.status).toBe(200);
    const { classes, labs } = (await response.json()) as {
      classes: { id: string; name: string }[];
      labs: {
        id: string;
        hidden: boolean;
        classes: { classId: string; adminAllowed: boolean; teacherOpen: boolean; open: boolean }[];
      }[];
    };
    expect(classes).toEqual([{ id: "c1", name: "一班" }]);
    const calc = labs.find((l) => l.id === "calculator")!;
    expect(calc.hidden).toBe(false);
    expect(calc.classes).toEqual([
      { classId: "c1", adminAllowed: true, teacherOpen: true, open: true },
    ]);
  });

  it("gates a class's students but not its teacher or other classes", async () => {
    const { app } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");
    const student = await login(app, "20260101", "student-pass");
    const student2 = await login(app, "20260102", "student-pass");

    const close = await request(
      app,
      "PUT",
      "/api/teacher/labs/calculator/classes/c1/open",
      { open: false },
      teacher,
    );
    expect(close.status).toBe(200);

    // c1's student is blocked at the lab API, in the catalog, and on the
    // class dashboard; the teacher and c2's student still get in.
    expect(
      (await request(app, "GET", "/api/classes/c1/labs/calculator/project", undefined, student))
        .status,
    ).toBe(403);
    expect(await catalogVisible(app, student)).toBe(false);
    expect(await catalogVisible(app, student2)).toBe(true);
    expect(
      (await request(app, "GET", "/api/classes/c1/labs/calculator/project", undefined, teacher))
        .status,
    ).toBe(200);
    expect(await catalogVisible(app, teacher)).toBe(true);
    expect(
      (await request(app, "GET", "/api/classes/c1/dashboard?lab=calculator", undefined, teacher))
        .status,
    ).toBe(403);

    // Reopening restores the class.
    const open = await request(
      app,
      "PUT",
      "/api/teacher/labs/calculator/classes/c1/open",
      { open: true },
      teacher,
    );
    expect(open.status).toBe(200);
    expect(
      (await request(app, "GET", "/api/classes/c1/labs/calculator/project", undefined, student))
        .status,
    ).toBe(200);
    expect(await catalogVisible(app, student)).toBe(true);
  });

  it("refuses classes the caller does not teach and unknown labs", async () => {
    const { app } = await setup();
    const teacher = await login(app, "teacher", "teacher-pass");
    expect(
      (
        await request(
          app,
          "PUT",
          "/api/teacher/labs/calculator/classes/c2/open",
          { open: false },
          teacher,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await request(
          app,
          "PUT",
          "/api/teacher/labs/nope/classes/c1/open",
          { open: false },
          teacher,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await request(
          app,
          "PUT",
          "/api/teacher/labs/calculator/classes/c1/open",
          { open: "yes" },
          teacher,
        )
      ).status,
    ).toBe(400);
  });

  it("stays under the admin ceiling: hidden and out-of-scope classes stay closed", async () => {
    const { app } = await setup();
    const admin = await login(app, "admin", "admin-pass");
    const teacher = await login(app, "teacher", "teacher-pass");

    // Scope calculator to c2 only — the teacher's c1 gate reports blocked.
    await request(
      app,
      "PUT",
      "/api/admin/labs/calculator/visibility",
      { hidden: false, openClassIds: ["c2"] },
      admin,
    );
    const scoped = await request(app, "GET", "/api/teacher/labs", undefined, teacher);
    const { labs: scopedLabs } = (await scoped.json()) as {
      labs: { id: string; classes: { classId: string; adminAllowed: boolean }[] }[];
    };
    expect(scopedLabs.find((l) => l.id === "calculator")!.classes).toEqual([
      { classId: "c1", adminAllowed: false, teacherOpen: true, open: false },
    ]);

    // The teacher can still store a switch for their own class, but the
    // admin scope keeps it closed for students either way.
    await request(
      app,
      "PUT",
      "/api/teacher/labs/calculator/classes/c1/open",
      { open: false },
      teacher,
    );
    const student = await login(app, "20260101", "student-pass");
    expect(await catalogVisible(app, student)).toBe(false);

    // Hidden blocks every gate outright.
    await request(
      app,
      "PUT",
      "/api/admin/labs/calculator/visibility",
      { hidden: true, openClassIds: null },
      admin,
    );
    const hidden = await request(app, "GET", "/api/teacher/labs", undefined, teacher);
    const { labs: hiddenLabs } = (await hidden.json()) as {
      labs: { id: string; classes: { classId: string; adminAllowed: boolean }[] }[];
    };
    expect(hiddenLabs.find((l) => l.id === "calculator")!.classes).toEqual([
      { classId: "c1", adminAllowed: false, teacherOpen: false, open: false },
    ]);
    // Admin is unaffected.
    expect(
      (await request(app, "GET", "/api/classes/c1/labs/calculator/project", undefined, admin))
        .status,
    ).toBe(200);
  });
});
