import {
  createProtocolMachine,
  getProtocolScenario,
  stepProtocol,
  type ProtocolFrame,
  type ProtocolScenarioId,
} from "../domain";
import type { ProtocolScenarioState } from "./scenario";

export type ProtocolPrediction = "delivered" | "failed";
export type ProtocolTimeoutConclusion = "status-unknown" | "receiver-failed";

export type ProtocolLessonState = {
  initialScenario: ProtocolScenarioState;
  scenario: ProtocolScenarioId;
  machine: ReturnType<typeof createProtocolMachine>;
  frames: ProtocolFrame[];
  selectedFrameIndex?: number;
  prediction?: ProtocolPrediction;
  predictionDraft: string;
  predictionAttempts?: 1 | 2;
  predictionAttemptsDraft: string;
  timeoutConclusion?: ProtocolTimeoutConclusion;
  timeoutConclusionDraft: string;
  predictionMessage?: string;
};

export type ProtocolLessonAction =
  | { type: "set-prediction-draft"; value: string }
  | { type: "set-prediction-attempts-draft"; value: string }
  | { type: "set-timeout-conclusion-draft"; value: string }
  | { type: "record-prediction" }
  | { type: "step" }
  | { type: "run-all" }
  | { type: "select-frame"; index: number }
  | { type: "inspect-first-fault" }
  | { type: "inspect-retry" }
  | { type: "set-scenario"; scenario: ProtocolScenarioId }
  | { type: "reset" };

function scenarioFor(state: ProtocolLessonState) {
  return getProtocolScenario(state.scenario);
}

export function createProtocolLessonState(scenario: ProtocolScenarioState): ProtocolLessonState {
  return {
    initialScenario: { ...scenario },
    scenario: scenario.scenario,
    machine: createProtocolMachine(getProtocolScenario(scenario.scenario)),
    frames: [],
    selectedFrameIndex: undefined,
    prediction: undefined,
    predictionDraft: "",
    predictionAttempts: undefined,
    predictionAttemptsDraft: "",
    timeoutConclusion: undefined,
    timeoutConclusionDraft: "",
    predictionMessage: undefined,
  };
}

function advance(state: ProtocolLessonState): ProtocolLessonState {
  const result = stepProtocol(state.machine, scenarioFor(state));
  if (!result.frame) return state;
  const frame = { ...result.frame, index: state.frames.length };
  return {
    ...state,
    machine: result.machine,
    frames: [...state.frames, frame],
    selectedFrameIndex: frame.index,
  };
}

function runAll(state: ProtocolLessonState): ProtocolLessonState {
  let current = state;
  for (let index = 0; index < 100 && current.machine.status === "running"; index += 1) {
    const next = advance(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function predictionResult(value: string): ProtocolPrediction | undefined {
  return value === "delivered" || value === "failed" ? value : undefined;
}

function attemptsResult(value: string): 1 | 2 | undefined {
  return value === "1" || value === "2" ? (Number(value) as 1 | 2) : undefined;
}

function timeoutConclusionResult(value: string): ProtocolTimeoutConclusion | undefined {
  return value === "status-unknown" || value === "receiver-failed" ? value : undefined;
}

function selectFrame(state: ProtocolLessonState, index: number): ProtocolLessonState {
  return state.frames.some((frame) => frame.index === index)
    ? { ...state, selectedFrameIndex: index }
    : state;
}

function inspectFrame(
  state: ProtocolLessonState,
  predicate: (frame: ProtocolFrame) => boolean,
): ProtocolLessonState {
  const frame = state.frames.find(predicate);
  return frame ? { ...state, selectedFrameIndex: frame.index } : state;
}

export function transitionProtocolLesson(
  state: ProtocolLessonState,
  action: ProtocolLessonAction,
): ProtocolLessonState {
  switch (action.type) {
    case "set-prediction-draft":
      return { ...state, predictionDraft: action.value, predictionMessage: undefined };
    case "set-prediction-attempts-draft":
      return { ...state, predictionAttemptsDraft: action.value, predictionMessage: undefined };
    case "set-timeout-conclusion-draft":
      return { ...state, timeoutConclusionDraft: action.value, predictionMessage: undefined };
    case "record-prediction": {
      const prediction = predictionResult(state.predictionDraft);
      const attempts = attemptsResult(state.predictionAttemptsDraft);
      const timeoutConclusion = timeoutConclusionResult(state.timeoutConclusionDraft);
      return prediction && attempts && timeoutConclusion
        ? {
            ...state,
            prediction,
            predictionAttempts: attempts,
            timeoutConclusion,
            predictionMessage: `Prediction recorded: ${prediction} in ${attempts} attempt${attempts === 1 ? "" : "s"}; timeout claim recorded.`,
          }
        : {
            ...state,
            predictionMessage:
              "Choose delivery, request attempts, and the timeout conclusion before recording.",
          };
    }
    case "step":
      return advance(state);
    case "run-all":
      return runAll(state);
    case "select-frame":
      return selectFrame(state, action.index);
    case "inspect-first-fault":
      return inspectFrame(
        state,
        (frame) =>
          frame.event.outcome === "dropped" || frame.event.outcome === "receiver-unavailable",
      );
    case "inspect-retry":
      return inspectFrame(state, (frame) => frame.event.kind === "timeout");
    case "set-scenario":
      return {
        ...createProtocolLessonState({ scenario: action.scenario }),
        initialScenario: { ...state.initialScenario },
      };
    case "reset":
      return createProtocolLessonState(state.initialScenario);
  }
}

export const protocolLessonReducer = transitionProtocolLesson;
