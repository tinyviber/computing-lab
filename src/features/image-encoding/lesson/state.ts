import { core3Window } from "../domain/checks";
import { getImageFixture } from "../domain/fixture";
import { clamp, type RasterImage, type RGB } from "../domain/model";
import {
  normalizeArtifact,
  type Artifact,
  type ColorStop,
  type ResolutionStop,
} from "../domain/stops";
import { getStage, isStageUnlocked } from "../domain/stages";
import type { ImageScenarioState } from "./scenario";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

export type ImageDraft = {
  core1Bits: string;
  conventionRevealed: boolean;
  core3Edited?: RasterImage;
  restoreObservation: string;
  hallucinationCaseId?: string;
  hallucinationClicks: readonly { x: number; y: number }[];
};

export type ImageStageOutcome = {
  stageIndex: number;
  passed: boolean;
  detail: string;
} | null;

export type ImageLessonState = {
  requestedStageIndex: number;
  stageIndex: number;
  passedStages: number[];
  source: RasterImage;
  artifact: Artifact;
  initialScenario: ImageScenarioState;
  core1Bits: string;
  conventionRevealed: boolean;
  core3Original: RasterImage;
  core3Edited: RasterImage;
  restoreObservation: string;
  hallucinationCaseId?: string;
  hallucinationClicks: readonly { x: number; y: number }[];
  saveStatus: SaveStatus;
  stageOutcome: ImageStageOutcome;
  message: string | null;
};

export type ImageLessonAction =
  | { type: "load-scenario"; scenario: ImageScenarioState }
  | {
      type: "load-project";
      passedStages: number[];
      artifact: Artifact;
      /** Artifact the server-side passes were earned under; defaults to `artifact`. */
      passedArtifact?: Artifact;
      draft?: Partial<ImageDraft>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-resolution-stop"; resStop: ResolutionStop }
  | { type: "set-color-stop"; colorStop: ColorStop }
  | { type: "set-core1-bits"; bits: string }
  | { type: "reveal-convention"; revealed: boolean }
  | { type: "edit-core3-pixel"; x: number; y: number; color: RGB }
  | { type: "reset-core3" }
  | { type: "set-restore-observation"; observation: string }
  | { type: "set-hallucination-case"; caseId?: string }
  | { type: "add-hallucination-click"; x: number; y: number }
  | { type: "clear-hallucination-clicks" }
  | { type: "set-stage-outcome"; outcome: NonNullable<ImageStageOutcome> }
  | { type: "mark-stage-passed"; stageIndex: number; detail: string }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "set-message"; message: string }
  | { type: "dismiss-message" }
  | { type: "reset-stage" };

function core3State(source: RasterImage, artifact: Artifact) {
  const { original } = core3Window(source, artifact);
  return { core3Original: original, core3Edited: original };
}

function legalPassedStages(values: readonly number[]): number[] {
  return [...new Set(values.filter((value) => Number.isInteger(value) && getStage(value)))].sort(
    (a, b) => a - b,
  );
}

function initialStage(requested: number, passedStages: readonly number[]): number {
  return isStageUnlocked(passedStages, requested) ? requested : 1;
}

function sameArtifact(first: Artifact, second: Artifact): boolean {
  return (
    first.image === second.image &&
    first.resStop === second.resStop &&
    first.colorStop === second.colorStop
  );
}

function stateForScenario(scenario: ImageScenarioState): ImageLessonState {
  const artifact = normalizeArtifact(scenario.artifact);
  const source = getImageFixture(artifact.image);
  return {
    requestedStageIndex: scenario.stageIndex,
    stageIndex: initialStage(scenario.stageIndex, []),
    passedStages: [],
    source,
    artifact,
    initialScenario: { ...scenario, artifact },
    core1Bits: "",
    conventionRevealed: false,
    ...core3State(source, artifact),
    restoreObservation: "",
    hallucinationCaseId: scenario.caseId,
    hallucinationClicks: [],
    saveStatus: "idle",
    stageOutcome: null,
    message: null,
  };
}

export function createImageLessonState(scenario: ImageScenarioState): ImageLessonState {
  return stateForScenario(scenario);
}

function withArtifact(state: ImageLessonState, artifactInput: Artifact): ImageLessonState {
  const artifact = normalizeArtifact(artifactInput);
  const source = getImageFixture(artifact.image);
  if (
    artifact.image === state.artifact.image &&
    artifact.resStop === state.artifact.resStop &&
    artifact.colorStop === state.artifact.colorStop
  ) {
    return state;
  }
  return {
    ...state,
    source,
    artifact,
    passedStages: state.passedStages.filter((stage) => stage !== 2 && stage !== 3),
    ...core3State(source, artifact),
    saveStatus: "dirty",
    stageOutcome: null,
  };
}

function channel(value: number): number {
  return clamp(Math.round(Number.isFinite(value) ? value : 0), 0, 255);
}

function editCore3Pixel(
  state: ImageLessonState,
  action: Extract<ImageLessonAction, { type: "edit-core3-pixel" }>,
): ImageLessonState {
  const x = Math.floor(action.x);
  const y = Math.floor(action.y);
  if (x < 0 || y < 0 || x >= state.core3Edited.width || y >= state.core3Edited.height) return state;
  const index = y * state.core3Edited.width + x;
  const pixels = state.core3Edited.pixels.slice();
  pixels[index] = {
    r: channel(action.color.r),
    g: channel(action.color.g),
    b: channel(action.color.b),
  };
  return {
    ...state,
    core3Edited: { ...state.core3Edited, pixels },
    saveStatus: "dirty",
    stageOutcome: null,
  };
}

export function transitionImageLesson(
  state: ImageLessonState,
  action: ImageLessonAction,
): ImageLessonState {
  switch (action.type) {
    case "load-scenario": {
      const next = stateForScenario(action.scenario);
      const passedStages = sameArtifact(next.artifact, state.artifact)
        ? state.passedStages
        : state.passedStages.filter((stage) => stage !== 2 && stage !== 3);
      return {
        ...next,
        passedStages,
        stageIndex: initialStage(action.scenario.stageIndex, passedStages),
      };
    }
    case "load-project": {
      const rawPassed = legalPassedStages(action.passedStages);
      const passedStages = sameArtifact(
        normalizeArtifact(action.passedArtifact ?? action.artifact),
        normalizeArtifact(action.artifact),
      )
        ? rawPassed
        : rawPassed.filter((stage) => stage !== 2 && stage !== 3);
      const next = withArtifact(state, action.artifact);
      const edited = action.draft?.core3Edited;
      const core3Edited =
        edited &&
        edited.width === next.core3Original.width &&
        edited.height === next.core3Original.height
          ? edited
          : next.core3Original;
      return {
        ...next,
        passedStages,
        stageIndex: initialStage(state.requestedStageIndex, passedStages),
        core1Bits: (action.draft?.core1Bits ?? "").replace(/[^01]/g, "").slice(0, 16),
        conventionRevealed: action.draft?.conventionRevealed === true,
        core3Edited,
        restoreObservation: action.draft?.restoreObservation ?? "",
        hallucinationCaseId: action.draft?.hallucinationCaseId ?? state.hallucinationCaseId,
        hallucinationClicks: action.draft?.hallucinationClicks ?? [],
        saveStatus: "idle",
        stageOutcome: null,
      };
    }
    case "select-stage":
      return isStageUnlocked(state.passedStages, action.stageIndex)
        ? { ...state, stageIndex: action.stageIndex, stageOutcome: null, message: null }
        : { ...state, message: "完成全部三个主线关卡后再来挑战。" };
    case "set-resolution-stop":
      return withArtifact(state, { ...state.artifact, resStop: action.resStop });
    case "set-color-stop":
      return withArtifact(state, { ...state.artifact, colorStop: action.colorStop });
    case "set-core1-bits":
      return {
        ...state,
        core1Bits: action.bits.replace(/[^01]/g, "").slice(0, 16),
        saveStatus: "dirty",
        stageOutcome: null,
      };
    case "reveal-convention":
      return { ...state, conventionRevealed: action.revealed, saveStatus: "dirty" };
    case "edit-core3-pixel":
      return editCore3Pixel(state, action);
    case "reset-core3":
      return {
        ...state,
        core3Edited: state.core3Original,
        saveStatus: "dirty",
        stageOutcome: null,
      };
    case "set-restore-observation":
      return {
        ...state,
        restoreObservation: action.observation.slice(0, 1000),
        saveStatus: "dirty",
      };
    case "set-hallucination-case":
      return {
        ...state,
        hallucinationCaseId: action.caseId,
        hallucinationClicks: [],
        stageOutcome: null,
      };
    case "add-hallucination-click":
      if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) return state;
      return {
        ...state,
        hallucinationClicks: [
          ...state.hallucinationClicks,
          { x: Math.max(0, action.x), y: Math.max(0, action.y) },
        ].slice(-20),
        saveStatus: "dirty",
        stageOutcome: null,
      };
    case "clear-hallucination-clicks":
      return { ...state, hallucinationClicks: [], stageOutcome: null };
    case "set-stage-outcome":
      return { ...state, stageOutcome: action.outcome };
    case "mark-stage-passed": {
      if (!isStageUnlocked(state.passedStages, action.stageIndex)) return state;
      return {
        ...state,
        passedStages: legalPassedStages([...state.passedStages, action.stageIndex]),
        stageOutcome: { stageIndex: action.stageIndex, passed: true, detail: action.detail },
        saveStatus: "dirty",
      };
    }
    case "mark-saving":
      return { ...state, saveStatus: "saving" };
    case "mark-saved":
      return { ...state, saveStatus: "saved" };
    case "mark-save-error":
      return { ...state, saveStatus: "error" };
    case "set-message":
      return { ...state, message: action.message };
    case "dismiss-message":
      return { ...state, message: null };
    case "reset-stage":
      if (state.stageIndex === 1) {
        return { ...state, core1Bits: "", conventionRevealed: false, stageOutcome: null };
      }
      if (state.stageIndex === 2) {
        return {
          ...withArtifact(state, state.initialScenario.artifact),
          stageOutcome: null,
        };
      }
      if (state.stageIndex === 3) {
        return { ...state, core3Edited: state.core3Original, stageOutcome: null };
      }
      if (state.stageIndex === 4) {
        return { ...state, restoreObservation: "", stageOutcome: null };
      }
      return { ...state, hallucinationClicks: [], stageOutcome: null };
  }
}

export function imageDraft(state: ImageLessonState): ImageDraft {
  return {
    core1Bits: state.core1Bits,
    conventionRevealed: state.conventionRevealed,
    core3Edited: state.core3Edited,
    restoreObservation: state.restoreObservation,
    hallucinationCaseId: state.hallucinationCaseId,
    hallucinationClicks: state.hallucinationClicks,
  };
}
