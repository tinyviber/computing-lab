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

const draftsOf = async (
  app: Hono<{ Variables: AppVariables }>,
  classId: string,
  cookie: string,
) => {
  const project = await app.fetch(new Request(url(classId, "/project"), { headers: { cookie } }));
  const body = (await project.json()) as { drafts: Record<string, { code: string }> };
  return body.drafts;
};

describe("draft revision ordering", () => {
  it("rejects saves without a revision", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      saveToken: "t",
      draft: { a: 1 },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid-revision" });
  });

  it("rejects non-numeric revisions", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: "12",
      saveToken: "t",
      draft: { a: 1 },
    });
    expect(res.status).toBe(400);
  });

  it("rejects saves without a saveToken", async () => {
    const { app, classId, cookie } = await setup();
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 1,
      draft: { a: 1 },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid-save-token" });
  });

  it("keeps the newer draft when an older revision arrives late", async () => {
    const { app, classId, cookie } = await setup();
    const fresh = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 5,
      saveToken: "t",
      draft: { code: "newer" },
    });
    expect(await fresh.json()).toMatchObject({ ok: true, applied: true });

    const stale = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 4,
      saveToken: "t",
      draft: { code: "older" },
    });
    expect(stale.status).toBe(200);
    expect(await stale.json()).toMatchObject({ ok: true, applied: false });

    expect((await draftsOf(app, classId, cookie))["1"].code).toBe("newer");
  });

  it("applies revisions in increasing order per stage", async () => {
    const { app, classId, cookie } = await setup();
    await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 4,
      saveToken: "t",
      draft: { code: "a" },
    });
    const res = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 5,
      saveToken: "t",
      draft: { code: "b" },
    });
    expect(await res.json()).toMatchObject({ applied: true });
    expect((await draftsOf(app, classId, cookie))["1"].code).toBe("b");
  });

  it("tracks revisions independently per stage", async () => {
    const { app, classId, cookie } = await setup();
    const high = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 9,
      saveToken: "t",
      draft: { code: "s1" },
    });
    expect(await high.json()).toMatchObject({ applied: true });
    const other = await putDraft(app, classId, cookie, {
      stageIndex: 2,
      revision: 3,
      saveToken: "t",
      draft: { code: "s2" },
    });
    expect(await other.json()).toMatchObject({ applied: true });
  });

  it("orders equal revisions by saveToken so concurrent writers resolve deterministically", async () => {
    const { app, classId, cookie } = await setup();

    // Two tabs issue the same revision; the bigger token wins no matter the
    // arrival order — here the loser arrives second and is dropped.
    const winner = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 5,
      saveToken: "bbb",
      draft: { code: "from-b" },
    });
    expect(await winner.json()).toMatchObject({ applied: true });
    const loser = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 5,
      saveToken: "aaa",
      draft: { code: "from-a" },
    });
    expect(await loser.json()).toMatchObject({ applied: false });
    expect((await draftsOf(app, classId, cookie))["1"].code).toBe("from-b");
  });

  it("still applies the bigger token when it arrives after the smaller one", async () => {
    const { app, classId, cookie } = await setup();

    // Arrival order flipped: the eventual winner writes second and lands.
    const first = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 5,
      saveToken: "aaa",
      draft: { code: "from-a" },
    });
    expect(await first.json()).toMatchObject({ applied: true });
    const second = await putDraft(app, classId, cookie, {
      stageIndex: 1,
      revision: 5,
      saveToken: "bbb",
      draft: { code: "from-b" },
    });
    expect(await second.json()).toMatchObject({ applied: true });
    expect((await draftsOf(app, classId, cookie))["1"].code).toBe("from-b");
  });

  it("re-applies an identical write idempotently", async () => {
    const { app, classId, cookie } = await setup();
    const write = {
      stageIndex: 1,
      revision: 5,
      saveToken: "t",
      draft: { code: "same" },
    };
    await putDraft(app, classId, cookie, write);
    const retry = await putDraft(app, classId, cookie, write);
    expect(await retry.json()).toMatchObject({ applied: true });
    expect((await draftsOf(app, classId, cookie))["1"].code).toBe("same");
  });
});
