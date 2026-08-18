import {
  createMonteCarloMachine,
  getMonteCarloScenario,
  stepMonteCarlo,
  type MonteCarloFrame,
  type MonteCarloScenarioId,
} from "../domain";
import type { MonteCarloScenarioState } from "./scenario";

export type MonteCarloLessonState = {
  initialScenario: MonteCarloScenarioState;
  scenario: MonteCarloScenarioId;
  machine: ReturnType<typeof createMonteCarloMachine>;
  frames: MonteCarloFrame[];
  selectedFrameIndex?: number;
  predictionDraft: string;
  predictionMessage?: string;
  prediction?: "above" | "below";
};

export type MonteCarloLessonAction =
  | { type: "set-prediction"; value: string }
  | { type: "record-prediction" }
  | { type: "step" }
  | { type: "run-all" }
  | { type: "select-frame"; index: number }
  | { type: "set-scenario"; scenario: MonteCarloScenarioId }
  | { type: "sync-url-scenario"; scenario: MonteCarloScenarioId }
  | { type: "reset" };

export function createMonteCarloLessonState(
  scenario: MonteCarloScenarioState,
): MonteCarloLessonState {
  return {
    initialScenario: { ...scenario },
    scenario: scenario.scenario,
    machine: createMonteCarloMachine(getMonteCarloScenario(scenario.scenario)),
    frames: [],
    selectedFrameIndex: undefined,
    predictionDraft: "",
    predictionMessage: undefined,
    prediction: undefined,
  };
}

function advance(state: MonteCarloLessonState): MonteCarloLessonState {
  const result = stepMonteCarlo(state.machine, getMonteCarloScenario(state.scenario));
  if (!result.frame) return state;
  return {
    ...state,
    machine: result.machine,
    frames: [...state.frames, result.frame],
    selectedFrameIndex: result.frame.index,
  };
}

function runAll(state: MonteCarloLessonState): MonteCarloLessonState {
  let current = state;
  for (let index = 0; index < 5000 && current.machine.status === "running"; index += 1) {
    const next = advance(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function prediction(value: string): "above" | "below" | undefined {
  return value === "above" || value === "below" ? value : undefined;
}

export function transitionMonteCarloLesson(
  state: MonteCarloLessonState,
  action: MonteCarloLessonAction,
): MonteCarloLessonState {
  switch (action.type) {
    case "set-prediction":
      return { ...state, predictionDraft: action.value, predictionMessage: undefined };
    case "record-prediction": {
      const predicted = prediction(state.predictionDraft);
      return predicted
        ? {
            ...state,
            prediction: predicted,
            predictionMessage: `Prediction recorded: estimate finishes ${predicted} π.`,
          }
        : { ...state, predictionMessage: "Choose above or below π before recording." };
    }
    case "step":
      return advance(state);
    case "run-all":
      return runAll(state);
    case "select-frame":
      return state.frames.some((frame) => frame.index === action.index)
        ? { ...state, selectedFrameIndex: action.index }
        : state;
    case "set-scenario":
      return {
        ...createMonteCarloLessonState({ scenario: action.scenario }),
        initialScenario: { ...state.initialScenario },
      };
    case "sync-url-scenario":
      return createMonteCarloLessonState({ scenario: action.scenario });
    case "reset":
      return createMonteCarloLessonState(state.initialScenario);
  }
}

export const monteCarloLessonReducer = transitionMonteCarloLesson;
