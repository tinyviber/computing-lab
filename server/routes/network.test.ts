import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { netReferenceFor } from "../../src/features/network/domain/fixtures.ts";
import { seedFor } from "../../src/features/network/domain/rng.ts";
import { networkRoutes } from "./network.ts";

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
  app.route("/api/classes/:classId/labs/network", networkRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  const seed = (stage: number) => seedFor(studentId, "network", stage);
  return { db, classId, studentId, teacherId, app, cookieFor, seed };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/network${path}`;

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

describe("network routes", () => {
  it("creates a project", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      labId: "network",
      currentStage: 1,
      passedStages: [],
    });
  });

  it("teachers reach the lab", async () => {
    const { app, classId, teacherId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(teacherId) } }),
    );
    expect(res.status).toBe(200);
  });

  it("judges the stage-1 reference topology end-to-end", async () => {
    const { app, classId, studentId, cookieFor, seed } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: netReferenceFor(1, seed(1)),
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
    const { app, classId, studentId, cookieFor, seed } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 3,
      draft: netReferenceFor(3, seed(3)),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stage-locked" });
  });

  it("restores non-editable fields before judging (tampered addresses still pass)", async () => {
    const { app, classId, studentId, cookieFor, seed } = await setup();
    const cookie = cookieFor(studentId);
    // Unlock stage 2.
    await judge(app, classId, cookie, { stageIndex: 1, draft: netReferenceFor(1, seed(1)) });

    // Stage 2 opens wiring but not addresses: submit the reference
    // topology with PC1's prefilled address overwritten. The contract
    // must restore the prefill value so hidden cases still pass.
    const tampered = structuredClone(netReferenceFor(2, seed(2)));
    const pc1 = tampered.nodes.find((n) => n.id === "PC1")!;
    pc1.addresses.eth0 = { ip: "203.0.113.66", prefix: 24 };
    const res = await judge(app, classId, cookie, { stageIndex: 2, draft: tampered });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; score: number; total: number };
    expect(outcome).toMatchObject({ passed: true, score: outcome.total });
  });

  it("fails a structurally broken draft fast with a Chinese issue list", async () => {
    const { app, classId, studentId, cookieFor, seed } = await setup();
    const broken = structuredClone(netReferenceFor(1, seed(1)));
    // Two hosts on the same IP survives sanitize and is a contract issue.
    broken.nodes[1]!.addresses.eth0 = { ...broken.nodes[0]!.addresses.eth0 };
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: broken,
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      testSummary: { error: string | null; categories: Record<string, unknown> };
    };
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.error).toContain("撞了同一个 IP");
  });

  it("rate-limits the 21st judge call within the window", async () => {
    const { app, classId, studentId, cookieFor, seed } = await setup();
    const cookie = cookieFor(studentId);
    const draft = netReferenceFor(1, seed(1));
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await judge(app, classId, cookie, { stageIndex: 1, draft });
      last = res.status;
    }
    expect(last).toBe(429);
    const res = await judge(app, classId, cookie, { stageIndex: 1, draft: {} });
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
