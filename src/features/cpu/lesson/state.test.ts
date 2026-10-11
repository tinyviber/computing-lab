import { describe, expect, it } from "vitest";
import { publicCasesFor } from "./publicCases.ts";
import {
  createCpuLessonState,
  draftOf,
  guidedComplete,
  programOf,
  transitionCpuLesson,
  type CpuLessonState,
} from "./state.ts";
import type { CpuDraft } from "../domain/protocol.ts";
import { seedFor } from "../domain/rng.ts";

const base = (): CpuLessonState => createCpuLessonState(1);
/** A free (non-guided) challenge stage for editing tests. */
const freeStage = (): CpuLessonState => createCpuLessonState(7);

describe("cpu lesson state", () => {
  it("guided stage 1 ships a fixed program the learner cannot edit", () => {
    let state = base();
    expect(programOf(state)).toEqual([
      { op: "LOAD", reg: 0, operand: 14 },
      { op: "STORE", reg: 0, operand: 15 },
      { op: "HALT", reg: 0, operand: 0 },
    ]);
    state = transitionCpuLesson(state, { type: "set-row", index: 0, patch: { operand: 15 } });
    state = transitionCpuLesson(state, { type: "insert-row", index: 1 });
    state = transitionCpuLesson(state, { type: "remove-row", index: 0 });
    expect(programOf(state)).toEqual([
      { op: "LOAD", reg: 0, operand: 14 },
      { op: "STORE", reg: 0, operand: 15 },
      { op: "HALT", reg: 0, operand: 0 },
    ]);
    expect(state.saveStatus).toBe("idle");
  });

  it("guided normalization keeps only the editable slots from a draft", () => {
    let state = createCpuLessonState(2);
    state = transitionCpuLesson(state, {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      drafts: {
        // A hostile draft: wrong op on the editable row, a mutated locked
        // row, and an extra row — only the editable slot survives.
        2: {
          rows: [
            { op: "HALT", reg: 0, operand: 0 },
            { op: "STORE", reg: 0, operand: 15 },
            { op: "HALT", reg: 0, operand: 0 },
            { op: "JMP", reg: 0, operand: 9 },
          ],
        },
      },
      calculatorCoreComplete: true,
    });
    expect(programOf(state)).toEqual([
      { op: "LOAD", reg: 0, operand: 14 },
      { op: "STORE", reg: 0, operand: 15 },
      { op: "HALT", reg: 0, operand: 0 },
    ]);
  });

  it("guided prompts answer once, gate on completion, and flag wrong picks", () => {
    let state = base();
    expect(guidedComplete(state)).toBe(false);
    // A wrong pick marks the option without answering the prompt.
    state = transitionCpuLesson(state, {
      type: "answer-prompt",
      promptId: "first-fetch",
      option: 1,
    });
    expect(state.wrongPick).toEqual({ promptId: "first-fetch", option: 1 });
    expect(guidedComplete(state)).toBe(false);
    // Correct picks accumulate until every prompt is answered.
    const prompts = ["first-fetch", "first-action", "pc-advance", "store-target", "halt-end"];
    for (const promptId of prompts) {
      state = transitionCpuLesson(state, { type: "answer-prompt", promptId, option: 0 });
    }
    expect(state.wrongPick).toBeNull();
    expect(guidedComplete(state)).toBe(true);
    // Re-answering is idempotent.
    const size = Object.keys(state.guidedAnswers[1]).length;
    state = transitionCpuLesson(state, {
      type: "answer-prompt",
      promptId: "first-fetch",
      option: 0,
    });
    expect(Object.keys(state.guidedAnswers[1])).toHaveLength(size);
    // Free stages are always complete.
    expect(guidedComplete(freeStage())).toBe(true);
  });

  it("keeps byte-gated prompts shut until the playground byte is dialed", () => {
    // C4's playground starts on the program's own first byte, not 224.
    let state = createCpuLessonState(4);
    expect(state.playgroundByte).toBe(0b00001110);
    for (const promptId of ["opcode-field", "decode-000", "operand-field"]) {
      state = transitionCpuLesson(state, { type: "answer-prompt", promptId, option: 0 });
    }
    // byte-224 asks for 11100000 — answers are ignored until then.
    state = transitionCpuLesson(state, {
      type: "answer-prompt",
      promptId: "byte-224",
      option: 0,
    });
    expect(state.guidedAnswers[4]?.["byte-224"]).toBeUndefined();
    state = transitionCpuLesson(state, { type: "set-byte", value: 0b11100000 });
    state = transitionCpuLesson(state, {
      type: "answer-prompt",
      promptId: "byte-224",
      option: 0,
    });
    expect(state.guidedAnswers[4]["byte-224"]).toBe(0);
  });

  it("edits rows and marks the draft dirty on free stages", () => {
    let state = freeStage();
    state = transitionCpuLesson(state, { type: "insert-row", index: 0 });
    state = transitionCpuLesson(state, { type: "insert-row", index: 1 });
    state = transitionCpuLesson(state, {
      type: "set-row",
      index: 0,
      patch: { op: "LOAD", operand: 14 },
    });
    state = transitionCpuLesson(state, {
      type: "set-row",
      index: 1,
      patch: { op: "STORE", operand: 15 },
    });
    expect(draftOf(state).rows).toHaveLength(2);
    expect(state.saveStatus).toBe("dirty");
    state = transitionCpuLesson(state, { type: "move-row", index: 0, dir: 1 });
    expect(draftOf(state).rows[0].op).toBe("STORE");
    state = transitionCpuLesson(state, { type: "remove-row", index: 0 });
    expect(draftOf(state).rows).toHaveLength(1);
    expect(draftOf(state).rows[0].op).toBe("LOAD");
  });

  it("retargets jump operands when rows move and reports the notice", () => {
    let state = freeStage();
    // Program: LOAD, JMP →2, HALT, LDI — the JMP targets the HALT row.
    for (const [i, patch] of [
      [0, { op: "LOAD", operand: 14 }],
      [1, { op: "JMP", operand: 2 }],
      [2, { op: "HALT", operand: 0 }],
      [3, { op: "LDI", operand: 7 }],
    ] as [number, { op: "LOAD" | "JMP" | "HALT" | "LDI"; operand: number }][]) {
      state = transitionCpuLesson(state, { type: "insert-row", index: i });
      state = transitionCpuLesson(state, { type: "set-row", index: i, patch });
    }
    // Inserting above the JMP shifts its target forward.
    state = transitionCpuLesson(state, { type: "insert-row", index: 0 });
    expect(draftOf(state).rows[2].operand).toBe(3);
    expect(state.message).toContain("跳转地址 2 → 3");
    // Removing the inserted row restores the target.
    state = transitionCpuLesson(state, { type: "remove-row", index: 0 });
    expect(draftOf(state).rows[1].operand).toBe(2);
    // Moving the target row itself retargets the jump.
    state = transitionCpuLesson(state, { type: "move-row", index: 2, dir: 1 });
    expect(draftOf(state).rows[1].operand).toBe(3);
    // Operands pointing at data cells (≥ row count) are physical addresses —
    // they stay put when rows shift.
    state = transitionCpuLesson(state, {
      type: "set-row",
      index: 1,
      patch: { operand: 9 },
    });
    state = transitionCpuLesson(state, { type: "insert-row", index: 0 });
    expect(draftOf(state).rows[2].operand).toBe(9);
  });

  it("warns when the deleted row was a jump target", () => {
    let state = freeStage();
    // Program: JMP →1, HALT, HALT — deleting row 1 leaves the jump
    // pointing at what used to be the next row; that must not be silent.
    for (const [i, patch] of [
      [0, { op: "JMP", operand: 1 }],
      [1, { op: "HALT", operand: 0 }],
      [2, { op: "HALT", operand: 0 }],
    ] as [number, { op: "JMP" | "HALT"; operand: number }][]) {
      state = transitionCpuLesson(state, { type: "insert-row", index: i });
      state = transitionCpuLesson(state, { type: "set-row", index: i, patch });
    }
    state = transitionCpuLesson(state, { type: "remove-row", index: 1 });
    expect(draftOf(state).rows[0].operand).toBe(1); // now the row that followed
    expect(state.message).toContain("跳转的目标");
    expect(state.message).toContain("下一行");
  });

  it("drops malformed rows at the boundary", () => {
    let state = freeStage();
    state = transitionCpuLesson(state, {
      type: "load-project",
      currentStage: 7,
      passedStages: [5],
      drafts: {
        7: {
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
    let state = createCpuLessonState(2);
    state = transitionCpuLesson(state, {
      type: "load-project",
      currentStage: 2,
      passedStages: [1],
      drafts: {},
      calculatorCoreComplete: true,
    });
    const cases = publicCasesFor(2, seedFor("u", "cpu", 2));
    state = transitionCpuLesson(state, { type: "run-public-tests", cases });
    // The blank placeholder row (LOAD A,M[0]) can't satisfy the copy
    // contract — nothing writes M[15].
    expect(state.runOutcome?.score).toBe(0);
    state = transitionCpuLesson(state, {
      type: "set-row",
      index: 1,
      patch: { op: "STORE", operand: 15 },
    });
    state = transitionCpuLesson(state, { type: "run-public-tests", cases });
    expect(state.runOutcome?.score).toBe(2);
    expect(state.runOutcome?.total).toBe(2);
    expect(state.runOutcome?.results[0].passed).toBe(true);
  });
});
