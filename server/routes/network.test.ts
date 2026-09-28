import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { networkRoutes } from "./network.ts";
import { seedFor } from "../../src/features/network/domain/rng.ts";
import { netPlan, netPrefill, getNetStage } from "../../src/features/network/domain/stages.ts";
import type { NetTopology } from "../../src/features/network/domain/topology.ts";

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
  app.route("/api/classes/:classId/labs/network-sim", networkRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, teacherId, app, cookieFor };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/network-sim${path}`;

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

/** Stage-1 solved draft: both hosts inside the user's seeded subnet. */
function solvedS1(userId: string): NetTopology {
  const plan = netPlan(seedFor(userId, "network-sim", 1));
  const base = plan.lanA.slice(0, plan.lanA.indexOf("/")).split(".").slice(0, 3).join(".");
  const net = netPrefill(getNetStage(1)!, seedFor(userId, "network-sim", 1));
  for (const node of net.nodes) {
    node.ports = node.ports.map((p) => ({
      ...p,
      ip: `${base}.${node.id === "pc1" ? 11 : 12}`,
      mask: "/24",
    }));
  }
  return net;
}

describe("network-sim routes", () => {
  it("creates a project", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      labId: "network-sim",
      currentStage: 1,
      passedStages: [],
    });
  });

  it("turns non-admins away while the lab is hidden", async () => {
    const { db, app, classId, studentId, teacherId, cookieFor } = await setup();
    db.prepare("INSERT INTO lab_settings (lab_id, hidden) VALUES ('network-sim', 1)").run();
    for (const uid of [studentId, teacherId]) {
      const res = await app.fetch(
        new Request(url(classId, "/project"), { headers: { cookie: cookieFor(uid) } }),
      );
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ error: "lab-not-available" });
    }
  });

  it("saves a draft and reads it back sanitized", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const solved = solvedS1(studentId);
    const dirty = {
      nodes: [
        ...solved.nodes,
        { id: "bogus node!", kind: "router", label: "x", x: 9, y: -4, ports: [] },
        { id: "pc1", kind: "host", label: "重复id", x: 1, y: 1, ports: [] },
      ],
      links: [
        ...solved.links,
        { a: { node: "ghost", port: "p9" }, b: { node: "pc1", port: "eth0" } },
      ],
    };
    const put = await app.fetch(
      new Request(url(classId, "/draft"), {
        method: "PUT",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ stageIndex: 1, draft: dirty }),
      }),
    );
    expect(put.status).toBe(200);
    const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await project.json()) as { drafts: Record<string, NetTopology> };
    const saved = body.drafts["1"];
    expect(saved.nodes.map((n) => n.id)).toEqual(["pc1", "pc2"]);
    expect(saved.links).toHaveLength(1);
  });

  it("judges a solved stage-1 draft end-to-end", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: solvedS1(studentId),
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      score: number;
      total: number;
      currentStage: number;
      testSummary: { error?: string };
    };
    expect(outcome.testSummary.error).toBeUndefined();
    expect(outcome).toMatchObject({ passed: true, score: outcome.total, currentStage: 2 });
  });

  it("refuses a locked stage", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 4,
      draft: solvedS1(studentId),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stage-locked" });
  });

  it("fails a missing-address draft with a config error, not a crash", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: netPrefill(getNetStage(1)!, seedFor(studentId, "network-sim", 1)),
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      testSummary: { error?: string };
    };
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.error).toContain("需要配置");
  });

  it("fails a forged topology with a structural error", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const forged = solvedS1(studentId);
    forged.nodes.push({
      id: "pc9",
      label: "PC9",
      kind: "host",
      x: 3,
      y: 1,
      ports: [{ id: "eth0", ip: "9.9.9.9", mask: "/24" }],
    });
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: forged,
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean; testSummary: { error?: string } };
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.error).toContain("设备");
  });

  it("rate-limits the 21st judge call within the window", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const solved = solvedS1(studentId);
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await judge(app, classId, cookie, { stageIndex: 1, draft: solved });
      last = res.status;
    }
    expect(last).toBe(429);
    const res = await judge(app, classId, cookie, { stageIndex: 1, draft: {} });
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
