import {
  createMachine,
  getProgram,
  stepProgram,
  type ExecutionFrame,
  type ExecutionMachine,
  type ProgramId,
  type Program,
} from "../domain";
import type { ProgramExecutionScenario } from "./scenario";

export type ProgramExecutionFocus = "variable-change" | "loop-stop";

export type ProgramPredictionTarget =
  | { kind: "assignment"; key: string; sourceLine: number; variable: string }
  | { kind: "condition"; key: string; sourceLine: number }
  | { kind: "print"; key: string; sourceLine: number };

export type ProgramPrediction =
  | { kind: "assignment"; target: ProgramPredictionTarget; value: number }
  | { kind: "condition"; target: ProgramPredictionTarget; result: boolean }
  | { kind: "print"; target: ProgramPredictionTarget; value: number };

export type ProgramPredictionFeedback = {
  target: ProgramPredictionTarget;
  prediction: ProgramPrediction;
  actual: ProgramPrediction;
  matches: boolean;
};

export type ProgramExecutionLessonState = {
  initialScenario: ProgramExecutionScenario;
  fixture: ProgramId;
  machine: ExecutionMachine;
  frames: ExecutionFrame[];
  selectedFrameIndex?: number;
  predictionDraft: string;
  predictionTarget?: ProgramPredictionTarget;
  prediction?: ProgramPrediction;
  predictionFeedback?: ProgramPredictionFeedback;
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
  const machine = createMachine(getProgram(fixture));
  return {
    initialScenario: cloneScenario(initialScenario),
    fixture,
    machine,
    frames: [],
    selectedFrameIndex: undefined,
    predictionDraft: "",
    predictionTarget: predictionTargetForMachine(machine, getProgram(fixture)),
    prediction: undefined,
    predictionFeedback: undefined,
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

function controlKey(machine: ExecutionMachine): string | undefined {
  if (machine.control.kind === "halted") return undefined;
  if (machine.control.kind === "loop-body") {
    return `loop-body-${machine.control.index}-${machine.control.bodyIndex}`;
  }
  return `${machine.control.kind}-${machine.control.index}`;
}

function predictionTargetForMachine(
  machine: ExecutionMachine,
  program: Program,
): ProgramPredictionTarget | undefined {
  if (machine.status !== "running" || machine.control.kind === "halted") return undefined;
  const key = controlKey(machine);
  if (!key) return undefined;

  if (machine.control.kind === "loop-body") {
    const statement = program.statements[machine.control.index];
    const assignment =
      statement.kind === "while" ? statement.body[machine.control.bodyIndex] : undefined;
    return assignment
      ? {
          kind: "assignment",
          key,
          sourceLine: assignment.line,
          variable: assignment.variable,
        }
      : undefined;
  }

  const statement = program.statements[machine.control.index];
  if (statement.kind === "assignment") {
    return { kind: "assignment", key, sourceLine: statement.line, variable: statement.variable };
  }
  if (statement.kind === "while") return { kind: "condition", key, sourceLine: statement.line };
  return { kind: "print", key, sourceLine: statement.line };
}

function actualPredictionForFrame(
  frame: ExecutionFrame,
  target: ProgramPredictionTarget | undefined,
): ProgramPrediction | undefined {
  if (!target) return undefined;
  if (target.kind === "assignment" && frame.assignment) {
    return { kind: "assignment", target, value: frame.assignment.value };
  }
  if (target.kind === "condition" && frame.condition) {
    return { kind: "condition", target, result: frame.condition.result };
  }
  if (target.kind === "print" && frame.print) {
    return { kind: "print", target, value: frame.print.value };
  }
  return undefined;
}

function parsePrediction(
  raw: string,
  target: ProgramPredictionTarget | undefined,
): ProgramPrediction | undefined {
  if (!target) return undefined;
  const value = raw.trim();
  if (!value) return undefined;
  if (target.kind === "condition") {
    if (value === "true" || value === "真") return { kind: "condition", target, result: true };
    if (value === "false" || value === "假") return { kind: "condition", target, result: false };
    return undefined;
  }
  const number = Number(value);
  return Number.isSafeInteger(number) ? { kind: target.kind, target, value: number } : undefined;
}

function advanceOne(state: ProgramExecutionLessonState): ProgramExecutionLessonState {
  const program = getProgram(state.fixture);
  const target = state.predictionTarget;
  const result = stepProgram(state.machine, program);
  if (!result.frame) return state;
  const actual = actualPredictionForFrame(result.frame, target);
  const feedback =
    state.prediction && actual && state.prediction.target.key === actual.target.key
      ? {
          target: actual.target,
          prediction: state.prediction,
          actual,
          matches:
            actual.kind === "condition"
              ? state.prediction.kind === "condition" && state.prediction.result === actual.result
              : state.prediction.kind === actual.kind && state.prediction.value === actual.value,
        }
      : undefined;
  return {
    ...state,
    machine: result.machine,
    frames: [...state.frames, result.frame],
    selectedFrameIndex: result.frame.index,
    predictionTarget: predictionTargetForMachine(result.machine, program),
    prediction: undefined,
    predictionFeedback: feedback ?? state.predictionFeedback,
    predictionMessage: feedback
      ? feedback.matches
        ? "Prediction matched the next execution event."
        : "Prediction differed from the next execution event; inspect the before/after evidence."
      : state.predictionMessage,
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
      return {
        ...state,
        predictionDraft: action.value,
        prediction: undefined,
        predictionFeedback: undefined,
        predictionMessage: undefined,
      };
    case "record-prediction": {
      const prediction = parsePrediction(state.predictionDraft, state.predictionTarget);
      if (!prediction) {
        return {
          ...state,
          predictionMessage:
            state.predictionTarget?.kind === "condition"
              ? "Enter true or false for the current while condition."
              : "Enter a safe whole-number prediction for the current statement.",
        };
      }
      return {
        ...state,
        prediction,
        predictionFeedback: undefined,
        predictionMessage: "Prediction recorded for the current statement; execution remains open.",
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
