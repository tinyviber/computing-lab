import { describe, expect, it } from "vitest";
import { openMemoryDb, newId } from "../../db/client.ts";
import { getOrCreateProject, saveStageDraft } from "../pipeline.ts";
import {
  sanitizeDraft,
  type StageDraft,
} from "../../../src/features/image-sampling/lesson/state.ts";
import { judgeImageSubmission } from "./judge.ts";
import { judgeGalleryFor } from "./hiddenGallery.ts";
import { imageToRows } from "../../../src/features/image-sampling/domain/bitmap.ts";
import { judgeResolution } from "../../../src/features/image-sampling/domain/recognize.ts";
import {
  IMAGE_SAMPLING_STAGES,
  getSamplingStage,
} from "../../../src/features/image-sampling/domain/stages.ts";

const LAB_ID = "image-sampling";

function setupProject(passedStages: number[] = []) {
  const db = openMemoryDb();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    newId(),
    "s1",
    "学生",
    "x",
  );
  const userId = db.prepare("SELECT id FROM users").get() as { id: string };
  const project = getOrCreateProject<StageDraft>(db, userId.id, "class-1", LAB_ID);
  if (passedStages.length) {
    db.prepare("UPDATE student_projects SET passed_stages = ?, current_stage = ? WHERE id = ?").run(
      JSON.stringify(passedStages),
      Math.max(...passedStages) + 1,
      project.id,
    );
    return { db, project: { ...project, passedStages } };
  }
  return { db, project };
}

describe("image-sampling judge", () => {
  it("passes a resolution that keeps every member unique within budget", () => {
    const { db, project } = setupProject();
    const outcome = judgeImageSubmission(db, project, 1, { width: 16, height: 16 });
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(true);
    expect(outcome.accuracy).toBe(1);
    expect(outcome.withinBudget).toBe(true);
    expect(outcome.passedStages).toEqual([1]);
  });

  it("fails when cells exceed the budget even at full accuracy", () => {
    const { db, project } = setupProject([1, 2, 3]);
    // stage 4 (ridge, budget 240): 24×24 = 576 cells, accuracy is 100% but over budget.
    const outcome = judgeImageSubmission(db, project, 4, { width: 24, height: 24 });
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.accuracy).toBe(1);
    expect(outcome.withinBudget).toBe(false);
    expect(outcome.passed).toBe(false);
  });

  it("fails a resolution that collapses members, with a counterexample", () => {
    const { db, project } = setupProject();
    const outcome = judgeImageSubmission(db, project, 1, { width: 4, height: 4 });
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(false);
    expect(outcome.counterexample).not.toBeNull();
    expect(outcome.counterexample!.query.small.width).toBe(4);
    expect(outcome.counterexample!.collidedWith.length).toBeGreaterThan(0);
  });

  it("rejects non-square answers on square stages", () => {
    const { db, project } = setupProject();
    const outcome = judgeImageSubmission(db, project, 1, { width: 16, height: 8 });
    expect(outcome).toEqual({ error: "square-resolution-required", status: 400 });
  });

  it("enforces stage order: stage 3 locked until 2 passes", () => {
    const { db, project } = setupProject([1]);
    const outcome = judgeImageSubmission(db, project, 3, { width: 24, height: 24 });
    expect(outcome).toEqual({ error: "stage-locked", status: 409 });
  });

  it("persists a submission row with the resolution snapshot", () => {
    const { db, project } = setupProject();
    const outcome = judgeImageSubmission(db, project, 1, { width: 16, height: 16 }, "def f(): 16");
    if ("error" in outcome) throw new Error(outcome.error);
    const row = db.prepare("SELECT * FROM submissions WHERE id = ?").get(outcome.submissionId) as {
      snapshot_graph: string;
      passed: number;
    };
    expect(JSON.parse(row.snapshot_graph)).toMatchObject({ width: 16, height: 16 });
    expect(row.passed).toBe(1);
  });

  it("saves and sanitizes a stage draft", () => {
    const { db, project } = setupProject();
    saveStageDraft(db, project, 2, sanitizeDraft({ width: 24, height: 24, code: "return 24" }));
    const row = db
      .prepare("SELECT draft_graph FROM student_projects WHERE id = ?")
      .get(project.id) as { draft_graph: string };
    expect(JSON.parse(row.draft_graph)["2"]).toEqual({
      width: 24,
      height: 24,
      code: "return 24",
    });
  });
});

/**
 * Calibration guard: every stage must be winnable on the *combined* gallery
 * (public + hidden seeds) — and the intended pass resolutions from the
 * calibration run must still pass, so fixture drift fails loudly.
 */
describe("judge gallery calibration", () => {
  it("hidden members are distinct from the public set at full resolution", () => {
    for (const stage of IMAGE_SAMPLING_STAGES) {
      const gallery = judgeGalleryFor(stage.category);
      const signatures = new Set(gallery.map((e) => imageToRows(e.image).join("/")));
      expect(signatures.size).toBe(gallery.length);
    }
  });

  it.each([
    [1, 16, 16],
    [2, 24, 24],
    [3, 24, 24],
    [4, 16, 8],
    [5, 12, 20],
  ])("stage %i passes at %i×%i", (stageIndex, width, height) => {
    const stage = getSamplingStage(stageIndex)!;
    const gallery = judgeGalleryFor(stage.category);
    const report = judgeResolution(gallery, gallery, width, height);
    expect(width * height).toBeLessThanOrEqual(stage.cellBudget);
    expect(report.accuracy).toBeGreaterThanOrEqual(stage.requiredAccuracy);
  });

  it.each([
    // Directional traps: mirrored resolutions of the passing answers fail.
    [4, 8, 16],
    [5, 20, 12],
  ])("stage %i trap %i×%i stays below the bar", (stageIndex, width, height) => {
    const stage = getSamplingStage(stageIndex)!;
    const gallery = judgeGalleryFor(stage.category);
    const report = judgeResolution(gallery, gallery, width, height);
    expect(report.accuracy).toBeLessThan(stage.requiredAccuracy);
  });
});
