import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createSession, SESSION_COOKIE } from "../auth/session.ts";
import { newId, openMemoryDb } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { imageEncodingRoutes } from "./image-encoding.ts";

function setup() {
  const db = openMemoryDb();
  const userId = newId();
  const classId = newId();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    userId,
    "20260101",
    "学生",
    "hash",
  );
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "高一信息技术",
    "IMG26",
  );
  db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
    newId(),
    classId,
    userId,
    "student",
  );
  const session = createSession(db, userId);
  const cookie = `${SESSION_COOKIE}=${session.id}`;
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/image-encoding", imageEncodingRoutes());
  return { app, classId, cookie };
}

function request(
  classId: string,
  path: string,
  cookie?: string,
  init?: { method: string; body?: unknown },
) {
  return new Request(`http://lab.test/api/classes/${classId}/labs/image-encoding${path}`, {
    method: init?.method,
    headers: {
      ...(cookie ? { cookie } : {}),
      ...(init?.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

describe("image encoding routes", () => {
  it("requires class membership", async () => {
    const { app, classId } = setup();
    const response = await app.fetch(request(classId, "/project"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "unauthenticated" });
  });

  it("loads a default project and saves a sanitized draft", async () => {
    const { app, classId, cookie } = setup();
    const project = await app.fetch(request(classId, "/project", cookie));
    expect(project.status).toBe(200);
    expect(await project.json()).toMatchObject({
      currentStage: 1,
      passedStages: [],
      artifact: { image: "photo", resStop: 50, colorStop: "palette4" },
    });

    const save = await app.fetch(
      request(classId, "/draft", cookie, {
        method: "PUT",
        body: {
          artifact: { image: "photo", resStop: 25, colorStop: "gray8" },
          draft: { core1Bits: "01bad", restoreObservation: "观察" },
        },
      }),
    );
    expect(save.status).toBe(200);
    expect(await save.json()).toMatchObject({
      ok: true,
      draft: {
        artifact: { image: "photo", resStop: 25, colorStop: "gray8" },
        core1Bits: "01",
        restoreObservation: "观察",
      },
    });
  });

  it("server-checks a submission and returns persisted progress", async () => {
    const { app, classId, cookie } = setup();
    const response = await app.fetch(
      request(classId, "/judge", cookie, {
        method: "POST",
        body: {
          stageIndex: 1,
          artifact: { image: "photo", resStop: 50, colorStop: "palette4" },
          evidence: { studentBits: "0111010101011001", passed: false },
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      passed: true,
      currentStage: 2,
      passedStages: [1],
    });

    const project = await app.fetch(request(classId, "/project", cookie));
    expect(await project.json()).toMatchObject({ currentStage: 2, passedStages: [1] });
  });

  it("rejects malformed route payloads", async () => {
    const { app, classId, cookie } = setup();
    const invalidDraft = await app.fetch(
      request(classId, "/draft", cookie, { method: "PUT", body: "bad" }),
    );
    expect(invalidDraft.status).toBe(400);
    expect(await invalidDraft.json()).toEqual({ error: "invalid-draft" });

    const invalidStage = await app.fetch(
      request(classId, "/judge", cookie, { method: "POST", body: { stageIndex: "x" } }),
    );
    expect(invalidStage.status).toBe(400);
    expect(await invalidStage.json()).toEqual({ error: "invalid-stage" });
  });
});
