import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { greenhouseRoutes } from "./greenhouse.ts";

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
  const adminId = await mkUser("adm-1", "admin", null);
  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/classes/:classId/labs/greenhouse", greenhouseRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, teacherId, adminId, app, cookieFor };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/greenhouse${path}`;

/** Stage-1 reference: a mid-range setpoint rides out every hidden weather. */
const SOLVED_S1 = { setpoint: 22 };

/** Calibrated wide dead band — the C2/C3 reference answer. */
const SOLVED_S23 = {
  rules: [
    {
      when: { kind: "leaf", sensor: "airTemp", op: "<=", value: 195 },
      actuator: "heater",
      set: "on",
    },
    {
      when: { kind: "leaf", sensor: "airTemp", op: ">=", value: 215 },
      actuator: "heater",
      set: "off",
    },
    { when: { kind: "leaf", sensor: "airTemp", op: ">=", value: 280 }, actuator: "fan", set: "on" },
    {
      when: { kind: "leaf", sensor: "airTemp", op: "<=", value: 245 },
      actuator: "fan",
      set: "off",
    },
  ],
};

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

describe("greenhouse routes", () => {
  it("creates a project", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      labId: "greenhouse",
      currentStage: 1,
      passedStages: [],
    });
  });

  it("admins reach the lab even without class membership", async () => {
    const { app, classId, adminId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(adminId) } }),
    );
    expect(res.status).toBe(200);
  });

  it("teachers are turned away (admin-preview gate)", async () => {
    const { app, classId, teacherId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(teacherId) } }),
    );
    expect(res.status).toBe(403);
  });

  it("saves a draft and reads it back sanitized", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const dirty = {
      setpoint: 99,
      rules: [
        // Threshold on the sensor's range bound — unreachable tautology.
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<", value: 600 },
          actuator: "fan",
          set: "on",
        },
        {
          when: { kind: "leaf", sensor: "light", op: ">", value: 300 },
          actuator: "sprinkler",
          set: "on",
        },
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">", value: 250 },
          actuator: "fan",
          set: "on",
        },
      ],
    };
    const unlocked = await app.fetch(
      new Request(url(classId, "/draft"), {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 1, draft: dirty }),
      }),
    );
    expect(unlocked.status).toBe(200);
    const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await project.json()) as {
      drafts: Record<string, { setpoint?: number; rules?: { when: { value: number } }[] }>;
    };
    const saved = body.drafts["1"];
    expect(saved.setpoint).toBe(28);
    // The 600-boundary row is dropped (open interval); light+sprinkler are
    // valid domain ids — stage palettes only apply inside the judge.
    expect(saved.rules).toHaveLength(2);
    expect(saved.rules?.map((r) => r.when.value)).toEqual([300, 250]);
  });

  it("judges the stage-1 setpoint draft end-to-end", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: SOLVED_S1,
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
      draft: SOLVED_S23,
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stage-locked" });
  });

  it("fails an edge setpoint with a replayable counterexample", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: { setpoint: 16 },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      testSummary: {
        categories: Record<string, { passed: number; total: number }>;
        counterexample: {
          name: string;
          firstViolation: { tick: number; metric: string };
          metrics: { scoredTicks: number };
          window: { t: number }[];
          scenario: { name: string; ticks: number; ambient: { t: number }[] };
        } | null;
      };
    };
    expect(outcome.passed).toBe(false);
    const counterexample = outcome.testSummary.counterexample;
    expect(counterexample).not.toBeNull();
    expect(counterexample!.firstViolation.tick).toBeGreaterThanOrEqual(0);
    expect(counterexample!.window.length).toBeGreaterThan(0);
    expect(counterexample!.scenario.ticks).toBe(96);
    expect(Object.keys(outcome.testSummary.categories).length).toBeGreaterThan(0);
  });

  it("rate-limits the 21st judge call within the window", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await judge(app, classId, cookie, { stageIndex: 1, draft: SOLVED_S1 });
      last = res.status;
    }
    expect(last).toBe(429);
    const res = await judge(app, classId, cookie, { stageIndex: 1, draft: {} });
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
