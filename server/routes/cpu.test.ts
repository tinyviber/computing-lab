import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { cpuRoutes } from "./cpu.ts";

async function setup() {
  const db = openMemoryDb();
  const classId = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "实验班",
    "invite-1",
  );
  const mkUser = async (no: string, role: string, memberRole: string | null) => {
    const id = newId();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(id, no, no, await hashPassword("pass"), role);
    if (memberRole) {
      db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
        newId(),
        classId,
        id,
        memberRole,
      );
    }
    return id;
  };
  const studentId = await mkUser("stu-1", "user", "student");
  const teacherId = await mkUser("tea-1", "teacher", "teacher");
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/cpu", cpuRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, teacherId, app, cookieFor };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/cpu${path}`;

const SOLVED_C1 = [
  { op: "LOAD", reg: 0, operand: 14 },
  { op: "STORE", reg: 0, operand: 15 },
  { op: "HALT", reg: 0, operand: 0 },
];

const judge = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  body: unknown,
) =>
  app.fetch(
    new Request(url(classId, "/judge"), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("cpu routes", () => {
  it("creates a project with the soft-gate flag down", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      labId: "cpu",
      currentStage: 1,
      passedStages: [],
      calculatorCoreComplete: false,
    });
  });

  it("raises the soft-gate flag once the calculator core is done", async () => {
    const { db, app, classId, studentId, cookieFor } = await setup();
    db.prepare(
      "INSERT INTO student_projects (id, user_id, class_id, lab_id, current_stage, passed_stages) VALUES (?, ?, ?, 'calculator', 7, ?)",
    ).run(newId(), studentId, classId, JSON.stringify([1, 2, 3, 4, 5, 6]));
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    const body = (await res.json()) as { calculatorCoreComplete: boolean };
    expect(body.calculatorCoreComplete).toBe(true);
  });

  it("teachers reach the lab (it is a real course lab)", async () => {
    const { app, classId, teacherId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(teacherId) } }),
    );
    expect(res.status).toBe(200);
  });

  it("saves a draft and reads it back sanitized", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const put = await app.fetch(
      new Request(url(classId, "/draft"), {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({
          stageIndex: 1,
          draft: { rows: [...SOLVED_C1, { op: "HAX", reg: 9, operand: 99 }] },
        }),
      }),
    );
    expect(put.status).toBe(200);
    const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await project.json()) as { drafts: Record<string, { rows: unknown[] }> };
    expect(body.drafts["1"].rows).toEqual(SOLVED_C1);
  });

  it("judges the stage-1 reference solution end-to-end", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: { rows: SOLVED_C1 },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      score: number;
      total: number;
      currentStage: number;
    };
    expect(outcome).toMatchObject({ passed: true, score: outcome.total, currentStage: 2 });
  });

  it("refuses a locked stage", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 3,
      draft: { rows: SOLVED_C1 },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stage-locked" });
  });

  it("fails an incomplete program without crashing", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: { rows: [{ op: "LOAD", reg: 0, operand: 14 }] },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; score: number };
    expect(outcome.passed).toBe(false);
    expect(outcome.score).toBe(0);
  });

  it("rate-limits the 21st judge call within the window", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await judge(app, classId, cookie, {
        stageIndex: 1,
        draft: { rows: SOLVED_C1 },
      });
      last = res.status;
    }
    expect(last).toBe(429);
    const res = await judge(app, classId, cookie, { stageIndex: 1, draft: {} });
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
