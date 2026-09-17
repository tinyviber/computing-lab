import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createSession, SESSION_COOKIE } from "../auth/session.ts";
import { newId, openMemoryDb } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { judgeImageSubmission, getOrCreateImageProject } from "../judge/image.ts";
import { dashboardRoutes } from "./dashboard.ts";

function setup() {
  const db = openMemoryDb();
  const teacherId = newId();
  const studentId = newId();
  const classId = newId();
  for (const [id, no, name, role] of [
    [teacherId, "t1", "老师", "teacher"],
    [studentId, "s1", "学生", "user"],
  ] as const) {
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(id, no, name, "hash", role);
  }
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "高一信息技术",
    "IMG26",
  );
  for (const [userId, role] of [
    [teacherId, "teacher"],
    [studentId, "student"],
  ] as const) {
    db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
      newId(),
      classId,
      userId,
      role,
    );
  }
  const session = createSession(db, teacherId);
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/dashboard", dashboardRoutes());
  return { app, db, classId, studentId, cookie: `${SESSION_COOKIE}=${session.id}` };
}

function request(classId: string, path: string, cookie?: string) {
  return new Request(`http://lab.test/api/classes/${classId}/dashboard${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("dashboard routes", () => {
  it("requires teacher membership", async () => {
    const { app, classId } = setup();
    const response = await app.fetch(request(classId, ""));
    expect(response.status).toBe(401);
  });

  it("defaults to the calculator lab and rejects unknown labs", async () => {
    const { app, classId, cookie } = setup();
    const fallback = await app.fetch(request(classId, "", cookie));
    expect(fallback.status).toBe(200);
    expect(await fallback.json()).toMatchObject({ labId: "calculator" });

    const unknown = await app.fetch(request(classId, "?lab=bogus", cookie));
    expect(unknown.status).toBe(400);
    expect(await unknown.json()).toEqual({ error: "unknown-lab" });
  });

  it("reports image-encoding progress for the class students", async () => {
    const { app, db, classId, studentId, cookie } = setup();
    const project = getOrCreateImageProject(db, studentId, classId);
    judgeImageSubmission(db, project, 1, project.artifact, {
      studentBits: "0111010101011001",
    });

    const response = await app.fetch(request(classId, "?lab=image-encoding", cookie));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      labId: string;
      rows: { studentNo: string; currentStage: number; cells: Record<string, unknown> }[];
    };
    expect(payload.labId).toBe("image-encoding");
    const row = payload.rows.find((entry) => entry.studentNo === "s1");
    expect(row?.currentStage).toBe(2);
    expect(row?.cells["1"]).toMatchObject({ passed: true });
  });
});
