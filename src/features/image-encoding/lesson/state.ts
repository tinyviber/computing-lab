import { getImageFixture } from "../domain/fixture";
import type { RasterImage } from "../domain/model";
import {
  isSamplingPhaseInert,
  normalizeColorMode,
  normalizeBitDepth,
  normalizeImage,
  normalizePhase,
  normalizeSamplingPercent,
  sampledDimensions,
} from "../domain/model";
import type { ImageScenarioState } from "./scenario";

export type ImageView = "compare" | "sampling" | "quantization" | "representation" | "error";

export type SamplingObservationSpot = "text-edge" | "object-outline" | "color-boundary" | "other";

export type SamplingSnapshot = {
  sourceId: string;
  samplingPercent: number;
  width: number;
  height: number;
  pixelCount: number;
  observationSpot: SamplingObservationSpot | "";
  observation: string;
};

export type SamplingEvidence = {
  baseline: SamplingSnapshot | null;
  changed: SamplingSnapshot | null;
  observationSpot: SamplingObservationSpot | "";
  observation: string;
};

export type ChallengeReadability = "yes" | "no" | "";

export type ImageBudgetChallenge = {
  samplingPercent: number;
  colorMode: "palette" | "rgb24";
  bitDepth: number;
  readability: ChallengeReadability;
  tradeoff: string;
  acknowledged: boolean;
};

export type ImageLessonState = ImageScenarioState & {
  source: RasterImage;
  initialScenario: ImageScenarioState;
  selectedCoordinate: { x: number; y: number };
  decodeError?: string;
  samplingChanged: boolean;
  colorAdjusted: boolean;
  calculatorEdited: boolean;
  samplingEvidence: SamplingEvidence;
  budgetChallenge: ImageBudgetChallenge;
};

export type ImageLessonAction =
  | { type: "load-scenario"; scenario: ImageScenarioState }
  | { type: "set-sampling"; samplingPercent: number }
  | { type: "set-bit-depth"; bitDepth: number }
  | { type: "set-color-mode"; colorMode: "palette" | "rgb24" }
  | { type: "set-phase"; phase: number }
  | { type: "set-view"; view: ImageView }
  | { type: "select-pixel"; x: number; y: number }
  | { type: "edit-calculator-field" }
  | { type: "set-observation-spot"; spot: SamplingObservationSpot | "" }
  | { type: "set-observation"; observation: string }
  | { type: "record-sampling-baseline" }
  | { type: "record-sampling-changed" }
  | { type: "set-challenge-sampling"; samplingPercent: number }
  | { type: "set-challenge-color-mode"; colorMode: "palette" | "rgb24" }
  | { type: "set-challenge-bit-depth"; bitDepth: number }
  | { type: "set-challenge-readability"; readability: ChallengeReadability }
  | { type: "set-challenge-tradeoff"; tradeoff: string }
  | { type: "set-challenge-acknowledged"; acknowledged: boolean }
  | { type: "load-source"; source: RasterImage }
  | { type: "decode-error"; message: string }
  | { type: "reset" };

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
    calculatorEdited: false,
    samplingEvidence: emptySamplingEvidence(),
    budgetChallenge: emptyBudgetChallenge(),
  };
}

function emptySamplingEvidence(): SamplingEvidence {
  return {
    baseline: null,
    changed: null,
    observationSpot: "",
    observation: "",
  };
}

function emptyBudgetChallenge(): ImageBudgetChallenge {
  return {
    samplingPercent: 50,
    colorMode: "rgb24",
    bitDepth: 4,
    readability: "",
    tradeoff: "",
    acknowledged: false,
  };
}

export function isSamplingEvidenceComplete(evidence: SamplingEvidence): boolean {
  const baseline = evidence.baseline;
  const changed = evidence.changed;
  return Boolean(
    baseline &&
    changed &&
    baseline.sourceId === changed.sourceId &&
    baseline.samplingPercent !== changed.samplingPercent &&
    baseline.observationSpot &&
    changed.observationSpot &&
    baseline.observationSpot === changed.observationSpot &&
    baseline.observation.trim() &&
    changed.observation.trim(),
  );
}

function samplingSnapshot(state: ImageLessonState): SamplingSnapshot {
  const dimensions = sampledDimensions(state.source, state.samplingPercent);
  return {
    sourceId: state.source.id,
    samplingPercent: state.samplingPercent,
    width: dimensions.width,
    height: dimensions.height,
    pixelCount: dimensions.width * dimensions.height,
    observationSpot: state.samplingEvidence.observationSpot,
    observation: state.samplingEvidence.observation,
  };
}

function withEvidenceField(
  evidence: SamplingEvidence,
  field: "observationSpot" | "observation",
  value: SamplingObservationSpot | "" | string,
): SamplingEvidence {
  return {
    ...evidence,
    [field]: value,
    baseline: evidence.baseline ? { ...evidence.baseline, [field]: value } : null,
    changed: evidence.changed ? { ...evidence.changed, [field]: value } : null,
  } as SamplingEvidence;
}

function stateForSource(scenario: ImageScenarioState, source: RasterImage): ImageLessonState {
  const normalizedScenario = normalizeScenario(scenario, source);
  return {
    ...normalizedScenario,
    source,
    initialScenario: { ...normalizedScenario },
    selectedCoordinate: initialCoordinate(source),
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
      if (state.colorMode !== "palette") return state;
      const bitDepth = normalizeBitDepth(action.bitDepth);
      if (bitDepth === state.bitDepth) return state;
      return {
        ...state,
        bitDepth,
        colorAdjusted: true,
      };
    }
    case "set-color-mode": {
      const colorMode = normalizeColorMode(action.colorMode);
      return {
        ...state,
        colorMode,
        colorAdjusted: true,
      };
    }
    case "set-phase":
      return {
        ...state,
        phase: canonicalPhaseForSource(
          state.source,
          state.samplingPercent,
          normalizePhase(action.phase),
        ),
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
    case "edit-calculator-field":
      return { ...state, calculatorEdited: true };
    case "set-observation-spot":
      return {
        ...state,
        samplingEvidence: withEvidenceField(state.samplingEvidence, "observationSpot", action.spot),
      };
    case "set-observation":
      return {
        ...state,
        samplingEvidence: withEvidenceField(
          state.samplingEvidence,
          "observation",
          action.observation,
        ),
      };
    case "record-sampling-baseline":
      return {
        ...state,
        samplingEvidence: {
          ...state.samplingEvidence,
          baseline: samplingSnapshot(state),
          changed: null,
        },
      };
    case "record-sampling-changed":
      return {
        ...state,
        samplingEvidence: {
          ...state.samplingEvidence,
          changed: samplingSnapshot(state),
        },
      };
    case "set-challenge-sampling":
      return {
        ...state,
        budgetChallenge: {
          ...state.budgetChallenge,
          samplingPercent: normalizeSamplingPercent(action.samplingPercent),
        },
      };
    case "set-challenge-color-mode":
      return {
        ...state,
        budgetChallenge: {
          ...state.budgetChallenge,
          colorMode: normalizeColorMode(action.colorMode),
        },
      };
    case "set-challenge-bit-depth":
      if (state.budgetChallenge.colorMode !== "palette") return state;
      return {
        ...state,
        budgetChallenge: {
          ...state.budgetChallenge,
          bitDepth: normalizeBitDepth(action.bitDepth),
        },
      };
    case "set-challenge-readability":
      return {
        ...state,
        budgetChallenge: {
          ...state.budgetChallenge,
          readability: action.readability,
        },
      };
    case "set-challenge-tradeoff":
      return {
        ...state,
        budgetChallenge: {
          ...state.budgetChallenge,
          tradeoff: action.tradeoff,
        },
      };
    case "set-challenge-acknowledged":
      return {
        ...state,
        budgetChallenge: {
          ...state.budgetChallenge,
          acknowledged: action.acknowledged,
        },
      };
    case "load-source":
      return resetAfterSourceUpload(state, normalizeImage(action.source));
    case "decode-error":
      return { ...state, decodeError: action.message };
    case "reset":
      return createImageLessonState(state.initialScenario);
  }
}
