import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { newId, openMemoryDb } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { truthOf, type SlotKey } from "../../src/features/ai-eval/domain/corpus.ts";
import type {
  AiEvalDraft,
  DrawPayload,
  DrawsResponse,
  StabilityRating,
  TranscriptRow,
  VerdictChoice,
  VerifyResponse,
} from "../../src/features/ai-eval/domain/protocol.ts";
import { C3_DRAW_COUNT, VERIFY_QUOTA } from "../../src/features/ai-eval/domain/protocol.ts";
import type { PhrasingDim, Probe } from "../../src/features/ai-eval/domain/probe.ts";
import { PHRASING_DIMS } from "../../src/features/ai-eval/domain/probe.ts";
import {
  c1Plan,
  c2Question,
  HIDDEN_CORPUS,
  produceDraw,
  stageSeedFor,
} from "../judge/ai-eval/hiddenBank.ts";
import { aiEvalRoutes } from "./aiEval.ts";

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
  app.route("/api/classes/:classId/labs/ai-eval", aiEvalRoutes());
  const cookieFor = (userId: string) => `lab_session=${createSession(db, userId).id}`;
  return { db, classId, studentId, teacherId, app, cookieFor };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/ai-eval${path}`;

const post = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  path: string,
  body: unknown,
) =>
  app.fetch(
    new Request(url(classId, path), {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

const putDraft = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  stageIndex: number,
  draft: unknown,
) =>
  app.fetch(
    new Request(url(classId, "/draft"), {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ stageIndex, draft }),
    }),
  );

const draw = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  stageIndex: number,
  probes: Probe[],
) => post(app, classId, cookie, "/draws", { stageIndex, probes });

const judge = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  stageIndex: number,
  draft: unknown,
) => post(app, classId, cookie, "/judge", { stageIndex, draft });

const verify = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  drawId: string,
  slotIndex: number,
) => post(app, classId, cookie, "/verify", { stageIndex: 3, drawId, slotIndex });

/** Pass C1+C2 gating for stage-N tests — creates the project first. */
async function unlock(
  app: Hono<{ Variables: AppVariables }>,
  db: ReturnType<typeof openMemoryDb>,
  classId: string,
  userId: string,
  cookie: string,
  stages: number[],
) {
  // Force getOrCreateProject so the UPDATE has a row to hit.
  await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
  db.prepare(
    "UPDATE student_projects SET passed_stages = ?, current_stage = ? WHERE user_id = ? AND lab_id = 'ai-eval'",
  ).run(JSON.stringify(stages), Math.max(...stages) + 1, userId);
}

/** The judge's C1 classification, mirrored: distinct over collected obs. */
function classify(payloads: DrawPayload[]): StabilityRating | "unknown" {
  const keys = payloads.map((p) =>
    p.slots
      .map((s) => `${s.fieldId}=${s.value}`)
      .sort()
      .join(";"),
  );
  const obs = keys.length;
  const distinct = new Set(keys).size;
  if (obs < 3) return "unknown";
  if (distinct === 1) return obs >= 6 ? "stable" : "wobbly";
  return distinct / obs >= 0.6 ? "volatile" : "wobbly";
}

/** Drive stage-1 to a real pass: 6 draws/question, all collected, correct ratings. */
async function solveStage1(
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  userId: string,
) {
  const plan = c1Plan(stageSeedFor(userId, 1));
  const transcript: TranscriptRow[] = [];
  const ratings: Record<string, StabilityRating> = {};
  for (const item of plan) {
    const probes = Array.from({ length: 6 }, (_, k) => ({
      questionId: item.question.id,
      phrasing: [] as PhrasingDim[],
      k,
    }));
    const res = await draw(app, classId, cookie, 1, probes);
    expect(res.status).toBe(200);
    const { draws } = (await res.json()) as DrawsResponse;
    for (const d of draws) {
      transcript.push({ probe: d.probe, drawId: d.drawId, collectedAt: transcript.length + 1 });
    }
    const rating = classify(draws);
    if (rating !== "unknown") ratings[item.question.id] = rating;
  }
  const put = await putDraft(app, classId, cookie, 1, { transcript, ratings });
  expect(put.status).toBe(200);
  return { transcript, ratings };
}

describe("ai-eval routes", () => {
  it("creates a project with ai-eval extras (question briefs, no flags)", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const res = await app.fetch(
      new Request(url(classId, "/project"), { headers: { cookie: cookieFor(studentId) } }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      labId: string;
      aiEval: { stages: { "1": { questions: { id: string; text: string }[] } } };
    };
    expect(body.labId).toBe("ai-eval");
    expect(body.aiEval.stages["1"].questions).toHaveLength(4);
    for (const q of body.aiEval.stages["1"].questions) {
      expect(q.id).toMatch(/^c1/);
    }
  });

  it("locks non-admins out while the lab is hidden", async () => {
    const { app, db, classId, studentId, teacherId, cookieFor } = await setup();
    db.prepare("INSERT INTO lab_settings (lab_id, hidden) VALUES (?, 1)").run("ai-eval");
    for (const userId of [studentId, teacherId]) {
      const res = await app.fetch(
        new Request(url(classId, "/project"), { headers: { cookie: cookieFor(userId) } }),
      );
      expect(res.status).toBe(403);
    }
  });

  it("serves draws that never leak flags/entryId", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const q = c1Plan(stageSeedFor(studentId, 1))[0].question;
    const res = await draw(app, classId, cookie, 1, [{ questionId: q.id, phrasing: [], k: 0 }]);
    expect(res.status).toBe(200);
    const { draws } = (await res.json()) as DrawsResponse;
    expect(draws).toHaveLength(1);
    expect(draws[0].drawId).toMatch(/^[0-9a-f]{8}$/);
    expect("flags" in draws[0]).toBe(false);
    expect("entryId" in draws[0]).toBe(false);
    expect(draws[0].slots.length).toBeGreaterThan(0);
  });

  it("rejects bad probes and out-of-plan questions", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    expect(
      (await draw(app, classId, cookie, 1, [{ questionId: "not-in-plan", phrasing: [], k: 0 }]))
        .status,
    ).toBe(400);
    expect(
      (
        await draw(app, classId, cookie, 1, [
          { questionId: "x", phrasing: ["bogus" as PhrasingDim], k: 0 },
        ])
      ).status,
    ).toBe(400);
    expect((await post(app, classId, cookie, "/draws", { stageIndex: 9, probes: [] })).status).toBe(
      400,
    );
  });

  it("draws are idempotent — replaying a probe returns the same drawId", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const q = c1Plan(stageSeedFor(studentId, 1))[0].question;
    const a = (await (
      await draw(app, classId, cookie, 1, [{ questionId: q.id, phrasing: [], k: 0 }])
    ).json()) as DrawsResponse;
    const b = (await (
      await draw(app, classId, cookie, 1, [{ questionId: q.id, phrasing: [], k: 0 }])
    ).json()) as DrawsResponse;
    expect(a.draws[0].drawId).toBe(b.draws[0].drawId);
  });

  it("passes stage 1 with a fully collected, correctly rated transcript", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const { transcript, ratings } = await solveStage1(app, classId, cookie, studentId);
    const res = await judge(app, classId, cookie, 1, { transcript, ratings });
    expect(res.status).toBe(200);
    const outcome = (await res.json()) as {
      passed: boolean;
      score: number;
      currentStage: number;
      passedStages: number[];
    };
    expect(outcome.passed).toBe(true);
    expect(outcome.passedStages).toEqual([1]);
    expect(outcome.currentStage).toBe(2);
  });

  it("fails forged transcript rows with transcript-mismatch", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    await solveStage1(app, classId, cookie, studentId);
    const forged: TranscriptRow[] = [
      {
        probe: { questionId: "c1-st-lib", phrasing: [], k: 0 },
        drawId: "deadbeef",
        collectedAt: 1,
      },
    ];
    const res = await judge(app, classId, cookie, 1, { transcript: forged, ratings: {} });
    const outcome = (await res.json()) as {
      passed: boolean;
      testSummary: { error: string | null };
    };
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.error).toBe("transcript-mismatch");
  });

  it("fails 判稳定 with too few observations", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const plan = c1Plan(stageSeedFor(studentId, 1));
    const stable = plan.find((i) => i.temp === 0)!.question;
    const res = await draw(app, classId, cookie, 1, [
      { questionId: stable.id, phrasing: [], k: 0 },
      { questionId: stable.id, phrasing: [], k: 1 },
    ]);
    const { draws } = (await res.json()) as DrawsResponse;
    const transcript = draws.map((d, i) => ({
      probe: d.probe,
      drawId: d.drawId,
      collectedAt: i + 1,
    }));
    const outcome = (await (
      await judge(app, classId, cookie, 1, {
        transcript,
        ratings: { [stable.id]: "stable" },
      })
    ).json()) as { testSummary: { error: string | null } };
    expect(outcome.testSummary.error).toBe("insufficient-observations");
  });

  it("flags all-same-rating as degenerate", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const { transcript } = await solveStage1(app, classId, cookie, studentId);
    const plan = c1Plan(stageSeedFor(studentId, 1));
    const ratings = Object.fromEntries(plan.map((i) => [i.question.id, "wobbly" as const]));
    const outcome = (await (
      await judge(app, classId, cookie, 1, { transcript, ratings })
    ).json()) as { passed: boolean; testSummary: { degenerate: string | null } };
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.degenerate).toBe("all-same-rating");
  });

  it("blocks stage-2 draws until predictions are persisted (409)", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    await solveStage1(app, classId, cookie, studentId);
    const q = c2Question(stageSeedFor(studentId, 2));
    const early = await draw(app, classId, cookie, 2, [{ questionId: q.id, phrasing: [], k: 0 }]);
    expect(early.status).toBe(409);
    expect(await early.json()).toEqual({ error: "prediction-required" });
  });

  it("passes stage 2 when predictions precede the matrix", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const s1 = await solveStage1(app, classId, cookie, studentId);
    expect(
      ((await (await judge(app, classId, cookie, 1, s1)).json()) as { passed: boolean }).passed,
    ).toBe(true);
    const q = c2Question(stageSeedFor(studentId, 2));

    // Figure out which dim actually changes the answer (server-side truth).
    const base = produceDraw(studentId, 2, { questionId: q.id, phrasing: [], k: 0 })!;
    const baseKey = base.slots
      .map((s) => `${s.fieldId}=${s.value}`)
      .sort()
      .join(";");
    const predictions: Partial<Record<PhrasingDim, boolean>> = {};
    for (const dim of PHRASING_DIMS) {
      const alt = produceDraw(studentId, 2, { questionId: q.id, phrasing: [dim.id], k: 0 })!;
      predictions[dim.id] =
        alt.slots
          .map((s) => `${s.fieldId}=${s.value}`)
          .sort()
          .join(";") !== baseKey;
    }
    const put = await putDraft(app, classId, cookie, 2, { predictions });
    expect(put.status).toBe(200);

    // Fill the matrix: base + all 5 dims × 3 draws each (≤8 probes per call).
    const probes: Probe[] = [
      ...Array.from({ length: 3 }, (_, k) => ({
        questionId: q.id,
        phrasing: [] as PhrasingDim[],
        k,
      })),
      ...PHRASING_DIMS.flatMap((d) =>
        Array.from({ length: 3 }, (_, k) => ({
          questionId: q.id,
          phrasing: [d.id] as PhrasingDim[],
          k,
        })),
      ),
    ];
    const matrix: Record<string, string[]> = {};
    for (let i = 0; i < probes.length; i += 8) {
      const res = await draw(app, classId, cookie, 2, probes.slice(i, i + 8));
      expect(res.status).toBe(200);
      const { draws } = (await res.json()) as DrawsResponse;
      for (const d of draws) {
        const col = d.probe.phrasing[0] ?? "base";
        (matrix[col] ??= []).push(d.drawId);
      }
    }
    const out = (await (await judge(app, classId, cookie, 2, { matrix })).json()) as {
      passed: boolean;
      score: number;
    };
    expect(out.passed).toBe(true);
    expect(out.score).toBe(5);
  });

  it("rejects predictions edited after the first draw", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const s1 = await solveStage1(app, classId, cookie, studentId);
    await judge(app, classId, cookie, 1, s1);
    const q = c2Question(stageSeedFor(studentId, 2));
    const predictions = { order: false };
    await putDraft(app, classId, cookie, 2, { predictions });
    const res = await draw(app, classId, cookie, 2, [{ questionId: q.id, phrasing: [], k: 0 }]);
    expect(res.status).toBe(200);
    // Change predictions post-draw → predictedAt overtakes firstDrawSeq.
    await putDraft(app, classId, cookie, 2, { predictions: { order: true } });
    const outcome = (await (await judge(app, classId, cookie, 2, { matrix: {} })).json()) as {
      testSummary: { error: string | null };
    };
    expect(outcome.testSummary.error).toBe("prediction-after-draw");
  });

  it("resets C2 predictions until the first draw, then seals them", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const s1 = await solveStage1(app, classId, cookie, studentId);
    await judge(app, classId, cookie, 1, s1);
    const q = c2Question(stageSeedFor(studentId, 2));
    const predictions = { order: false, polite: true, qualifier: false, synonym: false };
    expect((await putDraft(app, classId, cookie, 2, { predictions })).status).toBe(200);

    // Wrong stage is rejected by the action itself.
    expect((await post(app, classId, cookie, "/reset-predictions", { stageIndex: 1 })).status).toBe(
      400,
    );

    // Pre-draw reset clears the seal and puts /draws back to 409.
    const reset = await post(app, classId, cookie, "/reset-predictions", { stageIndex: 2 });
    expect(reset.status).toBe(200);
    const project = (await (
      await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }))
    ).json()) as { drafts: Record<string, AiEvalDraft> };
    expect(project.drafts["2"].predictions).toEqual({});
    expect(project.drafts["2"].predictedAt).toBeNull();
    expect(
      (await draw(app, classId, cookie, 2, [{ questionId: q.id, phrasing: [], k: 0 }])).status,
    ).toBe(409);

    // Once a draw is issued the evidence is sealed — reset is refused.
    await putDraft(app, classId, cookie, 2, { predictions });
    expect(
      (await draw(app, classId, cookie, 2, [{ questionId: q.id, phrasing: [], k: 0 }])).status,
    ).toBe(200);
    const late = await post(app, classId, cookie, "/reset-predictions", { stageIndex: 2 });
    expect(late.status).toBe(409);
    expect(await late.json()).toEqual({ error: "draws-issued" });
    const sealed = (await (
      await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }))
    ).json()) as { drafts: Record<string, AiEvalDraft> };
    expect(sealed.drafts["2"].predictions).toEqual(predictions);
    expect(sealed.drafts["2"].predictedAt).not.toBeNull();
  });

  it("dispenses stage-3 draws sequentially and enforces the verify quota", async () => {
    const { app, classId, studentId, cookieFor, db } = await setup();
    const cookie = cookieFor(studentId);
    await unlock(app, db, classId, studentId, cookie, [1, 2]);
    const res = await draw(
      app,
      classId,
      cookie,
      3,
      Array.from({ length: 8 }, (_, k) => ({ questionId: "*", phrasing: [], k })),
    );
    expect(res.status).toBe(200);
    const { draws } = (await res.json()) as DrawsResponse;
    expect(draws).toHaveLength(8);
    // k must be the cursor — jumping ahead is rejected.
    const skip = await draw(app, classId, cookie, 3, [{ questionId: "*", phrasing: [], k: 9 }]);
    expect(skip.status).toBe(400);
    // verify quota: VERIFY_QUOTA calls pass, the next is 409.
    let lastStatus = 0;
    for (let i = 0; i <= VERIFY_QUOTA; i += 1) {
      const d = draws[i % draws.length];
      const v = await verify(app, classId, cookie, d.drawId, 0);
      lastStatus = v.status;
      if (i < VERIFY_QUOTA) {
        const body = (await v.json()) as VerifyResponse;
        expect(body.quotaLeft).toBe(VERIFY_QUOTA - i - 1);
      }
    }
    expect(lastStatus).toBe(409);
    // Quota check still applies to a *real* draw — deadbeef above was never
    // issued, which fails earlier as unknown-draw.
    expect(await (await verify(app, classId, cookie, draws[0].drawId, 0)).json()).toEqual({
      error: "quota-exceeded",
    });
  });

  it("fails verify on an unknown draw before quota is spent", async () => {
    const { app, classId, studentId, cookieFor, db } = await setup();
    await unlock(app, db, classId, studentId, cookieFor(studentId), [1, 2]);
    const res = await verify(app, classId, cookieFor(studentId), "deadbeef", 0);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "unknown-draw" });
  });

  it("fails all-trust verdicts at recall 0 (degenerate)", async () => {
    const { app, classId, studentId, cookieFor, db } = await setup();
    const cookie = cookieFor(studentId);
    await unlock(app, db, classId, studentId, cookie, [1, 2]);
    const draws = await dispenseAll(app, classId, cookie);
    const verdicts = Object.fromEntries(
      draws.map((d) => [d.drawId, { v: "trust" } satisfies VerdictChoice]),
    );
    const outcome = (await (await judge(app, classId, cookie, 3, { verdicts })).json()) as {
      passed: boolean;
      testSummary: { degenerate: string | null };
    };
    expect(outcome.passed).toBe(false);
    expect(outcome.testSummary.degenerate).toBe("all-trust");
  });

  it("rejects a doubt verdict citing an unverified field", async () => {
    const { app, classId, studentId, cookieFor, db } = await setup();
    const cookie = cookieFor(studentId);
    await unlock(app, db, classId, studentId, cookie, [1, 2]);
    const draws = await dispenseAll(app, classId, cookie);
    const defective = draws.find((d) => defectIds(d).length > 0)!;
    const verdicts: Record<string, VerdictChoice> = Object.fromEntries(
      draws.map((d) => [d.drawId, { v: "trust" } satisfies VerdictChoice]),
    );
    // One doubt, but the cited field was never /verify'd.
    verdicts[defective.drawId] = { v: "doubt", fieldId: defectIds(defective)[0] };
    const outcome = (await (await judge(app, classId, cookie, 3, { verdicts })).json()) as {
      passed: boolean;
      testSummary: { error: string | null };
    };
    expect(outcome.testSummary.error).toBe("unverified-cite");
    expect(outcome.passed).toBe(false);
  });

  it("passes stage 3 when doubts cite verified defective fields", async () => {
    const { app, classId, studentId, cookieFor, db } = await setup();
    const cookie = cookieFor(studentId);
    await unlock(app, db, classId, studentId, cookie, [1, 2]);
    const draws = await dispenseAll(app, classId, cookie);
    const verdicts: Record<string, VerdictChoice> = {};
    for (const d of draws) {
      const defects = defectIds(d);
      if (defects.length === 0) {
        verdicts[d.drawId] = { v: "trust" };
        continue;
      }
      // Verify the defective slot, then cite it.
      const slotIndex = d.slots.findIndex((s) => s.fieldId === defects[0]);
      const v = await verify(app, classId, cookie, d.drawId, slotIndex);
      expect(v.status).toBe(200);
      verdicts[d.drawId] = { v: "doubt", fieldId: defects[0] };
    }
    const outcome = (await (await judge(app, classId, cookie, 3, { verdicts })).json()) as {
      passed: boolean;
      score: number;
    };
    expect(outcome.passed).toBe(true);
  });

  it("counts doubt-without-fieldId as a miss, not an error", async () => {
    const { app, classId, studentId, cookieFor, db } = await setup();
    const cookie = cookieFor(studentId);
    await unlock(app, db, classId, studentId, cookie, [1, 2]);
    const draws = await dispenseAll(app, classId, cookie);
    const defective = draws.filter((d) => defectIds(d).length > 0);
    const verdicts: Record<string, VerdictChoice> = Object.fromEntries(
      draws.map((d) => [d.drawId, { v: "trust" } satisfies VerdictChoice]),
    );
    verdicts[defective[0].drawId] = { v: "doubt" };
    const outcome = (await (await judge(app, classId, cookie, 3, { verdicts })).json()) as {
      passed: boolean;
      testSummary: { error: string | null; degenerate: string | null };
    };
    expect(outcome.testSummary.error).toBeNull();
    expect(outcome.passed).toBe(false); // recall sinks below the bar
  });

  it("rate-limits /draws within the window", async () => {
    const { app, classId, studentId, cookieFor } = await setup();
    const cookie = cookieFor(studentId);
    const q = c1Plan(stageSeedFor(studentId, 1))[0].question;
    let last = 0;
    for (let i = 0; i < 21; i += 1) {
      last = (await draw(app, classId, cookie, 1, [{ questionId: q.id, phrasing: [], k: i % 8 }]))
        .status;
    }
    expect(last).toBe(429);
  });
});

/* ------------------------------ helpers ------------------------------ */

async function dispenseAll(
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
): Promise<DrawPayload[]> {
  const out: DrawPayload[] = [];
  while (out.length < C3_DRAW_COUNT) {
    const res = await draw(app, classId, cookie, 3, [
      { questionId: "*", phrasing: [], k: out.length },
    ]);
    expect(res.status).toBe(200);
    out.push(...((await res.json()) as DrawsResponse).draws);
  }
  return out;
}

/** fieldIds whose claimed value disagrees with the fact table. */
function defectIds(draw: DrawPayload): string[] {
  return draw.slots
    .filter((s) => truthOf(HIDDEN_CORPUS, s.fieldId) !== s.value)
    .map((s) => s.fieldId);
}
