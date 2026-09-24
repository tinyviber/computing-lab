import { describe, expect, it } from "vitest";
import { publicCasesFor } from "./publicCases.ts";
import {
  createCpuLessonState,
  draftOf,
  programOf,
  transitionCpuLesson,
  type CpuLessonState,
} from "./state.ts";
import type { CpuDraft } from "../domain/protocol.ts";
import { seedFor } from "../domain/rng.ts";

const base = (): CpuLessonState => createCpuLessonState(1);

describe("cpu lesson state", () => {
  it("prefills the editor from the stage's scaffold rows", () => {
    const state = base();
    expect(programOf(state)[0]).toEqual({ op: "LOAD", reg: 0, operand: 14 });
  });

  it("edits rows and marks the draft dirty", () => {
    let state = base();
    state = transitionCpuLesson(state, { type: "set-row", index: 0, patch: { operand: 15 } });
    expect(draftOf(state).rows[0].operand).toBe(15);
    expect(state.saveStatus).toBe("dirty");
    state = transitionCpuLesson(state, { type: "insert-row", index: 1 });
    expect(draftOf(state).rows).toHaveLength(2);
    state = transitionCpuLesson(state, {
      type: "set-row",
      index: 1,
      patch: { op: "STORE", operand: 15 },
    });
    state = transitionCpuLesson(state, { type: "move-row", index: 0, dir: 1 });
    expect(draftOf(state).rows[0].op).toBe("STORE");
    state = transitionCpuLesson(state, { type: "remove-row", index: 0 });
    expect(draftOf(state).rows).toHaveLength(1);
    expect(draftOf(state).rows[0].op).toBe("LOAD");
  });

  it("drops malformed rows at the boundary", () => {
    let state = base();
    state = transitionCpuLesson(state, {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      drafts: {
        1: {
          rows: [
            { op: "HAX", reg: 9, operand: 99 },
            { op: "HALT", reg: 0, operand: 0 },
          ],
        } as unknown as CpuDraft,
      },
      calculatorCoreComplete: true,
    });
    expect(draftOf(state).rows).toEqual([{ op: "HALT", reg: 0, operand: 0 }]);
  });

  it("lands on the first unlocked stage and refuses locked jumps", () => {
    let state = base();
    state = transitionCpuLesson(state, {
      type: "load-project",
      currentStage: 3,
      passedStages: [1, 2],
      drafts: {},
      calculatorCoreComplete: true,
    });
    expect(state.stageIndex).toBe(3);
    state = transitionCpuLesson(state, { type: "select-stage", stageIndex: 4 });
    expect(state.stageIndex).toBe(3); // stage 4 is still locked
    state = transitionCpuLesson(state, { type: "select-stage", stageIndex: 1 });
    expect(state.stageIndex).toBe(1);
  });

  it("runs public cases and reports the tally", () => {
    let state = base();
    const cases = publicCasesFor(1, seedFor("u", "cpu", 1));
    state = transitionCpuLesson(state, { type: "run-public-tests", cases });
    // The prefill (LOAD A,M[14]) alone can't satisfy the copy contract — it
    // stops after two cycles without STORE/HALT: rows end → ran-off.
    expect(state.runOutcome?.score).toBe(0);
    state = transitionCpuLesson(state, { type: "insert-row", index: 1 });
    state = transitionCpuLesson(state, {
      type: "set-row",
      index: 1,
      patch: { op: "STORE", operand: 15 },
    });
    state = transitionCpuLesson(state, { type: "insert-row", index: 2 });
    state = transitionCpuLesson(state, { type: "set-row", index: 2, patch: { op: "HALT" } });
    state = transitionCpuLesson(state, { type: "run-public-tests", cases });
    expect(state.runOutcome?.score).toBe(2);
    expect(state.runOutcome?.total).toBe(2);
    expect(state.runOutcome?.results[0].passed).toBe(true);
  });
});
