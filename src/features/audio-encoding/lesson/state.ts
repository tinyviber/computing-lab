import type { AudioEncodingOptions } from "../domain/model";
import type { AudioScenarioState } from "./scenario";

export type AudioPhase = "ready" | "editing";
export type AudioLessonState = AudioScenarioState & {
  initialOptions: AudioEncodingOptions;
  phase: AudioPhase;
};
export type AudioLessonAction =
  | { type: "load-scenario"; scenario: AudioScenarioState }
  | { type: "set-option"; key: keyof AudioEncodingOptions; value: number }
  | { type: "reset" };

export function createAudioLessonState(scenario: AudioScenarioState): AudioLessonState {
  return { ...scenario, initialOptions: { ...scenario }, phase: "ready" };
}

export function transitionAudioLesson(
  state: AudioLessonState,
  action: AudioLessonAction,
): AudioLessonState {
  switch (action.type) {
    case "load-scenario":
      return createAudioLessonState(action.scenario);
    case "set-option":
      return { ...state, [action.key]: action.value, phase: "editing" };
    case "reset":
      return { ...state, ...state.initialOptions, phase: "ready" };
  }
}
