import { describe, expect, it } from "vitest";
import { openMemoryDb, newId } from "../../db/client.ts";
import { getOrCreateProject } from "../run.ts";
import { judgeQuantSubmission, saveQuantDraft } from "./judge.ts";
import { judgeGalleryFor } from "./hiddenSet.ts";
import { judgeMapping } from "../../../src/features/color-quantization/domain/recognize.ts";
import {
  countOverrides,
  nnTable,
  SOURCE_COLOR_COUNT,
} from "../../../src/features/color-quantization/domain/quantize.ts";
import { TONER_RACK } from "../../../src/features/color-quantization/domain/palette.ts";
import {
  COLOR_QUANT_STAGES,
  getQuantStage,
} from "../../../src/features/color-quantization/domain/stages.ts";

const LAB_ID = "color-quantization";

function setupProject(passedStages: number[] = []) {
  const db = openMemoryDb();
  db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
    newId(),
    "s1",
    "学生",
    "x",
  );
  const userId = db.prepare("SELECT id FROM users").get() as { id: string };
  const project = getOrCreateProject(db, userId.id, "class-1", LAB_ID);
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

/** All k-subsets of toner indices 0..7 (70 combos at k=4). */
function subsets(k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push([...acc]);
      return;
    }
    for (let i = start; i < TONER_RACK.length; i += 1) {
      acc.push(i);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

describe("color-quantization judge", () => {
  it("passes the warm-up stage with the full rack", () => {
    const { db, project } = setupProject();
    const outcome = judgeQuantSubmission(db, project, 1, {
      toners: [0, 1, 2, 3, 4, 5, 6, 7],
    });
    expect("error" in outcome).toBe(false);
    if ("error" in outcome) return;
    expect(outcome.passed).toBe(true);
    expect(outcome.accuracy).toBe(1);
    expect(outcome.withinBudget).toBe(true);
    expect(outcome.passedStages).toEqual([1]);
  });

  it("fails a naive primary-color pick with a counterexample", () => {
    const { db, project } = setupProject([1]);
    // {K,R,Y,B} — the obvious "three primaries plus black" guess.
    const outcome = judgeQuantSubmission(db, project, 2, { toners: [0, 1, 3, 6] });
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(false);
    expect(outcome.counterexample).not.toBeNull();
    expect(outcome.counterexample!.collidedWith.length).toBeGreaterThan(0);
  });

  it("rejects malformed toner picks but accepts any well-formed subset", () => {
    const { db, project } = setupProject();
    // Stage 1 is pick mode: empty / out-of-range / non-integer are rejected…
    expect(judgeQuantSubmission(db, project, 1, { toners: [] })).toEqual({
      error: "invalid-toners",
      status: 400,
    });
    expect(judgeQuantSubmission(db, project, 1, { toners: [0, 1, 2, 9] })).toEqual({
      error: "invalid-toners",
      status: 400,
    });
    expect(judgeQuantSubmission(db, project, 1, { toners: [0, 1.5] })).toEqual({
      error: "invalid-toners",
      status: 400,
    });
    expect(judgeQuantSubmission(db, project, 1, { toners: "all" })).toEqual({
      error: "invalid-toners",
      status: 400,
    });
    // …but a small well-formed subset is judged normally (it just fails).
    const small = judgeQuantSubmission(db, project, 1, { toners: [0, 1, 2] });
    if ("error" in small) throw new Error(small.error);
    expect(small.withinBudget).toBe(true);
  });

  it("fails over-budget picks without an error", () => {
    const { db, project } = setupProject([1]);
    // Stage 2 allows 4 slots; loading 5 stays a valid submission but fails.
    const outcome = judgeQuantSubmission(db, project, 2, { toners: [0, 1, 2, 3, 4] });
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.withinBudget).toBe(false);
    expect(outcome.passed).toBe(false);
  });

  it("enforces stage order", () => {
    const { db, project } = setupProject([1]);
    const outcome = judgeQuantSubmission(db, project, 3, { toners: [0, 5, 6, 7] });
    expect(outcome).toEqual({ error: "stage-locked", status: 409 });
  });

  it("validates free-mode tables against shape, loadout and override budget", () => {
    const { db, project } = setupProject([1, 2, 3, 4]);
    const stage = getQuantStage(5)!;
    const defaults = nnTable(stage.fixedLoadout!);

    // Wrong length → invalid-table.
    expect(judgeQuantSubmission(db, project, 5, { table: defaults.slice(0, -1) })).toEqual({
      error: "invalid-table",
      status: 400,
    });

    // A toner outside the fixed loadout → toner-not-loaded.
    const offRack = [...defaults];
    offRack[0] = 5; // cyan is not in {R,O,G,B} = [1,2,4,6]
    expect(judgeQuantSubmission(db, project, 5, { table: offRack })).toEqual({
      error: "toner-not-loaded",
      status: 400,
    });

    // More than overrideBudget changes → judged but failed (over budget).
    const over = [...defaults];
    for (let s = 0; s < stage.overrideBudget! + 1; s += 1) {
      over[s] =
        defaults[s] === stage.fixedLoadout![0] ? stage.fixedLoadout![1] : stage.fixedLoadout![0];
    }
    expect(countOverrides(over, defaults)).toBe(stage.overrideBudget! + 1);
    const outcome = judgeQuantSubmission(db, project, 5, { table: over });
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.overrides).toBe(stage.overrideBudget! + 1);
    expect(outcome.withinBudget).toBe(false);
    expect(outcome.passed).toBe(false);
  });

  it("persists the submission snapshot and code", () => {
    const { db, project } = setupProject();
    const outcome = judgeQuantSubmission(
      db,
      project,
      1,
      { toners: [0, 1, 2, 3, 4, 5, 6, 7] },
      "def choose_toners(): ...",
    );
    if ("error" in outcome) throw new Error(outcome.error);
    const row = db.prepare("SELECT * FROM submissions WHERE id = ?").get(outcome.submissionId) as {
      snapshot_graph: string;
      passed: number;
    };
    expect(JSON.parse(row.snapshot_graph)).toMatchObject({
      mode: "pick",
      submission: { toners: [0, 1, 2, 3, 4, 5, 6, 7] },
      code: "def choose_toners(): ...",
    });
    expect(row.passed).toBe(1);
  });

  it("saves and sanitizes a stage draft", () => {
    const { db, project } = setupProject();
    saveQuantDraft(db, project, 2, { toners: [0, 1, 2, 5], code: "return [0,1,2,5]" });
    const row = db
      .prepare("SELECT draft_graph FROM student_projects WHERE id = ?")
      .get(project.id) as { draft_graph: string };
    expect(JSON.parse(row.draft_graph)["2"]).toEqual({
      toners: [0, 1, 2, 5],
      table: null,
      code: "return [0,1,2,5]",
    });
  });
});

/**
 * Calibration guard: every stage must be winnable on the *combined* gallery
 * (public + hidden seeds) and the designed trap behaviours must hold, so
 * fixture drift fails loudly here instead of in a classroom.
 */
describe("quantization judge gallery calibration", () => {
  it("hidden members differ from public ones at the palette level", () => {
    for (const stage of COLOR_QUANT_STAGES) {
      const gallery = judgeGalleryFor(stage.category);
      const signatures = new Set(gallery.map((e) => e.image.cells.join(",")));
      expect(signatures.size).toBe(gallery.length);
    }
  });

  it("pick stages each have passing subsets; stage 2 keeps the known answers", () => {
    for (const stageIndex of [1, 2, 3, 4]) {
      const stage = getQuantStage(stageIndex)!;
      const gallery = judgeGalleryFor(stage.category);
      const candidates = stageIndex === 1 ? [[0, 1, 2, 3, 4, 5, 6, 7]] : subsets(stage.tonerSlots!);
      const winners = candidates.filter(
        (t) => judgeMapping(gallery, nnTable(t)).accuracy >= stage.requiredAccuracy,
      );
      expect(winners.length).toBeGreaterThan(0);
      if (stageIndex === 2) {
        expect(winners).toEqual([
          [0, 1, 2, 5],
          [0, 3, 4, 5],
        ]);
      }
    }
  });

  it("stage 3 cannot be solved perfectly — the ceiling is below 100%", () => {
    const stage = getQuantStage(3)!;
    const gallery = judgeGalleryFor(stage.category);
    const best = Math.max(
      ...subsets(stage.tonerSlots!).map((t) => judgeMapping(gallery, nnTable(t)).accuracy),
    );
    expect(best).toBeLessThan(1);
    expect(best).toBeGreaterThanOrEqual(stage.requiredAccuracy);
  });

  it("stage 4: every subset containing magenta fails (the trap holds)", () => {
    const stage = getQuantStage(4)!;
    const gallery = judgeGalleryFor(stage.category);
    const magenta = 7;
    const trapped = subsets(stage.tonerSlots!).filter((t) => t.includes(magenta));
    expect(trapped.length).toBeGreaterThan(0);
    for (const t of trapped) {
      expect(judgeMapping(gallery, nnTable(t)).accuracy).toBeLessThan(stage.requiredAccuracy);
    }
  });

  it("stage 5: greedy overrides reach 100% within the override budget", () => {
    const stage = getQuantStage(5)!;
    const gallery = judgeGalleryFor(stage.category);
    const loadout = stage.fixedLoadout!;
    const defaults = nnTable(loadout);
    const table = [...defaults];
    const accuracyOf = (t: readonly number[]) => judgeMapping(gallery, t).accuracy;
    let acc = accuracyOf(table);
    while (acc < 1 && countOverrides(table, defaults) < stage.overrideBudget!) {
      let bestGain = 0;
      let bestS = -1;
      let bestT = -1;
      for (let s = 0; s < SOURCE_COLOR_COUNT; s += 1) {
        for (const t of [...loadout, -1]) {
          if (t === table[s]) continue;
          const trial = [...table];
          trial[s] = t;
          const gain = accuracyOf(trial) - acc;
          if (gain > bestGain) {
            bestGain = gain;
            bestS = s;
            bestT = t;
          }
        }
      }
      if (bestS < 0) break;
      table[bestS] = bestT;
      acc = accuracyOf(table);
    }
    expect(acc).toBe(1);
    expect(countOverrides(table, defaults)).toBeLessThanOrEqual(stage.overrideBudget!);
  });
});
