import {
  createUtf8Machine,
  getUtf8Scenario,
  stepUtf8,
  type Utf8Frame,
  type Utf8ScenarioId,
} from "../domain";
import type { Utf8ScenarioState } from "./scenario";

export type Utf8LessonState = {
  initialScenario: Utf8ScenarioState;
  scenario: Utf8ScenarioId;
  machine: ReturnType<typeof createUtf8Machine>;
  frames: Utf8Frame[];
  selectedFrameIndex?: number;
  predictionBranchDraft: string;
  predictionBytesDraft: string;
  predictionMessage?: string;
  predictionBranch?: string;
  predictionBytes?: number;
};

export type Utf8LessonAction =
  | { type: "set-branch-prediction"; value: string }
  | { type: "set-bytes-prediction"; value: string }
  | { type: "record-prediction" }
  | { type: "step" }
  | { type: "run-all" }
  | { type: "select-frame"; index: number }
  | { type: "set-scenario"; scenario: Utf8ScenarioId }
  | { type: "sync-url-scenario"; scenario: Utf8ScenarioId }
  | { type: "reset" };

export function createUtf8LessonState(scenario: Utf8ScenarioState): Utf8LessonState {
  return {
    initialScenario: { ...scenario },
    scenario: scenario.scenario,
    machine: createUtf8Machine(getUtf8Scenario(scenario.scenario)),
    frames: [],
    selectedFrameIndex: undefined,
    predictionBranchDraft: "",
    predictionBytesDraft: "",
    predictionMessage: undefined,
    predictionBranch: undefined,
    predictionBytes: undefined,
  };
}

function advance(state: Utf8LessonState): Utf8LessonState {
  const result = stepUtf8(state.machine, getUtf8Scenario(state.scenario));
  if (!result.frame) return state;
  return {
    ...state,
    machine: result.machine,
    frames: [...state.frames, result.frame],
    selectedFrameIndex: result.frame.index,
  };
}

function runAll(state: Utf8LessonState): Utf8LessonState {
  let current = state;
  for (let index = 0; index < 100 && current.machine.status === "running"; index += 1) {
    const next = advance(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

function branch(value: string): string | undefined {
  return /^([1-4])-byte$/.test(value) ? value : undefined;
}

function byteCount(value: string): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 32 ? parsed : undefined;
}

export function transitionUtf8Lesson(
  state: Utf8LessonState,
  action: Utf8LessonAction,
): Utf8LessonState {
  switch (action.type) {
    case "set-branch-prediction":
      return { ...state, predictionBranchDraft: action.value, predictionMessage: undefined };
    case "set-bytes-prediction":
      return { ...state, predictionBytesDraft: action.value, predictionMessage: undefined };
    case "record-prediction": {
      const predictedBranch = branch(state.predictionBranchDraft);
      const predictedBytes = byteCount(state.predictionBytesDraft);
      return predictedBranch && predictedBytes
        ? {
            ...state,
            predictionBranch: predictedBranch,
            predictionBytes: predictedBytes,
            predictionMessage: `Prediction recorded: ${predictedBranch}; final byte count ${predictedBytes}.`,
          }
        : {
            ...state,
            predictionMessage: "Choose a byte branch and final byte count before recording.",
          };
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
        ...createUtf8LessonState({ scenario: action.scenario }),
        initialScenario: { ...state.initialScenario },
      };
    case "sync-url-scenario":
      return createUtf8LessonState({ scenario: action.scenario });
    case "reset":
      return createUtf8LessonState(state.initialScenario);
  }
}

export const utf8LessonReducer = transitionUtf8Lesson;
