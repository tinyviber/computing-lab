import { describe, expect, it } from "vitest";
import { openMemoryDb, newId } from "../db/client.ts";
import {
  getOrCreateImageProject,
  judgeImageSubmission,
  sanitizeImageDraft,
  saveImageDraft,
} from "./image.ts";
import { core3Window } from "../../src/features/image-encoding/domain/checks.ts";
import { getImageFixture } from "../../src/features/image-encoding/domain/fixture.ts";

function setup() {
  const db = openMemoryDb();
  const userId = newId();
  const classId = newId();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    userId,
    "s1",
    "学生",
    "hash",
  );
  db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
    classId,
    "高一",
    "IMG",
  );
  return { db, userId, classId, project: getOrCreateImageProject(db, userId, classId) };
}

describe("image project persistence", () => {
  it("creates one project per learner and lab", () => {
    const { db, userId, classId, project } = setup();
    expect(project).toMatchObject({
      userId,
      classId,
      currentStage: 1,
      passedStages: [],
      artifact: { image: "photo", resStop: 50, colorStop: "palette4" },
    });
    expect(getOrCreateImageProject(db, userId, classId).id).toBe(project.id);
  });

  it("sanitizes draft text, clicks, artifact stops, and edited pixels", () => {
    const draft = sanitizeImageDraft(
      {
        core1Bits: "01x".repeat(20),
        conventionRevealed: "true",
        restoreObservation: "x".repeat(1200),
        hallucinationClicks: [
          { x: -3, y: 4 },
          { x: Number.NaN, y: 2 },
        ],
        core3Edited: { width: 1, height: 1, pixels: [] },
      },
      { image: "bad", resStop: 37, colorStop: "bad" },
    );
    expect(draft.artifact).toEqual({ image: "photo", resStop: 25, colorStop: "palette4" });
    expect(draft.core1Bits).toHaveLength(16);
    expect(draft.core1Bits).toMatch(/^[01]+$/);
    expect(draft.conventionRevealed).toBe(false);
    expect(draft.restoreObservation).toHaveLength(1000);
    expect(draft.hallucinationClicks).toEqual([{ x: 0, y: 4 }]);
    expect(draft.core3Edited).toBeUndefined();
  });

  it("persists only the sanitized image draft", () => {
    const { db, project } = setup();
    const saved = saveImageDraft(
      db,
      project,
      { image: "photo", resStop: 25, colorStop: "rgb24" },
      { core1Bits: "01bad", restoreObservation: "观察" },
    );
    expect(saved).toMatchObject({
      artifact: { image: "photo", resStop: 25, colorStop: "rgb24" },
      core1Bits: "01",
      restoreObservation: "观察",
    });
    expect(getOrCreateImageProject(db, project.userId, project.classId).draft).toMatchObject(saved);
  });
});

describe("image server judge", () => {
  it("records a failed Core 1 attempt without advancing progress", () => {
    const { db, project } = setup();
    const outcome = judgeImageSubmission(db, project, 1, project.artifact, {
      studentBits: "0000",
    });
    expect(outcome).toMatchObject({ passed: false, currentStage: 1, passedStages: [] });
    const row = db
      .prepare("SELECT passed, score, total FROM submissions WHERE project_id = ?")
      .get(project.id) as { passed: number; score: number; total: number };
    expect(row).toEqual({ passed: 0, score: 0, total: 1 });
  });

  it("rechecks Core 1 and Core 2 evidence and advances persisted progress", () => {
    const { db, project } = setup();
    const core1 = judgeImageSubmission(db, project, 1, project.artifact, {
      studentBits: "0111010101011001",
    });
    expect(core1).toMatchObject({ passed: true, currentStage: 2, passedStages: [1] });
    if ("error" in core1) throw new Error(core1.error);

    const reloaded = getOrCreateImageProject(db, project.userId, project.classId);
    const core2 = judgeImageSubmission(
      db,
      reloaded,
      2,
      { image: "photo", resStop: 25, colorStop: "rgb24" },
      {},
    );
    expect(core2).toMatchObject({ passed: true, currentStage: 3, passedStages: [1, 2] });
  });

  it("rechecks the many-to-one collision instead of trusting a client pass flag", () => {
    const { db, project } = setup();
    const artifact = {
      image: "photo" as const,
      resStop: 50 as const,
      colorStop: "palette4" as const,
    };
    const original = core3Window(getImageFixture("photo"), artifact).original;
    const pixels = original.pixels.slice();
    for (const x of [0, 2, 4, 6, 8, 10, 12, 14]) {
      const color = pixels[x];
      pixels[x] = { r: 255 - color.r, g: 255 - color.g, b: 255 - color.b };
    }
    const edited = { ...original, pixels };
    const outcome = judgeImageSubmission(db, project, 3, artifact, { edited, passed: true });
    expect(outcome).toMatchObject({ passed: true, passedStages: [3] });

    const unchanged = judgeImageSubmission(
      db,
      getOrCreateImageProject(db, project.userId, project.classId),
      3,
      artifact,
      { edited: original, passed: true },
    );
    expect(unchanged).toMatchObject({ passed: false });
  });

  it("rejects locked, unknown, and non-judge stages", () => {
    const { db, project } = setup();
    expect(judgeImageSubmission(db, project, 5, project.artifact, {})).toEqual({
      error: "stage-locked",
      status: 409,
    });
    expect(judgeImageSubmission(db, project, 4, project.artifact, {})).toEqual({
      error: "stage-locked",
      status: 409,
    });
    expect(judgeImageSubmission(db, project, 99, project.artifact, {})).toEqual({
      error: "invalid-stage",
      status: 400,
    });
  });
});
