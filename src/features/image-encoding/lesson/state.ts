import { getImageFixture } from "../domain/fixture";
import type { RasterImage } from "../domain/model";
import {
  normalizeBitDepth,
  normalizeImage,
  normalizePhase,
  normalizePhaseForSampling,
  normalizeSamplingPercent,
} from "../domain/model";
import type { ImageScenarioState } from "./scenario";

export type ImageView = "compare" | "sampling" | "quantization" | "representation" | "error";

export type ImageLessonState = ImageScenarioState & {
  source: RasterImage;
  initialScenario: ImageScenarioState;
  selectedCoordinate: { x: number; y: number };
  decodeError?: string;
};

export type ImageLessonAction =
  | { type: "load-scenario"; scenario: ImageScenarioState }
  | { type: "set-sampling"; samplingPercent: number }
  | { type: "set-bit-depth"; bitDepth: number }
  | { type: "set-phase"; phase: number }
  | { type: "set-view"; view: ImageView }
  | { type: "select-pixel"; x: number; y: number }
  | { type: "load-source"; source: RasterImage }
  | { type: "decode-error"; message: string }
  | { type: "reset" };

function initialCoordinate(source: RasterImage): { x: number; y: number } {
  return { x: Math.floor(source.width / 2), y: Math.floor(source.height / 2) };
}

function normalizeScenario(scenario: ImageScenarioState): ImageScenarioState {
  const samplingPercent = normalizeSamplingPercent(scenario.samplingPercent);
  return {
    ...scenario,
    samplingPercent,
    bitDepth: normalizeBitDepth(scenario.bitDepth),
    phase: normalizePhaseForSampling(samplingPercent, scenario.phase),
  };
}

export function createImageLessonState(scenario: ImageScenarioState): ImageLessonState {
  const normalizedScenario = normalizeScenario(scenario);
  const source = getImageFixture(normalizedScenario.fixture);
  return {
    ...normalizedScenario,
    source,
    initialScenario: { ...normalizedScenario },
    selectedCoordinate: initialCoordinate(source),
  };
}

export function transitionImageLesson(
  state: ImageLessonState,
  action: ImageLessonAction,
): ImageLessonState {
  switch (action.type) {
    case "load-scenario":
      return createImageLessonState(action.scenario);
    case "set-sampling": {
      const samplingPercent = normalizeSamplingPercent(action.samplingPercent);
      return {
        ...state,
        samplingPercent,
        phase: normalizePhaseForSampling(samplingPercent, state.phase),
      };
    }
    case "set-bit-depth":
      return { ...state, bitDepth: normalizeBitDepth(action.bitDepth) };
    case "set-phase":
      return {
        ...state,
        phase: normalizePhaseForSampling(state.samplingPercent, normalizePhase(action.phase)),
      };
    case "set-view":
      return { ...state, view: action.view };
    case "select-pixel":
      return {
        ...state,
        selectedCoordinate: {
          x: Math.max(0, Math.min(state.source.width - 1, Math.floor(action.x))),
          y: Math.max(0, Math.min(state.source.height - 1, Math.floor(action.y))),
        },
      };
    case "load-source": {
      const source = normalizeImage(action.source);
      return {
        ...state,
        source,
        decodeError: undefined,
        selectedCoordinate: initialCoordinate(source),
      };
    }
    case "decode-error":
      return { ...state, decodeError: action.message };
    case "reset":
      return createImageLessonState(state.initialScenario);
  }
}
