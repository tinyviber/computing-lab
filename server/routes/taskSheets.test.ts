import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { taskSheetRoutes } from "./taskSheets.ts";
import { taskAssignmentRoutes } from "./taskAssignments.ts";

const FILL_Q = {
  id: "q1",
  type: "fill",
  prompt: "1 字节等于 ${} 位？8 位也叫 ${}？",
  required: true,
  score: 4,
  blanks: [
    { id: "b1", accept: ["8", "八"] },
    { id: "b2", accept: ["byte", "字节"] },
  ],
};
const CHOICE_Q = {
  id: "q2",
  type: "choice",
  prompt: "哪些是进制？",
  required: true,
  score: 4,
  multiple: true,
  partialCredit: true,
  options: [
    { id: "o1", text: "二进制" },
    { id: "o2", text: "十进制" },
    { id: "o3", text: "十六进制" },
    { id: "o4", text: "二十六进制" },
  ],
  correctOptionIds: ["o1", "o2", "o3"],
};
const SHORT_Q = {
  id: "q3",
  type: "short",
  prompt: "用自己的话解释什么是量化。",
  required: true,
  maxScore: 12,
  referenceAnswer: "把连续取值映射到有限离散值",
};
const SCHEMA = { version: 1, questions: [FILL_Q, CHOICE_Q, SHORT_Q] };

async function setup() {
  const db = openMemoryDb();
  const classId = newId();
  const otherClassId = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "实验班",
    "invite-1",
  );
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    otherClassId,
    "隔壁班",
    "invite-2",
  );
  const mkUser = async (no: string, role: string, member: [string, string][]) => {
    const id = newId();
    db.prepare(
      "INSERT INTO users (id, student_no, name, password_hash, role) VALUES (?, ?, ?, ?, ?)",
    ).run(id, no, no, await hashPassword("pass"), role);
    for (const [cid, mrole] of member) {
      db.prepare("INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, ?)").run(
        newId(),
        cid,
        id,
        mrole,
      );
    }
    return id;
  };
  const studentId = await mkUser("stu-1", "user", [[classId, "student"]]);
  const student2Id = await mkUser("stu-2", "user", [[classId, "student"]]);
  const teacherId = await mkUser("tea-1", "teacher", [[classId, "teacher"]]);
  const teacher2Id = await mkUser("tea-2", "teacher", [
    [classId, "teacher"],
    [otherClassId, "teacher"],
  ]);
  const adminId = await mkUser("adm-1", "admin", []);

  const app = new Hono<{ Variables: AppVariables }>();
  app.use("/api/*", attachDb(db), attachSession());
  app.route("/api/task-sheets", taskSheetRoutes());
  app.route("/api/classes/:classId/task-assignments", taskAssignmentRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;

  const createSheet = async (userId: string, schema = SCHEMA) => {
    const res = await app.fetch(
      new Request("http://lab.test/api/task-sheets", {
        method: "POST",
        headers: { cookie: cookieFor(userId), "content-type": "application/json" },
        body: JSON.stringify({ title: "第一章任务单" }),
      }),
    );
    const { sheet } = (await res.json()) as { sheet: { id: string } };
    await app.fetch(
      new Request(`http://lab.test/api/task-sheets/${sheet.id}`, {
        method: "PATCH",
        headers: { cookie: cookieFor(userId), "content-type": "application/json" },
        body: JSON.stringify({ schema }),
      }),
    );
    return sheet.id;
  };

  const assign = async (userId: string, cid: string, sheetId: string, extra = {}) => {
    const res = await app.fetch(
      new Request(`http://lab.test/api/classes/${cid}/task-assignments`, {
        method: "POST",
        headers: { cookie: cookieFor(userId), "content-type": "application/json" },
        body: JSON.stringify({ sheetId, ...extra }),
      }),
    );
    return res;
  };

  return {
    db,
    classId,
    otherClassId,
    studentId,
    student2Id,
    teacherId,
    teacher2Id,
    adminId,
    app,
    cookieFor,
    createSheet,
    assign,
  };
}

const sheetsUrl = (path = "") => `http://lab.test/api/task-sheets${path}`;
const assignUrl = (classId: string, path = "") =>
  `http://lab.test/api/classes/${classId}/task-assignments${path}`;

describe("task-sheet CRUD and ownership", () => {
  it("creates, reads, updates a sheet as owner", async () => {
    const { app, teacherId, cookieFor } = await setup();
    const created = await app.fetch(
      new Request(sheetsUrl(), {
        method: "POST",
        headers: { cookie: cookieFor(teacherId), "content-type": "application/json" },
        body: JSON.stringify({ title: "数制转换练习", description: "课后巩固" }),
      }),
    );
    expect(created.status).toBe(201);
    const { sheet } = (await created.json()) as { sheet: { id: string; status: string } };
    expect(sheet.status).toBe("draft");

    const patched = await app.fetch(
      new Request(sheetsUrl(`/${sheet.id}`), {
        method: "PATCH",
        headers: { cookie: cookieFor(teacherId), "content-type": "application/json" },
        body: JSON.stringify({ schema: SCHEMA, status: "published" }),
      }),
    );
    expect(patched.status).toBe(200);
    const { sheet: updated } = (await patched.json()) as {
      sheet: { schema: { questions: unknown[] }; status: string };
    };
    expect(updated.status).toBe("published");
    expect(updated.schema.questions).toHaveLength(3);
  });

  it("isolates sheets between teacher accounts", async () => {
    const { app, teacherId, teacher2Id, cookieFor, createSheet } = await setup();
    const sheetId = await createSheet(teacherId);

    const list = await app.fetch(
      new Request(sheetsUrl(), { headers: { cookie: cookieFor(teacher2Id) } }),
    );
    const { sheets } = (await list.json()) as { sheets: { id: string }[] };
    expect(sheets.map((s) => s.id)).not.toContain(sheetId);

    const detail = await app.fetch(
      new Request(sheetsUrl(`/${sheetId}`), { headers: { cookie: cookieFor(teacher2Id) } }),
    );
    expect(detail.status).toBe(404);

    const patch = await app.fetch(
      new Request(sheetsUrl(`/${sheetId}`), {
        method: "PATCH",
        headers: { cookie: cookieFor(teacher2Id), "content-type": "application/json" },
        body: JSON.stringify({ title: "偷改" }),
      }),
    );
    expect(patch.status).toBe(404);
  });

  it("admins can see and edit every sheet", async () => {
    const { app, teacherId, adminId, cookieFor, createSheet } = await setup();
    const sheetId = await createSheet(teacherId);
    const list = await app.fetch(
      new Request(sheetsUrl(), { headers: { cookie: cookieFor(adminId) } }),
    );
    const { sheets } = (await list.json()) as { sheets: { id: string }[] };
    expect(sheets.map((s) => s.id)).toContain(sheetId);
    const patch = await app.fetch(
      new Request(sheetsUrl(`/${sheetId}`), {
        method: "PATCH",
        headers: { cookie: cookieFor(adminId), "content-type": "application/json" },
        body: JSON.stringify({ title: "管理员改名" }),
      }),
    );
    expect(patch.status).toBe(200);
  });

  it("rejects invalid schema and non-staff callers", async () => {
    const { app, teacherId, studentId, cookieFor, createSheet } = await setup();
    const sheetId = await createSheet(teacherId);
    const bad = await app.fetch(
      new Request(sheetsUrl(`/${sheetId}`), {
        method: "PATCH",
        headers: { cookie: cookieFor(teacherId), "content-type": "application/json" },
        body: JSON.stringify({ schema: { version: 1, questions: [{ type: "fill" }] } }),
      }),
    );
    expect(bad.status).toBe(400);
    const asStudent = await app.fetch(
      new Request(sheetsUrl(), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(asStudent.status).toBe(403);
  });

  it("clone copies the sheet into the caller's library", async () => {
    const { app, teacherId, adminId, cookieFor, createSheet } = await setup();
    const sheetId = await createSheet(teacherId);
    const res = await app.fetch(
      new Request(sheetsUrl(`/${sheetId}/clone`), {
        method: "POST",
        headers: { cookie: cookieFor(adminId) },
      }),
    );
    expect(res.status).toBe(201);
    const { sheet } = (await res.json()) as {
      sheet: { ownerUserId: string; title: string; schema: { questions: unknown[] } };
    };
    expect(sheet.ownerUserId).toBe(adminId);
    expect(sheet.title).toContain("副本");
    expect(sheet.schema.questions).toHaveLength(3);
  });
});

describe("assignments and student flow", () => {
  async function assignAndGet(ctx: Awaited<ReturnType<typeof setup>>) {
    const { teacherId, classId, createSheet, assign } = ctx;
    const sheetId = await createSheet(teacherId);
    const res = await assign(teacherId, classId, sheetId, { dueAt: "2030-01-01T00:00:00Z" });
    expect(res.status).toBe(201);
    const { assignment } = (await res.json()) as { assignment: { id: string } };
    return { sheetId, assignmentId: assignment.id };
  }

  it("assigns a sheet to a class (owner only) with a frozen snapshot", async () => {
    const ctx = await setup();
    const { app, teacherId, teacher2Id, classId, otherClassId, cookieFor, db } = ctx;
    const { sheetId, assignmentId } = await assignAndGet(ctx);

    // Non-owner teacher in the same class cannot assign someone else's sheet.
    const denied = await ctx.assign(teacher2Id, otherClassId, sheetId);
    expect(denied.status).toBe(404);

    // Edit the template afterwards: the assignment keeps the old snapshot.
    await app.fetch(
      new Request(sheetsUrl(`/${sheetId}`), {
        method: "PATCH",
        headers: { cookie: cookieFor(teacherId), "content-type": "application/json" },
        body: JSON.stringify({
          schema: { version: 1, questions: [{ ...FILL_Q, prompt: "改动后的题干" }] },
        }),
      }),
    );
    const row = db
      .prepare("SELECT schema_json FROM task_assignments WHERE id = ?")
      .get(assignmentId) as { schema_json: string };
    expect(JSON.parse(row.schema_json).questions).toHaveLength(3);
  });

  it("students see the public schema — never the grading data", async () => {
    const ctx = await setup();
    const { app, studentId, classId, cookieFor } = ctx;
    const { assignmentId } = await assignAndGet(ctx);
    const res = await app.fetch(
      new Request(assignUrl(classId, `/${assignmentId}/response`), {
        headers: { cookie: cookieFor(studentId) },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { schema: { questions: Record<string, unknown>[] } };
    for (const q of body.schema.questions) {
      expect(q).not.toHaveProperty("correctOptionIds");
      expect(q).not.toHaveProperty("referenceAnswer");
    }
    const fill = body.schema.questions.find((q) => q.type === "fill")!;
    for (const blank of fill.blanks as Record<string, unknown>[]) {
      expect(blank).not.toHaveProperty("accept");
    }
    // Option text is visible; correctness markers and accepted answers are not.
    const serialized = JSON.stringify(body.schema);
    expect(serialized).not.toContain("correctOptionIds");
    expect(serialized).not.toContain("把连续取值映射到有限离散值");
    const choice = body.schema.questions.find((q) => q.type === "choice")!;
    expect(choice.options).toBeDefined();
  });

  it("saves a draft then submits; auto-grades fill and choice", async () => {
    const ctx = await setup();
    const { app, studentId, classId, cookieFor } = ctx;
    const { assignmentId } = await assignAndGet(ctx);
    const url = assignUrl(classId, `/${assignmentId}/response`);

    const saved = await app.fetch(
      new Request(url, {
        method: "PUT",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({
          answers: {
            q1: { type: "fill", blanks: { b1: " ８ ", b2: "字节" } },
            q2: { type: "choice", optionIds: ["o1", "o2"] },
            q3: { type: "short", text: "把连续变成离散" },
          },
        }),
      }),
    );
    expect(saved.status).toBe(200);

    const submitted = await app.fetch(
      new Request(`${url}/submit`, {
        method: "POST",
        headers: { cookie: cookieFor(studentId) },
      }),
    );
    expect(submitted.status).toBe(200);
    const result = (await submitted.json()) as {
      autoScore: number;
      autoTotal: number;
      grading: Record<string, { score: number }>;
    };
    // Fill: both blanks correct (８ normalizes to 8) → 4; choice: 2/3 hit, no
    // wrong → partialCredit gives 4 * 2/3 ≈ 2.67.
    expect(result.autoTotal).toBe(8);
    expect(result.autoScore).toBeCloseTo(4 + 8 / 3, 2);
    expect(result.grading.q1.score).toBe(4);
  });

  it("blocks submit while a required question is unanswered", async () => {
    const ctx = await setup();
    const { app, studentId, classId, cookieFor } = ctx;
    const { assignmentId } = await assignAndGet(ctx);
    const res = await app.fetch(
      new Request(assignUrl(classId, `/${assignmentId}/response/submit`), {
        method: "POST",
        headers: { cookie: cookieFor(studentId) },
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "required-question-unanswered" });
  });

  it("teacher lists responses, reviews short answers, returns work", async () => {
    const ctx = await setup();
    const { app, studentId, teacherId, teacher2Id, classId, cookieFor } = ctx;
    const { assignmentId } = await assignAndGet(ctx);
    const url = assignUrl(classId, `/${assignmentId}/response`);
    await app.fetch(
      new Request(url, {
        method: "PUT",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({
          answers: {
            q1: { type: "fill", blanks: { b1: "8", b2: "字节" } },
            q2: { type: "choice", optionIds: ["o1", "o2", "o3"] },
            q3: { type: "short", text: "采样后映射到有限集合" },
          },
        }),
      }),
    );
    await app.fetch(
      new Request(`${url}/submit`, { method: "POST", headers: { cookie: cookieFor(studentId) } }),
    );

    // Any teacher of the class can review — not only the assigner.
    const list = await app.fetch(
      new Request(assignUrl(classId, `/${assignmentId}/responses`), {
        headers: { cookie: cookieFor(teacher2Id) },
      }),
    );
    expect(list.status).toBe(200);
    const { rows } = (await list.json()) as {
      rows: { userId: string; status: string; responseId: string | null }[];
    };
    const row = rows.find((r) => r.userId === studentId)!;
    expect(row.status).toBe("submitted");

    const detail = await app.fetch(
      new Request(assignUrl(classId, `/${assignmentId}/responses/${row.responseId}`), {
        headers: { cookie: cookieFor(teacher2Id) },
      }),
    );
    const detailBody = (await detail.json()) as {
      schema: { questions: Record<string, unknown>[] };
    };
    // Teacher view keeps the grading data.
    expect(JSON.stringify(detailBody.schema)).toContain("correctOptionIds");

    const review = await app.fetch(
      new Request(assignUrl(classId, `/${assignmentId}/responses/${row.responseId}/review`), {
        method: "PATCH",
        headers: { cookie: cookieFor(teacher2Id), "content-type": "application/json" },
        body: JSON.stringify({
          questions: { q3: { score: 10, comment: "概念对，举例可以更具体" } },
          comment: "整体不错",
        }),
      }),
    );
    expect(review.status).toBe(200);
    const reviewResult = (await review.json()) as { finalScore: number; finalTotal: number };
    expect(reviewResult.finalScore).toBeCloseTo(4 + 4 + 10, 2);
    expect(reviewResult.finalTotal).toBe(20);

    // Return for rework, then student can edit and resubmit.
    const returned = await app.fetch(
      new Request(assignUrl(classId, `/${assignmentId}/responses/${row.responseId}/return`), {
        method: "POST",
        headers: { cookie: cookieFor(teacher2Id) },
      }),
    );
    expect(returned.status).toBe(200);
    const resave = await app.fetch(
      new Request(url, {
        method: "PUT",
        headers: { cookie: cookieFor(studentId), "content-type": "application/json" },
        body: JSON.stringify({ answers: { q3: { type: "short", text: "修订" } } }),
      }),
    );
    expect(resave.status).toBe(200);
  });

  it("rejects cross-class IDOR on assignment and response ids", async () => {
    const ctx = await setup();
    const { app, teacher2Id, otherClassId, classId, cookieFor } = ctx;
    const { assignmentId } = await assignAndGet(ctx);
    const res = await app.fetch(
      new Request(assignUrl(otherClassId, `/${assignmentId}/responses`), {
        headers: { cookie: cookieFor(teacher2Id) },
      }),
    );
    expect(res.status).toBe(404);
  });

  it("question stats aggregate correct rates and option distribution", async () => {
    const ctx = await setup();
    const { app, studentId, student2Id, teacherId, classId, cookieFor } = ctx;
    const { assignmentId } = await assignAndGet(ctx);
    const answer = async (uid: string, options: string[]) => {
      const url = assignUrl(classId, `/${assignmentId}/response`);
      await app.fetch(
        new Request(url, {
          method: "PUT",
          headers: { cookie: cookieFor(uid), "content-type": "application/json" },
          body: JSON.stringify({
            answers: {
              q1: { type: "fill", blanks: { b1: "8", b2: "字节" } },
              q2: { type: "choice", optionIds: options },
              q3: { type: "short", text: "回答" },
            },
          }),
        }),
      );
      await app.fetch(
        new Request(`${url}/submit`, { method: "POST", headers: { cookie: cookieFor(uid) } }),
      );
    };
    await answer(studentId, ["o1", "o2", "o3"]);
    await answer(student2Id, ["o1", "o4"]);

    const res = await app.fetch(
      new Request(assignUrl(classId, `/${assignmentId}/stats`), {
        headers: { cookie: cookieFor(teacherId) },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      submittedCount: number;
      stats: { type: string; correctRate?: number; optionCounts?: Record<string, number> }[];
    };
    expect(body.submittedCount).toBe(2);
    const choice = body.stats.find((s) => s.type === "choice")!;
    expect(choice.correctRate).toBe(0.5);
    expect(choice.optionCounts).toMatchObject({ o1: 2, o4: 1 });
  });
});
