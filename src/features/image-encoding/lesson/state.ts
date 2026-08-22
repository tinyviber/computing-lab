import { getImageFixture } from "../domain/fixture";
import type { ImageEncodingFormat, RasterImage } from "../domain/model";
import {
  isSamplingPhaseInert,
  normalizeImageEncodingFormat,
  normalizeColorMode,
  normalizeBitDepth,
  normalizeImage,
  normalizePhase,
  normalizeSamplingPercent,
} from "../domain/model";
import type { ImageScenarioState } from "./scenario";

export type ImageView = "compare" | "sampling" | "quantization" | "representation" | "error";

export type ImageLessonState = ImageScenarioState & {
  source: RasterImage;
  initialScenario: ImageScenarioState;
  selectedCoordinate: { x: number; y: number };
  decodeError?: string;
  samplingChanged: boolean;
  colorAdjusted: boolean;
  formatSelected: boolean;
  selectedFormat: ImageEncodingFormat;
  calculatorEdited: boolean;
};

export type ImageLessonAction =
  | { type: "load-scenario"; scenario: ImageScenarioState }
  | { type: "set-sampling"; samplingPercent: number }
  | { type: "set-bit-depth"; bitDepth: number }
  | { type: "set-color-mode"; colorMode: "palette" | "rgb24" }
  | { type: "set-phase"; phase: number }
  | { type: "set-view"; view: ImageView }
  | { type: "select-pixel"; x: number; y: number }
  | { type: "select-format"; format: ImageEncodingFormat }
  | { type: "set-format"; format: ImageEncodingFormat }
  | { type: "edit-calculator-field" }
  | { type: "load-source"; source: RasterImage }
  | { type: "decode-error"; message: string }
  | { type: "reset" };

const INITIAL_FORMAT: ImageEncodingFormat = "raw";

function initialCoordinate(source: RasterImage): { x: number; y: number } {
  return { x: Math.floor(source.width / 2), y: Math.floor(source.height / 2) };
}

function canonicalPhaseForSource(
  source: RasterImage,
  samplingPercent: number,
  phase: number,
): number {
  return isSamplingPhaseInert(source, samplingPercent) ? 0 : normalizePhase(phase);
}

function normalizeScenario(scenario: ImageScenarioState, source: RasterImage): ImageScenarioState {
  const samplingPercent = normalizeSamplingPercent(scenario.samplingPercent);
  return {
    ...scenario,
    samplingPercent,
    bitDepth: normalizeBitDepth(scenario.bitDepth),
    colorMode: "rgb24",
    phase: canonicalPhaseForSource(source, samplingPercent, scenario.phase),
  };
}

function emptyProgress() {
  return {
    samplingChanged: false,
    colorAdjusted: false,
    formatSelected: false,
    calculatorEdited: false,
  };
}

function stateForSource(scenario: ImageScenarioState, source: RasterImage): ImageLessonState {
  const normalizedScenario = normalizeScenario(scenario, source);
  return {
    ...normalizedScenario,
    source,
    initialScenario: { ...normalizedScenario },
    selectedCoordinate: initialCoordinate(source),
    selectedFormat: INITIAL_FORMAT,
    ...emptyProgress(),
  };
}

export function createImageLessonState(scenario: ImageScenarioState): ImageLessonState {
  const source = getImageFixture(scenario.fixture);
  return stateForSource(scenario, source);
}

function resetAfterSourceUpload(state: ImageLessonState, source: RasterImage): ImageLessonState {
  const scenario = normalizeScenario(
    {
      ...state.initialScenario,
      phase: 0,
      view: "compare",
      colorMode: "rgb24",
    },
    source,
  );
  return {
    ...state,
    ...scenario,
    source,
    selectedCoordinate: initialCoordinate(source),
    selectedFormat: INITIAL_FORMAT,
    decodeError: undefined,
    ...emptyProgress(),
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
      if (samplingPercent === state.samplingPercent) return state;
      return {
        ...state,
        samplingPercent,
        samplingChanged: true,
        phase: canonicalPhaseForSource(state.source, samplingPercent, state.phase),
      };
    }
    case "set-bit-depth": {
      if (!state.samplingChanged || state.colorMode !== "palette") return state;
      const bitDepth = normalizeBitDepth(action.bitDepth);
      if (bitDepth === state.bitDepth) return state;
      return {
        ...state,
        bitDepth,
        colorAdjusted: state.colorAdjusted || bitDepth < state.initialScenario.bitDepth,
      };
    }
    case "set-color-mode": {
      if (!state.samplingChanged) return state;
      const colorMode = normalizeColorMode(action.colorMode);
      return {
        ...state,
        colorMode,
      };
    }
    case "set-phase":
      if (!state.samplingChanged) return state;
      return {
        ...state,
        phase: canonicalPhaseForSource(
          state.source,
          state.samplingPercent,
          normalizePhase(action.phase),
        ),
      };
    case "set-view":
      return state.samplingChanged ? { ...state, view: action.view } : state;
    case "select-pixel":
      if (!state.samplingChanged) return state;
      return {
        ...state,
        selectedCoordinate: {
          x: Math.max(0, Math.min(state.source.width - 1, Math.floor(action.x))),
          y: Math.max(0, Math.min(state.source.height - 1, Math.floor(action.y))),
        },
      };
    case "select-format":
    case "set-format":
      if (!state.colorAdjusted) return state;
      return {
        ...state,
        selectedFormat: normalizeImageEncodingFormat(action.format),
        formatSelected: true,
      };
    case "edit-calculator-field":
      if (!state.formatSelected) return state;
      return { ...state, calculatorEdited: true };
    case "load-source":
      return resetAfterSourceUpload(state, normalizeImage(action.source));
    case "decode-error":
      return { ...state, decodeError: action.message };
    case "reset":
      return createImageLessonState(state.initialScenario);
  }
}
