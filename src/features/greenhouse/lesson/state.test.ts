/**
 * Lesson-state tests for the greenhouse lab: project load, copy-forward
 * prefill, draft sanitize, dirty flags, and the preview/judge outcomes the
 * UI reads back.
 */

import { describe, expect, it } from "vitest";
import type { GhDraft, GhJudgeResult } from "../domain/protocol.ts";
import { publicCasesFor } from "./publicCases.ts";
import { createGhLabState, draftOf, stageOf, transitionGhLab, type GhLabState } from "./state.ts";

const WIDE: GhDraft = {
  rules: [
    {
      when: { kind: "leaf", sensor: "airTemp", op: "<=", value: 195 },
      actuator: "heater",
      set: "on",
    },
    {
      when: { kind: "leaf", sensor: "airTemp", op: ">=", value: 215 },
      actuator: "heater",
      set: "off",
    },
    { when: { kind: "leaf", sensor: "airTemp", op: ">=", value: 280 }, actuator: "fan", set: "on" },
    {
      when: { kind: "leaf", sensor: "airTemp", op: "<=", value: 245 },
      actuator: "fan",
      set: "off",
    },
  ],
};

const loaded = (over: Partial<GhLabState> = {}): GhLabState => ({
  ...createGhLabState(1),
  ...over,
});

describe("greenhouse lesson state", () => {
  it("loads a project and resumes at its current stage", () => {
    const state = transitionGhLab(createGhLabState(1), {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      drafts: { 2: WIDE },
    });
    expect(state.currentStage).toBe(2);
    expect(state.stageIndex).toBe(2);
    expect(state.passedStages).toEqual([1]);
    expect(draftOf(state, 2).rules).toHaveLength(4);
  });

  it("locks out-of-order stages until the previous one passes", () => {
    let state = createGhLabState(1);
    state = transitionGhLab(state, { type: "select-stage", stageIndex: 3 });
    expect(state.stageIndex).toBe(1);
    state = transitionGhLab(state, {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      drafts: {},
    });
    // Stage 3 still needs stage 2 passed.
    state = transitionGhLab(state, { type: "select-stage", stageIndex: 3 });
    expect(state.stageIndex).toBe(2);
    state = transitionGhLab(state, { type: "select-stage", stageIndex: 1 });
    expect(state.stageIndex).toBe(1);
    state = transitionGhLab(state, {
      type: "load-project",
      currentStage: 3,
      passedStages: [1, 2],
      drafts: {},
    });
    state = transitionGhLab(state, { type: "select-stage", stageIndex: 3 });
    expect(state.stageIndex).toBe(3);
  });

  it("copy-forwards the previous stage's draft into an empty one", () => {
    let state = transitionGhLab(createGhLabState(1), {
      type: "load-project",
      currentStage: 3,
      passedStages: [1, 2],
      drafts: { 2: WIDE },
    });
    state = transitionGhLab(state, { type: "select-stage", stageIndex: 3 });
    const draft = draftOf(state, 3);
    expect(draft.rules).toEqual(WIDE.rules);
    // Deep copy — mutating the copy must not touch the stage-2 draft.
    expect(draft.rules).not.toBe(state.drafts[2].rules);
    expect(state.saveStatus).toBe("dirty");
  });

  it("never overwrites an existing draft on copy-forward", () => {
    const own: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">", value: 260 },
          actuator: "fan",
          set: "on",
        },
      ],
    };
    let state = transitionGhLab(createGhLabState(1), {
      type: "load-project",
      currentStage: 3,
      passedStages: [1, 2],
      drafts: { 2: WIDE, 3: own },
    });
    state = transitionGhLab(state, { type: "select-stage", stageIndex: 3 });
    expect(draftOf(state, 3).rules).toEqual(own.rules);
  });

  it("edits mark the draft dirty and clear the last judge outcome", () => {
    let state = loaded({ judgeOutcome: fakeOutcome(true) });
    state = transitionGhLab(state, { type: "select-stage", stageIndex: 2 });
    state = transitionGhLab(state, { type: "set-rules", rules: WIDE.rules ?? [] });
    expect(state.saveStatus).toBe("dirty");
    expect(state.judgeOutcome).toBeNull();
    state = transitionGhLab(state, { type: "mark-saving" });
    state = transitionGhLab(state, { type: "mark-saved" });
    expect(state.saveStatus).toBe("saved");
  });

  it("sanitizes drafts crossing the lesson boundary", () => {
    let state = transitionGhLab(createGhLabState(1), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: {
        1: {
          setpoint: 99,
          rules: [
            {
              when: { kind: "leaf", sensor: "airTemp", op: "<", value: 600 },
              actuator: "fan",
              set: "on",
            },
          ],
        },
      },
    });
    state = { ...state };
    const draft = draftOf(state, 1);
    expect(draft.setpoint).toBe(28);
    expect(draft.rules ?? []).toEqual([]);
  });

  it("run-preview produces a verdict on the current draft", () => {
    let state = loaded();
    const c = publicCasesFor(1)[0];
    state = transitionGhLab(state, { type: "run-preview", testCase: c });
    expect(state.runOutcome?.caseName).toBe(c.name);
    expect(state.runOutcome?.verdict.passed).toBe(true);
    expect(state.runOutcome?.run.trace).toHaveLength(96);
  });

  it("judge-result advances the stage ladder on pass", () => {
    let state = loaded();
    state = transitionGhLab(state, { type: "judge-result", outcome: fakeOutcome(true) });
    expect(state.passedStages).toEqual([1]);
    expect(state.currentStage).toBe(2);
    // The view stays on the passed stage — the rail offers the next one.
    expect(state.stageIndex).toBe(1);
    const fail = transitionGhLab(state, { type: "judge-result", outcome: fakeOutcome(false, 2) });
    expect(fail.passedStages).toEqual([1]);
    expect(fail.currentStage).toBe(2);
    expect(fail.stageIndex).toBe(1);
  });
});

function fakeOutcome(passed: boolean, stageIndex = 1): GhJudgeResult {
  return {
    score: passed ? 2 : 1,
    total: 2,
    passed,
    submissionId: "7",
    currentStage: passed ? stageIndex + 1 : stageIndex,
    passedStages: passed ? [stageIndex] : [stageIndex - 1].filter((i) => i > 0),
    unlockedComponent: null,
    testSummary: {
      categories: {},
      results: [],
      counterexample: null,
      error: null,
    },
  };
}
