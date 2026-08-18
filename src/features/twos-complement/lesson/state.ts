import { resizeBitPattern, toggleBit, type Reading, type WordWidth } from "../domain/model";
import { getTwosComplementExample, type TwosComplementExample } from "./examples";
import type { TwosComplementScenario } from "./scenario";

export type { TwosComplementExample } from "./examples";

export type TwosComplementLessonState = TwosComplementScenario & {
  initialScenario: TwosComplementScenario;
};

export type TwosComplementLessonAction =
  | { type: "load-scenario"; scenario: TwosComplementScenario }
  | { type: "set-width"; width: WordWidth }
  | { type: "toggle-bit"; operand: "left" | "right"; msbIndex: number }
  | { type: "set-reading"; reading: Reading }
  | { type: "apply-example"; example: TwosComplementExample }
  | { type: "reset" };

function cloneScenario(scenario: TwosComplementScenario): TwosComplementScenario {
  return { ...scenario };
}

export function createTwosComplementLessonState(
  scenario: TwosComplementScenario,
): TwosComplementLessonState {
  return { ...scenario, initialScenario: cloneScenario(scenario) };
}

export function transitionTwosComplementLesson(
  state: TwosComplementLessonState,
  action: TwosComplementLessonAction,
): TwosComplementLessonState {
  switch (action.type) {
    case "load-scenario":
      return createTwosComplementLessonState(action.scenario);
    case "set-width":
      if (action.width === state.width) return state;
      return {
        ...state,
        width: action.width,
        left: resizeBitPattern(state.left, action.width, state.reading),
        right: resizeBitPattern(state.right, action.width, state.reading),
      };
    case "toggle-bit":
      return {
        ...state,
        [action.operand]: toggleBit(state[action.operand], action.msbIndex),
      };
    case "set-reading":
      return { ...state, reading: action.reading };
    case "apply-example": {
      const { words } = getTwosComplementExample(state.width, action.example);
      return {
        ...state,
        left: words.left,
        right: words.right,
      };
    }
    case "reset":
      return createTwosComplementLessonState(state.initialScenario);
  }
}
