import { describe, expect, it } from "vitest";
import { createMachine, getProgram } from "../domain";
import { createProgramExecutionLessonState, transitionProgramExecutionLesson } from "./state";
import type { ProgramExecutionScenario } from "./scenario";

const scenario: ProgramExecutionScenario = { fixture: "sum-1-to-3" };

function reduce(
  state: ReturnType<typeof createProgramExecutionLessonState>,
  ...actions: Parameters<typeof transitionProgramExecutionLesson>[1][]
) {
  return actions.reduce(transitionProgramExecutionLesson, state);
}

describe("program execution lesson state", () => {
  it("keeps prediction separate and permits non-blocking execution", () => {
    const initial = createProgramExecutionLessonState(scenario);
    const predicted = reduce(
      initial,
      { type: "set-prediction-draft", value: "6" },
      { type: "record-prediction" },
      { type: "step" },
    );

    expect(predicted.prediction).toBe(6);
    expect(predicted.frames).toHaveLength(1);
    expect(predicted.machine.output).toEqual([]);
  });

  it("runs through the expected local trace without borrowing runProgram as an oracle", () => {
    const state = reduce(createProgramExecutionLessonState(scenario), { type: "run-all" });

    expect(state.machine.output).toEqual([6]);
    expect(state.machine.environment).toEqual({ total: 6, i: 4 });
    expect(state.machine.conditionChecks).toBe(4);
    expect(state.machine.iterationCount).toBe(3);
    expect(state.machine.status).toBe("completed");
    expect(state.frames.map((frame) => frame.sourceLine)).toEqual([
      1, 2, 3, 4, 5, 3, 4, 5, 3, 4, 5, 3, 7,
    ]);
    expect(state.frames[11].condition?.result).toBe(false);
    expect(state.frames[12].terminal?.reason).toBe("program-complete");
  });

  it("selects guided variable and stopping evidence only when present", () => {
    const initial = createProgramExecutionLessonState(scenario);
    const beforeExecution = reduce(
      initial,
      { type: "inspect-focus", focus: "variable-change" },
      { type: "inspect-focus", focus: "loop-stop" },
    );
    expect(beforeExecution.selectedFrameIndex).toBeUndefined();

    const running = reduce(
      initial,
      ...Array.from({ length: 5 }, () => ({ type: "step" as const })),
    );
    const variableFocus = reduce(running, { type: "inspect-focus", focus: "variable-change" });
    expect(variableFocus.selectedFrameIndex).toBe(3);

    const complete = reduce(running, { type: "run-all" });
    const stopFocus = reduce(complete, { type: "inspect-focus", focus: "loop-stop" });
    expect(stopFocus.selectedFrameIndex).toBe(11);

    const invalidSelection = reduce(stopFocus, { type: "select-frame", index: 999 });
    expect(invalidSelection).toEqual(stopFocus);
  });

  it("keeps zero-iteration focus behavior explicit", () => {
    const zero = reduce(
      createProgramExecutionLessonState(scenario),
      { type: "set-fixture", fixture: "zero-iterations" },
      { type: "run-all" },
    );

    const variableFocus = reduce(zero, { type: "inspect-focus", focus: "variable-change" });
    const stopFocus = reduce(zero, { type: "inspect-focus", focus: "loop-stop" });
    expect(variableFocus.selectedFrameIndex).toBe(3);
    expect(stopFocus.selectedFrameIndex).toBe(2);
  });

  it("clears transient state on fixture changes and resets to the URL baseline", () => {
    const completed = reduce(
      createProgramExecutionLessonState(scenario),
      { type: "set-prediction-draft", value: "6" },
      { type: "record-prediction" },
      { type: "run-all" },
      { type: "set-fixture", fixture: "zero-iterations" },
    );
    expect(completed.fixture).toBe("zero-iterations");
    expect(completed.frames).toEqual([]);
    expect(completed.prediction).toBeUndefined();
    expect(completed.machine.status).toBe("running");

    const reset = reduce(completed, { type: "reset" });
    expect(reset.fixture).toBe("sum-1-to-3");
    expect(reset.initialScenario).toEqual(scenario);
    expect(reset.frames).toEqual([]);
  });

  it("rejects blank, non-integer, and unsafe prediction input without changing execution", () => {
    const initial = createProgramExecutionLessonState(scenario);
    for (const value of ["", "6.5", String(Number.MAX_SAFE_INTEGER + 1)]) {
      const invalid = reduce(
        initial,
        { type: "set-prediction-draft", value },
        { type: "record-prediction" },
      );
      expect(invalid.prediction).toBeUndefined();
      expect(invalid.predictionMessage).toMatch(/whole-number/i);
      expect(invalid.machine).toEqual(initial.machine);
      expect(invalid.frames).toEqual([]);
    }
  });

  it("does not append frames or output after completion, and repeated run is idempotent", () => {
    const complete = reduce(createProgramExecutionLessonState(scenario), { type: "run-all" });
    const afterStep = reduce(complete, { type: "step" });
    const afterRun = reduce(complete, { type: "run-all" });

    expect(afterStep).toEqual(complete);
    expect(afterRun).toEqual(complete);
  });

  it("keeps step-limit and runtime-error terminal states idempotent", () => {
    const program = getProgram("sum-1-to-3");
    const base = createProgramExecutionLessonState(scenario);
    const limitState = {
      ...base,
      machine: { ...createMachine(program), stepCount: 64 },
    };
    const runtimeState = {
      ...base,
      machine: {
        ...createMachine(program),
        status: "runtime-error" as const,
        terminal: {
          reason: "runtime-error" as const,
          sourceLine: 1,
          kind: "undefined-variable" as const,
          variable: "missing",
          message: "missing is undefined at this statement.",
        },
      },
    };

    const limited = reduce(limitState, { type: "step" });
    expect(limited.machine.status).toBe("step-limit");
    expect(reduce(limited, { type: "step" })).toBe(limited);
    expect(reduce(runtimeState, { type: "step" })).toBe(runtimeState);
  });
});
