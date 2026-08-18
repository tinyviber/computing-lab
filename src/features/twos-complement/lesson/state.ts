import {
  resizeBitPattern,
  toggleBit,
  type BitPattern,
  type Reading,
  type WordWidth,
} from "../domain/model";
import type { TwosComplementScenario } from "./scenario";

export type TwosComplementExample = "signed-boundary" | "carry-only" | "negative-overflow";

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

function exampleWords(example: TwosComplementExample): { left: BitPattern; right: BitPattern } {
  switch (example) {
    case "carry-only":
      return { left: "1111", right: "0001" };
    case "negative-overflow":
      return { left: "1000", right: "1111" };
    case "signed-boundary":
      return { left: "0111", right: "0001" };
  }
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
      const words = exampleWords(action.example);
      return {
        ...state,
        left: resizeBitPattern(words.left, state.width, "signed"),
        right: resizeBitPattern(words.right, state.width, "signed"),
      };
    }
    case "reset":
      return createTwosComplementLessonState(state.initialScenario);
  }
}
