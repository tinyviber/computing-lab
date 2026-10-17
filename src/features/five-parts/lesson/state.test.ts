import { describe, expect, it } from "vitest";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";
import { initialStorage } from "../domain/storage.ts";
import {
  createFivePartsLessonState,
  draftOf,
  emptyDraft,
  sanitizeDraft,
  transitionFivePartsLesson,
} from "./state.ts";

describe("five-parts lesson state", () => {
  it("defaults to a=3, b=5, step 0", () => {
    const state = createFivePartsLessonState(1);
    expect(draftOf(state)).toEqual({
      a: 3,
      b: 5,
      step: 0,
      answer: null,
      storage: initialStorage(),
    });
  });

  it("changing an input clamps to a digit and restarts the demo", () => {
    let state = createFivePartsLessonState(1);
    state = transitionFivePartsLesson(state, { type: "set-step", step: 3 });
    state = transitionFivePartsLesson(state, { type: "set-input", field: "a", value: 12 });
    expect(draftOf(state).a).toBe(9);
    expect(draftOf(state).step).toBe(0);
    state = transitionFivePartsLesson(state, { type: "set-input", field: "b", value: -2 });
    expect(draftOf(state).b).toBe(0);
    expect(statusForStage(state.saveStatusByStage, 1)).toBe("dirty");
  });

  it("clamps the walkthrough step to 0–4", () => {
    let state = createFivePartsLessonState(1);
    state = transitionFivePartsLesson(state, { type: "set-step", step: 99 });
    expect(draftOf(state).step).toBe(4);
    state = transitionFivePartsLesson(state, { type: "set-step", step: -3 });
    expect(draftOf(state).step).toBe(0);
  });

  it("records the think answer and applies judge outcomes", () => {
    let state = createFivePartsLessonState(2);
    state = transitionFivePartsLesson(state, {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      drafts: {},
    });
    state = transitionFivePartsLesson(state, { type: "set-answer", optionId: "controller" });
    expect(draftOf(state).answer).toBe("controller");
    state = transitionFivePartsLesson(state, {
      type: "judge-result",
      outcome: {
        passed: true,
        stageIndex: 2,
        feedback: "正确。",
        submissionId: "sub-1",
        currentStage: 3,
        passedStages: [1, 2],
        parts: [{ id: "think-answer", label: "谁指挥运算器？", ok: true, detail: null }],
      },
    });
    expect(state.passedStages).toEqual([1, 2]);
    expect(state.verdicts[2]?.passed).toBe(true);
    // A new pick clears the stale verdict until its own reply lands.
    state = transitionFivePartsLesson(state, { type: "set-answer", optionId: "memory" });
    expect(state.verdicts[2]).toBeUndefined();
  });

  it("files a late verdict under its own page, never the one on screen", () => {
    let state = createFivePartsLessonState(1);
    state = transitionFivePartsLesson(state, {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      drafts: {},
    });
    state = transitionFivePartsLesson(state, { type: "select-stage", stageIndex: 3 });
    state = transitionFivePartsLesson(state, {
      type: "judge-result",
      outcome: {
        passed: false,
        stageIndex: 2,
        feedback: "再观察一下。",
        submissionId: "sub-2",
        currentStage: 2,
        passedStages: [1],
        parts: [],
      },
    });
    expect(state.stageIndex).toBe(3);
    expect(state.verdicts[3]).toBeUndefined();
    expect(state.verdicts[2]?.passed).toBe(false);
  });

  it("keeps the storage demo and phone steps on their own pages", () => {
    let state = createFivePartsLessonState(1);
    state = transitionFivePartsLesson(state, {
      type: "load-project",
      currentStage: 3,
      passedStages: [1],
      drafts: {},
    });
    expect(state.stageIndex).toBe(3);
    state = transitionFivePartsLesson(state, { type: "storage-op", op: "open" });
    state = transitionFivePartsLesson(state, { type: "storage-op", op: "write" });
    state = transitionFivePartsLesson(state, { type: "storage-op", op: "power-off" });
    expect(draftOf(state).storage).toMatchObject({ powerOn: false, saved: 1, open: null });
    expect(statusForStage(state.saveStatusByStage, 3)).toBe("dirty");

    state = transitionFivePartsLesson(state, { type: "select-stage", stageIndex: 4 });
    state = transitionFivePartsLesson(state, { type: "set-step", step: 99 });
    expect(draftOf(state).step).toBe(5);
    // The observe page's walkthrough is untouched by either page.
    expect(draftOf(state, 1).step).toBe(0);
  });

  it("keeps stage-2 locked until the observation is recorded", () => {
    let state = createFivePartsLessonState(1);
    state = transitionFivePartsLesson(state, { type: "select-stage", stageIndex: 2 });
    expect(state.stageIndex).toBe(1);
    state = transitionFivePartsLesson(state, {
      type: "judge-result",
      outcome: {
        passed: true,
        stageIndex: 1,
        feedback: null,
        submissionId: "sub-1",
        currentStage: 2,
        passedStages: [1],
        parts: [{ id: "observed", label: "完成四步观察", ok: true, detail: null }],
      },
    });
    state = transitionFivePartsLesson(state, { type: "select-stage", stageIndex: 2 });
    expect(state.stageIndex).toBe(2);
  });

  it("sanitizes junk drafts at the boundary", () => {
    expect(sanitizeDraft(null)).toEqual(emptyDraft());
    expect(sanitizeDraft({ a: 99, b: -1, step: 42, answer: 12 })).toEqual({
      a: 9,
      b: 0,
      step: 4,
      answer: null,
      storage: initialStorage(),
    });
    expect(sanitizeDraft({ a: "4", answer: "controller" })).toEqual({
      a: 4,
      b: 5,
      step: 0,
      answer: "controller",
      storage: initialStorage(),
    });
    // The phone page walks five steps, so its bound is per page.
    expect(sanitizeDraft({ step: 42 }, 4).step).toBe(5);
  });
});
