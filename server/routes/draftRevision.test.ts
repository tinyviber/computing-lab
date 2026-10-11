import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { hashPassword } from "../auth/password.ts";
import { createSession } from "../auth/session.ts";
import { openMemoryDb, newId } from "../db/client.ts";
import { attachDb, attachSession, type AppVariables } from "../http/context.ts";
import { imageSamplingRoutes } from "./imageSampling.ts";

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
  app.route("/api/classes/:classId/labs/image-sampling", imageSamplingRoutes());
  const cookie = `lab_session=${createSession(db, studentId).id}`;
  return { app, classId, cookie };
}

const url = (classId: string, path: string) =>
  `http://lab.test/api/classes/${classId}/labs/image-sampling${path}`;

const putDraft = (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
  body: Record<string, unknown>,
) =>
  app.fetch(
    new Request(url(classId, "/draft"), {
      method: "PUT",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

describe("draft revision ordering", () => {
  it("rejects saves without a revision", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, { stageIndex: 1, draft: { a: 1 } });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid-revision" });
  });

  it("rejects non-numeric revisions", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: "12",
      draft: { a: 1 },
    });
    expect(res.status).toBe(400);
  });

  it("keeps the newer draft when an older revision arrives late", async () => {
    const { app, classId, cookie } = await setup();
    const fresh = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 5,
      draft: { code: "newer" },
    });
    expect(await fresh.json()).toMatchObject({ ok: true, applied: true });

    const stale = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 4,
      draft: { code: "older" },
    });
    expect(stale.status).toBe(200);
    expect(await stale.json()).toMatchObject({ ok: true, applied: false });

    const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await project.json()) as { drafts: Record<string, { code: string }> };
    expect(body.drafts["1"].code).toBe("newer");
  });

  it("applies revisions in increasing order per stage", async () => {
    const { app, classId, cookie } = await setup();
    await putDraft(app, classId, cookie, { stageIndex: 1, revision: 4, draft: { code: "a" } });
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 5,
      draft: { code: "b" },
    });
    expect(await res.json()).toMatchObject({ applied: true });
    const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
    const body = (await project.json()) as { drafts: Record<string, { code: string }> };
    expect(body.drafts["1"].code).toBe("b");
  });

  it("tracks revisions independently per stage", async () => {
    const { app, classId, cookie } = await setup();
    const high = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 9,
      draft: { code: "s1" },
    });
    expect(await high.json()).toMatchObject({ applied: true });
    const other = await putDraft(app, classId, cookie, {
      stageIndex: 2,
      revision: 3,
      draft: { code: "s2" },
    });
    expect(await other.json()).toMatchObject({ applied: true });
  });
});
