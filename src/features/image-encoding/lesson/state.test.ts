import { describe, expect, it } from "vitest";
import { parseImageEncodingScenario } from "./scenario";
import {
  createImageLessonState,
  imageDraft,
  transitionImageLesson,
  type ImageLessonState,
} from "./state";

function state(query = "") {
  return createImageLessonState(parseImageEncodingScenario(query));
}

function pass(current: ImageLessonState, stageIndex: number): ImageLessonState {
  return transitionImageLesson(current, { type: "mark-stage-passed", stageIndex, detail: "ok" });
}

describe("image restoration lesson state", () => {
  it("starts from a reproducible artifact without progress", () => {
    expect(state()).toMatchObject({
      requestedStageIndex: 1,
      stageIndex: 1,
      passedStages: [],
      artifact: { image: "photo", resStop: 50, colorStop: "palette4" },
      core1Bits: "",
      conventionRevealed: false,
      restoreObservation: "",
      hallucinationClicks: [],
      saveStatus: "idle",
      stageOutcome: null,
    });
    expect(state().core3Original).toEqual(state().core3Edited);
    expect(state().core3Original).toMatchObject({ width: 16, height: 16 });
  });

  it("does not let a challenge deep link bypass progress", () => {
    expect(state("stage=4")).toMatchObject({ requestedStageIndex: 4, stageIndex: 1 });
    const unlocked = transitionImageLesson(state("stage=4"), {
      type: "load-project",
      passedStages: [3, 1, 2, 2, 99],
      artifact: { image: "photo", resStop: 25, colorStop: "rgb24" },
    });
    expect(unlocked.stageIndex).toBe(4);
    expect(unlocked.passedStages).toEqual([1, 2, 3]);
  });

  it("keeps core stages open and gates challenges", () => {
    const initial = state();
    expect(transitionImageLesson(initial, { type: "select-stage", stageIndex: 3 }).stageIndex).toBe(
      3,
    );
    const locked = transitionImageLesson(initial, { type: "select-stage", stageIndex: 4 });
    expect(locked.stageIndex).toBe(1);
    expect(locked.message).toContain("三个主线关卡");

    let completed = pass(pass(pass(initial, 1), 2), 3);
    completed = transitionImageLesson(completed, { type: "select-stage", stageIndex: 5 });
    expect(completed.stageIndex).toBe(5);
  });

  it("normalizes bit entry to 16 binary digits", () => {
    const changed = transitionImageLesson(state(), {
      type: "set-core1-bits",
      bits: "01 11-x0101010110011111",
    });
    expect(changed.core1Bits).toBe("0111010101011001");
    expect(changed.saveStatus).toBe("dirty");
  });

  it("changes only legal artifact stops, resets Core 3, and revokes dependent passes", () => {
    let changed = pass(pass(pass(state(), 1), 2), 3);
    changed = transitionImageLesson(changed, {
      type: "edit-core3-pixel",
      x: 0,
      y: 0,
      color: {
        r: 0,
        g: 0,
        b: 0,
      },
    });
    expect(changed.core3Edited).not.toEqual(changed.core3Original);
    changed = transitionImageLesson(changed, { type: "set-resolution-stop", resStop: 25 });
    expect(changed.artifact.resStop).toBe(25);
    expect(changed.passedStages).toEqual([1]);
    expect(changed.core3Edited).toEqual(changed.core3Original);
    changed = transitionImageLesson(changed, { type: "set-color-stop", colorStop: "gray8" });
    expect(changed.artifact.colorStop).toBe("gray8");
  });

  it("clamps edited colors and ignores out-of-window coordinates", () => {
    const initial = state();
    const ignored = transitionImageLesson(initial, {
      type: "edit-core3-pixel",
      x: 99,
      y: 99,
      color: { r: 1, g: 2, b: 3 },
    });
    expect(ignored).toBe(initial);
    const edited = transitionImageLesson(initial, {
      type: "edit-core3-pixel",
      x: 0,
      y: 0,
      color: { r: -10, g: 999, b: Number.NaN },
    });
    expect(edited.core3Edited.pixels[0]).toEqual({ r: 0, g: 255, b: 0 });
    expect(transitionImageLesson(edited, { type: "reset-core3" }).core3Edited).toEqual(
      initial.core3Original,
    );
  });

  it("records stage passes once and keeps a local outcome", () => {
    let current = pass(state(), 1);
    current = pass(current, 1);
    expect(current.passedStages).toEqual([1]);
    expect(current.stageOutcome).toEqual({ stageIndex: 1, passed: true, detail: "ok" });
    expect(current.saveStatus).toBe("dirty");
  });

  it("loads a saved draft and discards a mismatched edit raster", () => {
    const initial = state("stage=3");
    const loaded = transitionImageLesson(initial, {
      type: "load-project",
      passedStages: [1],
      artifact: { image: "photo", resStop: 25, colorStop: "gray8" },
      draft: {
        core1Bits: "01xx11",
        conventionRevealed: true,
        core3Edited: { ...initial.core3Edited, width: 2 },
        restoreObservation: "观察",
        hallucinationClicks: [{ x: 2, y: 3 }],
      },
    });
    expect(loaded).toMatchObject({
      stageIndex: 3,
      passedStages: [1],
      core1Bits: "0111",
      conventionRevealed: true,
      restoreObservation: "观察",
      hallucinationClicks: [{ x: 2, y: 3 }],
      saveStatus: "idle",
    });
    expect(loaded.core3Edited).toEqual(loaded.core3Original);
  });

  it("revokes artifact-dependent passes when a URL scenario swaps the artifact", () => {
    let current = pass(pass(pass(state(), 1), 2), 3);
    current = transitionImageLesson(current, {
      type: "load-scenario",
      scenario: parseImageEncodingScenario("stage=3&image=gradient&res=10&colors=rgb24"),
    });
    // Core 1 is artifact-independent; Core 2/3 passes belonged to the old artifact.
    expect(current.passedStages).toEqual([1]);
    expect(current.stageIndex).toBe(3);
    expect(current.artifact).toEqual({ image: "gradient", resStop: 10, colorStop: "rgb24" });

    current = transitionImageLesson(current, {
      type: "load-scenario",
      scenario: parseImageEncodingScenario("stage=3&image=gradient&res=10&colors=rgb24"),
    });
    expect(current.passedStages).toEqual([1]);
  });

  it("keeps server passes only when they were earned under the loaded artifact", () => {
    const initial = state();
    const earned = { image: "photo" as const, resStop: 25 as const, colorStop: "gray8" as const };
    const kept = transitionImageLesson(initial, {
      type: "load-project",
      passedStages: [1, 2, 3],
      artifact: earned,
      passedArtifact: earned,
    });
    expect(kept.passedStages).toEqual([1, 2, 3]);

    // A URL artifact overrides the server draft: the server's Core 2/3 passes
    // were earned under a different artifact and must not unlock challenges.
    const overridden = transitionImageLesson(initial, {
      type: "load-project",
      passedStages: [1, 2, 3],
      artifact: { image: "gradient", resStop: 50, colorStop: "palette8" },
      passedArtifact: earned,
    });
    expect(overridden.artifact).toEqual({ image: "gradient", resStop: 50, colorStop: "palette8" });
    expect(overridden.passedStages).toEqual([1]);
  });

  it("bounds free text and click history", () => {
    let current = transitionImageLesson(state(), {
      type: "set-restore-observation",
      observation: "x".repeat(1200),
    });
    for (let index = 0; index < 25; index += 1) {
      current = transitionImageLesson(current, {
        type: "add-hallucination-click",
        x: index,
        y: index,
      });
    }
    expect(current.restoreObservation).toHaveLength(1000);
    expect(current.hallucinationClicks).toHaveLength(20);
    expect(current.hallucinationClicks[0]).toEqual({ x: 5, y: 5 });
    expect(
      transitionImageLesson(current, {
        type: "add-hallucination-click",
        x: Number.NaN,
        y: 0,
      }),
    ).toBe(current);
  });

  it("resets only the active stage's work", () => {
    let current = transitionImageLesson(state(), { type: "set-core1-bits", bits: "1111" });
    current = transitionImageLesson(current, { type: "reveal-convention", revealed: true });
    expect(transitionImageLesson(current, { type: "reset-stage" })).toMatchObject({
      core1Bits: "",
      conventionRevealed: false,
    });

    current = transitionImageLesson(state("stage=3"), {
      type: "edit-core3-pixel",
      x: 0,
      y: 0,
      color: { r: 0, g: 0, b: 0 },
    });
    expect(transitionImageLesson(current, { type: "reset-stage" }).core3Edited).toEqual(
      current.core3Original,
    );
  });

  it("serializes only draft-owned fields", () => {
    const current = transitionImageLesson(state(), { type: "set-core1-bits", bits: "0101" });
    expect(imageDraft(current)).toEqual({
      core1Bits: "0101",
      conventionRevealed: false,
      core3Edited: current.core3Edited,
      restoreObservation: "",
      hallucinationCaseId: undefined,
      hallucinationClicks: [],
    });
  });
});
