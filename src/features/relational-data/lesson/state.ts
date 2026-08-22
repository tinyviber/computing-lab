import {
  createRelationalMachine,
  getRelationalScenario,
  stepRelational,
  type RelationalFrame,
  type RelationalScenarioId,
} from "../domain";
import type { RelationalScenarioState } from "./scenario";

export type RelationalLessonState = {
  initialScenario: RelationalScenarioState;
  scenario: RelationalScenarioId;
  machine: ReturnType<typeof createRelationalMachine>;
  frames: RelationalFrame[];
  selectedFrameIndex?: number;
  selectedResultRowId?: string;
  predictionDraft: string;
  predictionMessage?: string;
  prediction?: number;
};

export type RelationalLessonAction =
  | { type: "set-prediction"; value: string }
  | { type: "record-prediction" }
  | { type: "step" }
  | { type: "run-all" }
  | { type: "select-frame"; index: number }
  | { type: "select-result-row"; rowId: string }
  | { type: "set-scenario"; scenario: RelationalScenarioId }
  | { type: "sync-url-scenario"; scenario: RelationalScenarioId }
  | { type: "reset" };

export function createRelationalLessonState(
  scenario: RelationalScenarioState,
): RelationalLessonState {
  return {
    initialScenario: { ...scenario },
    scenario: scenario.scenario,
    machine: createRelationalMachine(getRelationalScenario(scenario.scenario)),
    frames: [],
    selectedFrameIndex: undefined,
    selectedResultRowId: undefined,
    predictionDraft: "",
    predictionMessage: undefined,
    prediction: undefined,
  };
}

function advance(state: RelationalLessonState): RelationalLessonState {
  const result = stepRelational(
    state.machine,
    getRelationalScenario(state.scenario),
    state.prediction,
  );
  if (!result.frame) return state;
  return {
    ...state,
    machine: result.machine,
    frames: [...state.frames, result.frame],
    selectedFrameIndex: result.frame.index,
    selectedResultRowId: undefined,
  };
}

function runAll(state: RelationalLessonState): RelationalLessonState {
  let current = state;
  for (let index = 0; index < 100 && current.machine.status === "running"; index += 1) {
    const next = advance(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function rowCount(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 100 ? parsed : undefined;
}

export function transitionRelationalLesson(
  state: RelationalLessonState,
  action: RelationalLessonAction,
): RelationalLessonState {
  switch (action.type) {
    case "set-prediction":
      return { ...state, predictionDraft: action.value, predictionMessage: undefined };
    case "record-prediction": {
      const predicted = rowCount(state.predictionDraft);
      return predicted !== undefined
        ? {
            ...state,
            prediction: predicted,
            predictionMessage: `Prediction recorded: the next query returns ${predicted} row${predicted === 1 ? "" : "s"}.`,
          }
        : { ...state, predictionMessage: "Enter a whole row count between 0 and 100 first." };
    }
    case "step":
      return advance(state);
    case "run-all":
      return runAll(state);
    case "select-frame":
      return state.frames.some((frame) => frame.index === action.index)
        ? { ...state, selectedFrameIndex: action.index, selectedResultRowId: undefined }
        : state;
    case "select-result-row": {
      const frame = state.frames.find((candidate) => candidate.index === state.selectedFrameIndex);
      return frame?.result.rows.some((row) => row.id === action.rowId)
        ? { ...state, selectedResultRowId: action.rowId }
        : state;
    }
    case "set-scenario":
      return {
        ...createRelationalLessonState({ scenario: action.scenario }),
        initialScenario: { ...state.initialScenario },
      };
    case "sync-url-scenario":
      return createRelationalLessonState({ scenario: action.scenario });
    case "reset":
      return createRelationalLessonState(state.initialScenario);
  }
}

export const relationalLessonReducer = transitionRelationalLesson;
