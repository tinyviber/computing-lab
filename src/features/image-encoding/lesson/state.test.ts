import { describe, expect, it } from "vitest";
import { getImageFixture } from "../domain/fixture";
import { parseImageEncodingScenario } from "./scenario";
import { createImageLessonState, transitionImageLesson } from "./state";

function defaultState() {
  return createImageLessonState(parseImageEncodingScenario("image=photo&sample=50&bits=4"));
}

function stateAfterSampling() {
  return transitionImageLesson(defaultState(), { type: "set-sampling", samplingPercent: 45 });
}

function stateAfterEvidence() {
  let state = defaultState();
  state = transitionImageLesson(state, { type: "record-sampling-baseline" });
  state = transitionImageLesson(state, { type: "set-sampling", samplingPercent: 45 });
  state = transitionImageLesson(state, {
    type: "set-observation-spot",
    spot: "text-edge",
  });
  state = transitionImageLesson(state, {
    type: "set-observation",
    observation: "边缘变粗，细节减少。",
  });
  return transitionImageLesson(state, { type: "record-sampling-changed" });
}

function stateAfterPalette() {
  return transitionImageLesson(stateAfterEvidence(), {
    type: "set-color-mode",
    colorMode: "palette",
  });
}

describe("image lesson state", () => {
  it("starts with the experiment state and empty notes", () => {
    expect(defaultState()).toMatchObject({
      colorMode: "rgb24",
      samplingEvidence: {
        baseline: null,
        changed: null,
        observationSpot: "",
        observation: "",
      },
      budgetChallenge: {
        samplingPercent: 50,
        colorMode: "rgb24",
        bitDepth: 4,
        readability: "",
        tradeoff: "",
        acknowledged: false,
      },
    });
  });

  it("normalizes sampling controls and preserves no-op state", () => {
    const initial = defaultState();
    expect(
      transitionImageLesson(initial, {
        type: "set-sampling",
        samplingPercent: initial.samplingPercent,
      }),
    ).toEqual(initial);

    expect(
      transitionImageLesson(initial, { type: "set-sampling", samplingPercent: -99 }),
    ).toMatchObject({ samplingPercent: 10 });
    expect(
      transitionImageLesson(initial, { type: "set-sampling", samplingPercent: 999 }),
    ).toMatchObject({ samplingPercent: 100 });
  });

  it("records sampling evidence without turning it into a navigation gate", () => {
    const paletteBeforeEvidence = transitionImageLesson(defaultState(), {
      type: "set-color-mode",
      colorMode: "palette",
    });
    expect(paletteBeforeEvidence).toMatchObject({ colorMode: "palette" });

    const evidence = stateAfterEvidence();
    expect(evidence.samplingEvidence.baseline).toMatchObject({
      samplingPercent: 50,
      width: 120,
      height: 80,
      pixelCount: 9600,
    });
    expect(evidence.samplingEvidence.changed).toMatchObject({
      samplingPercent: 45,
      width: 108,
      height: 72,
      pixelCount: 7776,
    });
    expect(evidence.samplingEvidence.observationSpot).toBe("text-edge");
    expect(evidence.samplingEvidence.observation).toContain("边缘");
  });

  it("starts a fresh A/B note when sampling baseline is recorded again", () => {
    let state = stateAfterEvidence();
    state = transitionImageLesson(state, { type: "record-sampling-baseline" });

    expect(state.samplingEvidence.baseline).toMatchObject({ samplingPercent: 45 });
    expect(state.samplingEvidence.changed).toBeNull();
    expect(state.samplingEvidence.observationSpot).toBe("");
    expect(state.samplingEvidence.observation).toBe("");

    state = transitionImageLesson(state, { type: "record-sampling-changed" });
    expect(state.samplingEvidence.changed).toMatchObject({ samplingPercent: 45 });
    expect(state.samplingEvidence.observation).toBe("");
  });

  it("keeps color mode, bit depth, phase, view, and pixel state independent", () => {
    const palette = stateAfterPalette();
    expect(palette).toMatchObject({
      colorMode: "palette",
      bitDepth: 4,
    });

    const lowerBitDepth = transitionImageLesson(palette, {
      type: "set-bit-depth",
      bitDepth: 2,
    });
    expect(lowerBitDepth).toMatchObject({ bitDepth: 2 });

    const initial = defaultState();
    const phased = transitionImageLesson(initial, { type: "set-phase", phase: 0.6 });
    expect(phased.phase).toBe(0.6);

    const viewed = transitionImageLesson(initial, {
      type: "set-view",
      view: "representation",
    });
    expect(viewed.view).toBe("representation");

    const selected = transitionImageLesson(initial, { type: "select-pixel", x: -5, y: 999 });
    expect(selected.selectedCoordinate).toEqual({ x: 0, y: 159 });
  });

  it("preserves phase domain behavior when an axis reaches full density", () => {
    const fullDensity = transitionImageLesson(defaultState(), {
      type: "set-sampling",
      samplingPercent: 100,
    });
    const phased = transitionImageLesson(fullDensity, { type: "set-phase", phase: 0.8 });

    expect(phased.samplingPercent).toBe(100);
    expect(phased.phase).toBe(0);
  });

  it("keeps RGB24 as the normalized color mode when loading a URL scenario", () => {
    const loaded = transitionImageLesson(defaultState(), {
      type: "load-scenario",
      scenario: parseImageEncodingScenario(
        "image=checkerboard&sample=25&bits=2&color=palette&view=representation",
      ),
    });

    expect(loaded).toMatchObject({
      fixture: "checkerboard",
      samplingPercent: 25,
      bitDepth: 2,
      colorMode: "rgb24",
      view: "representation",
    });
  });

  it("clears notes and returns to the initial scenario on reset", () => {
    let state = stateAfterEvidence();
    state = transitionImageLesson(state, { type: "set-color-mode", colorMode: "palette" });
    state = transitionImageLesson(state, { type: "set-bit-depth", bitDepth: 2 });
    const reset = transitionImageLesson(state, { type: "reset" });

    expect(reset).toMatchObject({
      fixture: "photo",
      samplingPercent: 50,
      colorMode: "rgb24",
      samplingEvidence: { baseline: null, changed: null, observationSpot: "", observation: "" },
      budgetChallenge: {
        samplingPercent: 50,
        colorMode: "rgb24",
        bitDepth: 4,
        readability: "",
        tradeoff: "",
        acknowledged: false,
      },
      view: "compare",
    });
  });

  it("clears notes when loading a different URL scenario", () => {
    let state = stateAfterEvidence();
    state = transitionImageLesson(state, { type: "set-color-mode", colorMode: "palette" });
    state = transitionImageLesson(state, { type: "set-bit-depth", bitDepth: 2 });
    const loaded = transitionImageLesson(state, {
      type: "load-scenario",
      scenario: parseImageEncodingScenario("image=checkerboard&sample=25&bits=2&view=error"),
    });

    expect(loaded).toMatchObject({
      fixture: "checkerboard",
      samplingPercent: 25,
      bitDepth: 2,
      colorMode: "rgb24",
      view: "error",
      samplingEvidence: { baseline: null, changed: null },
      budgetChallenge: { readability: "", tradeoff: "", acknowledged: false },
    });
  });

  it("clears notes and transient upload state when loading a source", () => {
    let changed = stateAfterEvidence();
    changed = transitionImageLesson(changed, { type: "set-color-mode", colorMode: "palette" });
    changed = transitionImageLesson(changed, { type: "set-bit-depth", bitDepth: 2 });
    changed = transitionImageLesson(changed, {
      type: "decode-error",
      message: "old upload error",
    });
    const uploaded = {
      ...getImageFixture("pixel-grid"),
      id: "upload:pixel-grid",
      label: "pixel-grid.png",
      sourceKind: "upload" as const,
    };
    const loaded = transitionImageLesson(changed, { type: "load-source", source: uploaded });

    expect(loaded).toMatchObject({
      source: uploaded,
      samplingEvidence: { baseline: null, changed: null, observationSpot: "", observation: "" },
      budgetChallenge: { readability: "", tradeoff: "", acknowledged: false },
      colorMode: "rgb24",
      view: "compare",
      decodeError: undefined,
    });
    expect(loaded.initialScenario.fixture).toBe("photo");
  });

  it("keeps the current experiment when a decode error is recorded", () => {
    let edited = stateAfterEvidence();
    edited = transitionImageLesson(edited, { type: "set-color-mode", colorMode: "palette" });
    edited = transitionImageLesson(edited, { type: "set-bit-depth", bitDepth: 2 });
    const errored = transitionImageLesson(edited, {
      type: "decode-error",
      message: "所选图像无法解码。",
    });

    expect(errored).toMatchObject({
      samplingPercent: 45,
      colorMode: "palette",
      decodeError: "所选图像无法解码。",
    });
  });

  it("keeps the budget challenge optional and free of submit runtime", () => {
    let state = defaultState();
    state = transitionImageLesson(state, { type: "set-challenge-sampling", samplingPercent: 25 });
    state = transitionImageLesson(state, {
      type: "set-challenge-readability",
      readability: "yes",
    });
    state = transitionImageLesson(state, {
      type: "set-challenge-tradeoff",
      tradeoff: "降低采样比例，保留目标轮廓。",
    });
    state = transitionImageLesson(state, {
      type: "set-challenge-acknowledged",
      acknowledged: true,
    });

    expect(state.budgetChallenge).toMatchObject({
      samplingPercent: 25,
      readability: "yes",
      tradeoff: "降低采样比例，保留目标轮廓。",
      acknowledged: true,
    });
  });
});
