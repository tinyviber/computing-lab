import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { fivePartsRoutes } from "./fiveParts.ts";

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
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/five-parts", fivePartsRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, app, cookieFor };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/five-parts${path}`;

describe("five-parts routes", () => {
  it("returns a fresh project for the member", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { labId: string; currentStage: number };
    expect(body.labId).toBe("five-parts");
    expect(body.currentStage).toBe(1);
  });

  it("requires auth", async () => {
    const { app, classId } = await setup();
    const res = await app.fetch(new Request(url(classId, "/project")));
    expect(res.status).toBe(401);
  });

  it("records the observation and unlocks the think stage", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 1, a: 3, b: 5 }),
      }),
    );
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; currentStage: number };
    expect(outcome.passed).toBe(true);
    expect(outcome.currentStage).toBe(2);
  });

  it("rejects out-of-range digits on stage 1", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 1, a: 30, b: 5 }),
      }),
    );
    expect(res.status).toBe(400);
  });

  it("gates stage 2, then judges the correct option only", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const locked = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 2, answer: "controller" }),
      }),
    );
    expect(locked.status).toBe(409);

    await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 1, a: 3, b: 5 }),
      }),
    );

    const wrong = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 2, answer: "memory" }),
      }),
    );
    const wrongOutcome = (await wrong.json()) as { passed: boolean; feedback: string };
    expect(wrongOutcome.passed).toBe(false);
    expect(wrongOutcome.feedback).toBe("再观察一下上一页：哪个部件向运算器发出了计算命令？");

    const right = await app.fetch(
      new Request(url(classId, "/judge"), {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 2, answer: "controller" }),
      }),
    );
    const outcome = (await right.json()) as { passed: boolean; passedStages: number[] };
    expect(outcome.passed).toBe(true);
    expect(outcome.passedStages).toEqual([1, 2]);
  });

  it("opens pages 3 and 4 after the observation and judges them server-side", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const judge = (body: Record<string, unknown>) =>
      app.fetch(
        new Request(url(classId, "/judge"), {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );

    expect((await judge({ stageIndex: 3, answer: "ram-cleared" })).status).toBe(409);
    await judge({ stageIndex: 1, a: 3, b: 5 });

    // Page 3 opens without answering page 2 — questions never gate each other.
    const wrong = (await (await judge({ stageIndex: 3, answer: "disk-full" })).json()) as {
      passed: boolean;
      stageIndex: number;
      feedback: string;
    };
    expect(wrong).toMatchObject({ passed: false, stageIndex: 3 });
    // Wrong-pick copy steers back to the experiment without naming the answer.
    expect(wrong.feedback).toContain("断电");
    expect(wrong.feedback).not.toContain("那句只在内存里");

    const storage = (await (await judge({ stageIndex: 3, answer: "ram-cleared" })).json()) as {
      passed: boolean;
      feedback: string;
    };
    expect(storage.passed).toBe(true);
    expect(storage.feedback).toMatch(/^正确/);

    const phone = (await (await judge({ stageIndex: 4, answer: "both" })).json()) as {
      passed: boolean;
      passedStages: number[];
    };
    expect(phone.passed).toBe(true);
    expect(phone.passedStages).toEqual([1, 3, 4]);
  });

  it("rejects option ids a page never offered instead of recording them", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const judge = (body: Record<string, unknown>) =>
      app.fetch(
        new Request(url(classId, "/judge"), {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
      );
    await judge({ stageIndex: 1, a: 3, b: 5 });
    // "controller" is a real option — but on page 2, not page 4.
    expect((await judge({ stageIndex: 4, answer: "controller" })).status).toBe(400);
    expect((await judge({ stageIndex: 4 })).status).toBe(400);
  });
});
