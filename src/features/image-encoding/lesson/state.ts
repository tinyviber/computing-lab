import type { ImageScenarioState } from "./scenario";

export type ImagePhase = "ready" | "editing" | "success" | "failure";

export type ImageLessonState = ImageScenarioState & {
  initialDensity: number;
  initialBits: number;
  phase: ImagePhase;
  step: number;
};

export type ImageLessonAction =
  | { type: "load-scenario"; scenario: ImageScenarioState }
  | { type: "set-density"; density: number }
  | { type: "set-bits"; bits: number }
  | { type: "run-preview" }
  | { type: "submit" }
  | { type: "retry" }
  | { type: "next-step" }
  | { type: "reset" };

export function createImageLessonState(scenario: ImageScenarioState): ImageLessonState {
  return {
    ...scenario,
    initialDensity: scenario.density,
    initialBits: scenario.bits,
    phase: "ready",
    step: 1,
  };
}

export function transitionImageLesson(
  state: ImageLessonState,
  action: ImageLessonAction,
): ImageLessonState {
  switch (action.type) {
    case "load-scenario":
      return createImageLessonState(action.scenario);
    case "set-density":
      return { ...state, density: action.density, sampling: action.density, phase: "editing" };
    case "set-bits":
      return { ...state, bits: action.bits, phase: "editing" };
    case "run-preview":
      return state.phase === "ready" ? { ...state, phase: "editing" } : state;
    case "submit":
      return state.phase !== "editing"
        ? state
        : { ...state, phase: state.density === 4 && state.bits === 8 ? "success" : "failure" };
    case "retry":
      return state.phase === "failure" ? { ...state, phase: "editing" } : state;
    case "next-step":
      return state.phase === "success" && state.step < 4
        ? { ...state, phase: "ready", step: state.step + 1 }
        : state;
    case "reset":
      return {
        ...state,
        density: state.initialDensity,
        sampling: state.initialDensity,
        bits: state.initialBits,
        phase: "ready",
      };
  }
}
