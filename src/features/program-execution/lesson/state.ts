import {
  createMachine,
  getProgram,
  stepProgram,
  type ExecutionFrame,
  type ExecutionMachine,
  type ProgramId,
} from "../domain";
import type { ProgramExecutionScenario } from "./scenario";

export type ProgramExecutionFocus = "variable-change" | "loop-stop";

export type ProgramExecutionLessonState = {
  initialScenario: ProgramExecutionScenario;
  fixture: ProgramId;
  machine: ExecutionMachine;
  frames: ExecutionFrame[];
  selectedFrameIndex?: number;
  predictionDraft: string;
  prediction?: number;
  predictionMessage?: string;
};

export type ProgramExecutionLessonAction =
  | { type: "load-scenario"; scenario: ProgramExecutionScenario }
  | { type: "set-fixture"; fixture: ProgramId }
  | { type: "set-prediction-draft"; value: string }
  | { type: "record-prediction" }
  | { type: "step" }
  | { type: "run-all" }
  | { type: "select-frame"; index: number }
  | { type: "inspect-focus"; focus: ProgramExecutionFocus }
  | { type: "reset" };

function cloneScenario(scenario: ProgramExecutionScenario): ProgramExecutionScenario {
  return { ...scenario };
}

function createStateForFixture(
  initialScenario: ProgramExecutionScenario,
  fixture: ProgramId,
): ProgramExecutionLessonState {
  return {
    initialScenario: cloneScenario(initialScenario),
    fixture,
    machine: createMachine(getProgram(fixture)),
    frames: [],
    selectedFrameIndex: undefined,
    predictionDraft: "",
    prediction: undefined,
    predictionMessage: undefined,
  };
}

export function createProgramExecutionLessonState(
  scenario: ProgramExecutionScenario,
): ProgramExecutionLessonState {
  return createStateForFixture(scenario, scenario.fixture);
}

function selectFrame(
  state: ProgramExecutionLessonState,
  index: number,
): ProgramExecutionLessonState {
  if (!Number.isInteger(index) || index < 0 || index >= state.frames.length) return state;
  return { ...state, selectedFrameIndex: index };
}

function focusFrameIndex(
  frames: readonly ExecutionFrame[],
  focus: ProgramExecutionFocus,
): number | undefined {
  if (focus === "variable-change") {
    return frames.findIndex(
      (frame) => frame.eventKind === "assignment" && frame.before.control.kind === "loop-body",
    ) >= 0
      ? frames.findIndex(
          (frame) => frame.eventKind === "assignment" && frame.before.control.kind === "loop-body",
        )
      : undefined;
  }
  const index = frames.findIndex(
    (frame) => frame.eventKind === "while-condition" && frame.condition?.result === false,
  );
  return index >= 0 ? index : undefined;
}

function advanceOne(state: ProgramExecutionLessonState): ProgramExecutionLessonState {
  const result = stepProgram(state.machine, getProgram(state.fixture));
  if (!result.frame) return state;
  return {
    ...state,
    machine: result.machine,
    frames: [...state.frames, result.frame],
    selectedFrameIndex: result.frame.index,
  };
}

function advanceAll(state: ProgramExecutionLessonState): ProgramExecutionLessonState {
  let next = state;
  while (next.machine.status === "running") {
    const advanced = advanceOne(next);
    if (advanced === next) break;
    next = advanced;
  }
  return next;
}

export function transitionProgramExecutionLesson(
  state: ProgramExecutionLessonState,
  action: ProgramExecutionLessonAction,
): ProgramExecutionLessonState {
  switch (action.type) {
    case "load-scenario":
      return createProgramExecutionLessonState(action.scenario);
    case "set-fixture":
      return createStateForFixture(state.initialScenario, action.fixture);
    case "set-prediction-draft":
      return { ...state, predictionDraft: action.value, predictionMessage: undefined };
    case "record-prediction": {
      const raw = state.predictionDraft.trim();
      const value = Number(raw);
      if (!raw || !Number.isSafeInteger(value)) {
        return {
          ...state,
          prediction: undefined,
          predictionMessage:
            "Enter a safe whole-number prediction, or leave it blank to observe first.",
        };
      }
      return {
        ...state,
        prediction: value,
        predictionMessage: "Prediction recorded; execution remains open.",
      };
    }
    case "step":
      return advanceOne(state);
    case "run-all":
      return advanceAll(state);
    case "select-frame":
      return selectFrame(state, action.index);
    case "inspect-focus": {
      const index = focusFrameIndex(state.frames, action.focus);
      return index === undefined ? state : { ...state, selectedFrameIndex: index };
    }
    case "reset":
      return createProgramExecutionLessonState(state.initialScenario);
  }
}

export const programExecutionReducer = transitionProgramExecutionLesson;
