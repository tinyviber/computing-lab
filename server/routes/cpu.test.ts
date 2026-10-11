import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { getCpuStage } from "../../src/features/cpu/domain/stages.ts";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { hiddenCasesFor } from "../judge/cpu/hiddenSet.ts";
import { seedFor } from "../../src/features/cpu/domain/rng.ts";
import { cpuRoutes } from "./cpu.ts";

async function setup() {
  const db = openMemoryDb();
  const classId = newId();
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "实验班",
    "invite-1",
  );
  const mkUser = async (no: string, role: string, memberRole: string | null, id = newId()) => {
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
  const studentId = await mkUser("stu-1", "user", "student", "c6-boundary-3");
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

const SOLVED_C6 = [
  { op: "STORE", reg: 1, operand: 14 },
  { op: "JZ", reg: 1, operand: 4 },
  { op: "SUB", reg: 1, operand: 15 },
  { op: "JMP", reg: 0, operand: 0 },
  { op: "HALT", reg: 0, operand: 0 },
];

/** Every prompt of the stage answered with its correct option index. */
function guidedAnswersFor(stageIndex: number): Record<string, number> {
  const stage = getCpuStage(stageIndex)!;
  return Object.fromEntries(
    (stage.guided?.prompts ?? []).map((p) => [
      p.id,
      p.options.findIndex((o) => o.correct === true),
    ]),
  );
}

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

  it("keeps the first guided pick on the server across retries and judges", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const firstPrompt = getCpuStage(1)!.guided!.prompts[0];
    const firstWrongIndex = firstPrompt.options.findIndex((option) => option.correct !== true);
    const correctIndex = firstPrompt.options.findIndex((option) => option.correct === true);
    const cookie = cookieFor(studentId);
    const recordFirstPick = (optionIndex: number) =>
      app.fetch(
        new Request(url(classId, "/guided-answer"), {
          method: "POST",
          headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ stageIndex: 1, promptId: firstPrompt.id, optionIndex }),
        }),
      );
    const firstPick = await recordFirstPick(firstWrongIndex);
    expect(firstPick.status).toBe(200);
    expect(await firstPick.json()).toEqual({ optionIndex: firstWrongIndex });

    // Simulate a refreshed client retrying with a different choice. The
    // server's first event remains authoritative even if /judge is forged.
    const retry = await recordFirstPick(correctIndex);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ optionIndex: firstWrongIndex });
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: { rows: SOLVED_C1 },
      guidedAnswers: guidedAnswersFor(1),
      guidedFirstAnswers: { [firstPrompt.id]: correctIndex },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      score: number;
      total: number;
      currentStage: number;
      testSummary: {
        predictions: { promptId: string; selected: string; correct: boolean }[];
      };
    };
    expect(outcome).toMatchObject({ passed: true, score: outcome.total, currentStage: 2 });
    expect(outcome.testSummary.predictions).toContainEqual(
      expect.objectContaining({
        promptId: firstPrompt.id,
        selected: firstPrompt.options[firstWrongIndex].label,
        correct: false,
      }),
    );
  });

  it("lets the C6 countdown finish with the fixed hidden B=8 boundary", async () => {
    const { db, app, classId, studentId, cookieFor } = await setup();
    const hiddenCases = hiddenCasesFor(6, seedFor(studentId, "cpu", 6));
    expect(hiddenCases.some((testCase) => testCase.initRegs?.B === 8)).toBe(true);
    const cookie = cookieFor(studentId);
    await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    db.prepare(
      "UPDATE student_projects SET passed_stages = ? WHERE user_id = ? AND class_id = ? AND lab_id = 'cpu'",
    ).run(JSON.stringify([1, 2, 3, 4, 5]), studentId, classId);

    const res = await judge(app, classId, cookie, {
      stageIndex: 6,
      draft: { rows: SOLVED_C6 },
      guidedAnswers: guidedAnswersFor(6),
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      score: number;
      total: number;
      testSummary: { results: { passed: boolean }[] };
    };
    expect(outcome.passed).toBe(true);
    expect(outcome.score).toBe(outcome.total);
    expect(outcome.testSummary.results.every((result) => result.passed)).toBe(true);
  });

  it("rejects a guided stage until the prompt sequence is complete", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: { rows: SOLVED_C1 },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "guided-incomplete" });
  });

  it("rejects a guided stage when an answer pick is wrong", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    // Every prompt answered — but one pick flipped to a wrong option. The
    // server re-checks the picks, so a bare complete-looking set fails.
    const answers = guidedAnswersFor(1);
    const first = getCpuStage(1)!.guided!.prompts[0];
    const wrong = first.options.findIndex((o) => o.correct !== true);
    answers[first.id] = wrong;
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 1,
      draft: { rows: SOLVED_C1 },
      guidedAnswers: answers,
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "guided-incomplete" });
  });

  it("normalizes guided submissions: a hostile draft can't reach a fixed program", async () => {
    const { db, app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    // Creating the project row first so the UPDATE below can see it.
    await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    // Stage 2 has zero editable rows — the submitted draft is dropped
    // entirely and the fixed prefill program (LOAD M[11] → STORE M[15]) is
    // what the judge runs, whatever the client claimed.
    db.prepare(
      "UPDATE student_projects SET passed_stages = ? WHERE user_id = ? AND class_id = ? AND lab_id = 'cpu'",
    ).run(JSON.stringify([1]), studentId, classId);
    const res = await judge(app, classId, cookie, {
      stageIndex: 2,
      draft: {
        rows: [
          { op: "HALT", reg: 0, operand: 0 },
          { op: "STORE", reg: 0, operand: 99 },
        ],
      },
      guidedAnswers: guidedAnswersFor(2),
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean };
    expect(outcome.passed).toBe(true);
  });

  it("ignores a draft whose STORE points at the wrong cell on a fixed stage", async () => {
    const { db, app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    // The submission STOREs to a wrong output cell — but stage 2's program is
    // fixed, so the judge never sees it. The fixed program still passes.
    db.prepare(
      "UPDATE student_projects SET passed_stages = ? WHERE user_id = ? AND class_id = ? AND lab_id = 'cpu'",
    ).run(JSON.stringify([1]), studentId, classId);
    const res = await judge(app, classId, cookie, {
      stageIndex: 2,
      draft: {
        rows: [
          { op: "LOAD", reg: 0, operand: 11 },
          { op: "STORE", reg: 0, operand: 13 },
          { op: "HALT", reg: 0, operand: 0 },
        ],
      },
      guidedAnswers: guidedAnswersFor(2),
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as { passed: boolean };
    expect(outcome.passed).toBe(true);
  });

  it("refuses a locked stage", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await judge(app, classId, cookieFor(studentId), {
      stageIndex: 3,
      draft: { rows: SOLVED_C1 },
      guidedAnswers: guidedAnswersFor(3),
    });
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "stage-locked" });
  });

  it("fails an incomplete program without crashing", async () => {
    const { db, app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    // Stage 7 (write-an-if) is a free challenge unlocked after core 5.
    db.prepare(
      "UPDATE student_projects SET passed_stages = ? WHERE user_id = ? AND class_id = ? AND lab_id = 'cpu'",
    ).run(JSON.stringify([1, 2, 3, 4, 5, 6]), studentId, classId);
    const res = await judge(app, classId, cookie, {
      stageIndex: 7,
      draft: { rows: [{ op: "LOAD", reg: 0, operand: 14 }] },
    });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      score: number;
      testSummary: {
        counterexample: {
          trace: { cycle: number; pc: number; decoded: { op: string } }[];
          finalRegs: { A: number; B: number };
          selfModFetch: boolean;
        } | null;
      };
    };
    expect(outcome.passed).toBe(false);
    expect(outcome.score).toBe(0);
    // The counterexample ships its bounded per-cycle trace so the UI can
    // show exactly where the hidden run went wrong.
    const counterexample = outcome.testSummary.counterexample;
    expect(counterexample).not.toBeNull();
    expect(counterexample!.trace.length).toBeGreaterThan(0);
    expect(counterexample!.trace[0]).toMatchObject({ cycle: 1, pc: 0 });
    expect(counterexample!.finalRegs.A).toEqual(expect.any(Number));
    expect(counterexample!.selfModFetch).toBe(false);
  });

  it("rate-limits the 21st judge call within the window", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      const res = await judge(app, classId, cookie, {
        stageIndex: 1,
        draft: { rows: SOLVED_C1 },
        guidedAnswers: guidedAnswersFor(1),
      });
      last = res.status;
    }
    expect(last).toBe(429);
    const res = await judge(app, classId, cookie, { stageIndex: 1, draft: {} });
    expect(await res.json()).toEqual({ error: "rate-limited" });
  });
});
