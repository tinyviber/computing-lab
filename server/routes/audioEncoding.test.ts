import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { audioEncodingRoutes } from "./audioEncoding.ts";

async function setup() {
  const db = openMemoryDb();
  const classId = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "实验班",
    "invite-1",
  );
  const studentId = newId();
  db.prepare(
    "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
  ).run(studentId, "stu-1", "stu-1", await hashPassword("pass"), "user");
  db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
    newId(),
    classId,
    studentId,
    "student",
  );
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/audio-encoding", audioEncodingRoutes());
  const cookie = `lab_session=${createSession(db, studentId).id}`;
  return { db, classId, studentId, app, cookie };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/audio-encoding${path}`;

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

const CORRECT_GUIDED = { meaning: 0, nyquist: 1, levels: 2, datarate: 0, alias: 1 };

describe("audio-encoding routes", () => {
  it("creates a project and saves a draft", async () => {
    const { app, classId, cookie } = await setup();
    const put = await app.fetch(
      new Request(url(classId, "/draft"), {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 2, draft: { sampleRate: 8000, bitDepth: 8 } }),
      }),
    );
    expect(put.status).toBe(200);
    const res = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await res.json()) as { drafts: Record<string, unknown> };
    expect(body.drafts["2"]).toMatchObject({ sampleRate: 8000, bitDepth: 8 });
  });

  it("passes stage 1 with all correct guided answers", async () => {
    const { app, classId, cookie } = await setup();
    const res = await judge(app, classId, cookie, {
      stageIndex: 1,
      guidedAnswers: CORRECT_GUIDED,
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; currentStage: number };
    expect(outcome.passed).toBe(true);
    expect(outcome.currentStage).toBe(2);
  });

  it("soft-fails stage 1 with a wrong guided answer", async () => {
    const { app, classId, cookie } = await setup();
    const res = await judge(app, classId, cookie, {
      stageIndex: 1,
      guidedAnswers: { ...CORRECT_GUIDED, nyquist: 0 },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; checks: { ok: boolean }[] };
    expect(outcome.passed).toBe(false);
    expect(outcome.checks.filter((c) => c.ok)).toHaveLength(4);
  });

  it("locks stage 2 until stage 1 is passed", async () => {
    const { app, classId, cookie } = await setup();
    const res = await judge(app, classId, cookie, {
      stageIndex: 2,
      params: { sampleRate: 16000, bitDepth: 8, channels: 1 },
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stage-locked" });
  });

  it("rejects invalid params with 400", async () => {
    const { app, classId, cookie } = await setup();
    await judge(app, classId, cookie, { stageIndex: 1, guidedAnswers: CORRECT_GUIDED });
    const res = await judge(app, classId, cookie, {
      stageIndex: 2,
      params: { sampleRate: "loud" },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid-params" });
  });

  it("passes stage 2 when the rate covers Nyquist and fits the budget", async () => {
    const { app, classId, cookie } = await setup();
    await judge(app, classId, cookie, { stageIndex: 1, guidedAnswers: CORRECT_GUIDED });
    const res = await judge(app, classId, cookie, {
      stageIndex: 2,
      params: { sampleRate: 16000, bitDepth: 8, channels: 1 },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      measured: { nyquistHz?: number };
      currentStage: number;
    };
    expect(outcome.passed).toBe(true);
    expect(outcome.measured.nyquistHz).toBe(8000);
    expect(outcome.currentStage).toBe(3);
  });

  it("fails stage 2 when the rate aliases the signal", async () => {
    const { app, classId, cookie } = await setup();
    await judge(app, classId, cookie, { stageIndex: 1, guidedAnswers: CORRECT_GUIDED });
    const res = await judge(app, classId, cookie, {
      stageIndex: 2,
      params: { sampleRate: 4000, bitDepth: 8, channels: 1 },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean };
    expect(outcome.passed).toBe(false);
  });
});
