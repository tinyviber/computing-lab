import type { HomeNetworkScenarioState } from "./scenario";

export type NetworkPhase = "ready" | "editing" | "success" | "failure";
export type HomeNetworkLessonState = HomeNetworkScenarioState & {
  initialGateway: string;
  phase: NetworkPhase;
};
export type HomeNetworkLessonAction =
  | { type: "load-scenario"; scenario: HomeNetworkScenarioState }
  | { type: "set-gateway"; gateway: string }
  | { type: "submit"; valid: boolean }
  | { type: "reset" };

export function createHomeNetworkLessonState(
  scenario: HomeNetworkScenarioState,
): HomeNetworkLessonState {
  return { ...scenario, initialGateway: scenario.gateway, phase: "ready" };
}

export function transitionHomeNetworkLesson(
  state: HomeNetworkLessonState,
  action: HomeNetworkLessonAction,
): HomeNetworkLessonState {
  switch (action.type) {
    case "load-scenario":
      return createHomeNetworkLessonState(action.scenario);
    case "set-gateway":
      return { ...state, gateway: action.gateway, phase: "editing" };
    case "submit":
      return { ...state, phase: action.valid ? "success" : "failure" };
    case "reset":
      return { ...state, gateway: state.initialGateway, phase: "ready" };
  }
}
