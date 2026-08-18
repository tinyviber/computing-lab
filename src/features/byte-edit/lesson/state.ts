import {
  BYTE_EDIT_PRESETS,
  createByteEditMachine,
  getByteEditScenario,
  stepByteEdit,
  type ByteEditFrame,
  type ByteEditPresetId,
  type ByteEditScenarioId,
} from "../domain";
import type { ByteEditScenarioState } from "./scenario";

export type ByteEditLessonState = {
  initialScenario: ByteEditScenarioState;
  scenario: ByteEditScenarioId;
  machine: ReturnType<typeof createByteEditMachine>;
  frames: ByteEditFrame[];
  selectedFrameIndex?: number;
  editIndexDraft: string;
  editValueDraft: string;
  predictionDraft: string;
  predictionMessage?: string;
  predictionValid?: boolean;
};

export type ByteEditLessonAction =
  | { type: "set-edit-index"; value: string }
  | { type: "set-edit-value"; value: string }
  | { type: "set-prediction"; value: string }
  | { type: "record-prediction" }
  | { type: "apply-edit" }
  | { type: "apply-preset"; preset: ByteEditPresetId }
  | { type: "select-frame"; index: number }
  | { type: "set-scenario"; scenario: ByteEditScenarioId }
  | { type: "sync-url-scenario"; scenario: ByteEditScenarioId }
  | { type: "reset" };

export function createByteEditLessonState(scenario: ByteEditScenarioState): ByteEditLessonState {
  return {
    initialScenario: { ...scenario },
    scenario: scenario.scenario,
    machine: createByteEditMachine(getByteEditScenario(scenario.scenario)),
    frames: [],
    selectedFrameIndex: undefined,
    editIndexDraft: "",
    editValueDraft: "",
    predictionDraft: "",
    predictionMessage: undefined,
    predictionValid: undefined,
  };
}

function advance(state: ByteEditLessonState, frame: ByteEditFrame): ByteEditLessonState {
  return {
    ...state,
    machine: frame.after,
    frames: [...state.frames, { ...frame, index: state.frames.length }],
    selectedFrameIndex: state.frames.length,
  };
}

function byteIndex(value: string, length: number): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed < length ? parsed : undefined;
}

function byteValue(value: string): number | undefined {
  if (value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 255 ? parsed : undefined;
}

function validity(value: string): boolean | undefined {
  return value === "valid" ? true : value === "invalid" ? false : undefined;
}

export function transitionByteEditLesson(
  state: ByteEditLessonState,
  action: ByteEditLessonAction,
): ByteEditLessonState {
  switch (action.type) {
    case "set-edit-index":
      return { ...state, editIndexDraft: action.value, predictionMessage: undefined };
    case "set-edit-value":
      return { ...state, editValueDraft: action.value, predictionMessage: undefined };
    case "set-prediction":
      return { ...state, predictionDraft: action.value, predictionMessage: undefined };
    case "record-prediction": {
      const predicted = validity(state.predictionDraft);
      return predicted !== undefined
        ? {
            ...state,
            predictionValid: predicted,
            predictionMessage: `Prediction recorded: the edited sequence stays ${predicted ? "valid" : "invalid"}.`,
          }
        : { ...state, predictionMessage: "Choose valid or invalid before recording." };
    }
    case "apply-edit": {
      const index = byteIndex(state.editIndexDraft, state.machine.bytes.length);
      const value = byteValue(state.editValueDraft);
      if (index === undefined || value === undefined) {
        return {
          ...state,
          predictionMessage: "Choose a byte index and a value between 0 and 255 first.",
        };
      }
      const result = stepByteEdit(
        state.machine,
        getByteEditScenario(state.scenario),
        { kind: "byte", byteIndex: index, value },
        BYTE_EDIT_PRESETS,
        state.predictionValid,
      );
      return advance(state, result.frame);
    }
    case "apply-preset": {
      const result = stepByteEdit(
        state.machine,
        getByteEditScenario(state.scenario),
        { kind: "preset", preset: action.preset },
        BYTE_EDIT_PRESETS,
        state.predictionValid,
      );
      return advance(state, result.frame);
    }
    case "select-frame":
      return state.frames.some((frame) => frame.index === action.index)
        ? { ...state, selectedFrameIndex: action.index }
        : state;
    case "set-scenario":
      return {
        ...createByteEditLessonState({ scenario: action.scenario }),
        initialScenario: { ...state.initialScenario },
      };
    case "sync-url-scenario":
      return createByteEditLessonState({ scenario: action.scenario });
    case "reset":
      return createByteEditLessonState(state.initialScenario);
  }
}

export const byteEditLessonReducer = transitionByteEditLesson;
