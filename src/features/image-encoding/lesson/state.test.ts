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
  it("starts with empty evidence and challenge progress", () => {
    expect(defaultState()).toMatchObject({
      colorMode: "rgb24",
      samplingChanged: false,
      colorAdjusted: false,
      calculatorEdited: false,
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

  it("records only a real sampling change and normalizes invalid values", () => {
    const initial = defaultState();
    expect(
      transitionImageLesson(initial, {
        type: "set-sampling",
        samplingPercent: initial.samplingPercent,
      }),
    ).toEqual(initial);

    expect(
      transitionImageLesson(initial, { type: "set-sampling", samplingPercent: -99 }),
    ).toMatchObject({ samplingPercent: 10, samplingChanged: true });
    expect(
      transitionImageLesson(initial, { type: "set-sampling", samplingPercent: 999 }),
    ).toMatchObject({ samplingPercent: 100, samplingChanged: true });
  });

  it("records sampling evidence without turning it into a navigation gate", () => {
    const paletteBeforeEvidence = transitionImageLesson(defaultState(), {
      type: "set-color-mode",
      colorMode: "palette",
    });
    expect(paletteBeforeEvidence).toMatchObject({ colorMode: "palette", colorAdjusted: true });

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
    expect(evidence.samplingEvidence.baseline?.observationSpot).toBe("text-edge");
    expect(evidence.samplingEvidence.changed?.observation).toContain("边缘");
  });

  it("keeps color mode, bit depth, phase, view, pixel, and calculator independent", () => {
    const palette = stateAfterPalette();
    expect(palette).toMatchObject({
      colorMode: "palette",
      bitDepth: 4,
      colorAdjusted: true,
    });

    const lowerBitDepth = transitionImageLesson(palette, {
      type: "set-bit-depth",
      bitDepth: 2,
    });
    expect(lowerBitDepth).toMatchObject({ bitDepth: 2, colorAdjusted: true });

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

    const colored = transitionImageLesson(initial, {
      type: "set-color-mode",
      colorMode: "palette",
    });
    const calculated = transitionImageLesson(colored, { type: "edit-calculator-field" });
    expect(calculated.calculatorEdited).toBe(true);
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
      samplingChanged: false,
      colorAdjusted: false,
      calculatorEdited: false,
    });
  });

  it("clears compatibility progress when resetting to the initial scenario", () => {
    let state = stateAfterEvidence();
    state = transitionImageLesson(state, { type: "set-color-mode", colorMode: "palette" });
    state = transitionImageLesson(state, { type: "set-bit-depth", bitDepth: 2 });
    state = transitionImageLesson(state, { type: "edit-calculator-field" });
    const reset = transitionImageLesson(state, { type: "reset" });

    expect(reset).toMatchObject({
      fixture: "photo",
      samplingPercent: 50,
      colorMode: "rgb24",
      samplingChanged: false,
      colorAdjusted: false,
      calculatorEdited: false,
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

  it("clears compatibility progress when loading a different URL scenario", () => {
    let state = stateAfterEvidence();
    state = transitionImageLesson(state, { type: "set-color-mode", colorMode: "palette" });
    state = transitionImageLesson(state, { type: "set-bit-depth", bitDepth: 2 });
    state = transitionImageLesson(state, { type: "edit-calculator-field" });
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
      samplingChanged: false,
      colorAdjusted: false,
      calculatorEdited: false,
      samplingEvidence: { baseline: null, changed: null },
      budgetChallenge: { readability: "", tradeoff: "", acknowledged: false },
    });
  });

  it("clears progress and transient upload state when loading a source", () => {
    let changed = stateAfterEvidence();
    changed = transitionImageLesson(changed, { type: "set-color-mode", colorMode: "palette" });
    changed = transitionImageLesson(changed, { type: "set-bit-depth", bitDepth: 2 });
    changed = transitionImageLesson(changed, { type: "edit-calculator-field" });
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
      samplingChanged: false,
      colorAdjusted: false,
      calculatorEdited: false,
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
    edited = transitionImageLesson(edited, { type: "edit-calculator-field" });
    const errored = transitionImageLesson(edited, {
      type: "decode-error",
      message: "所选图像无法解码。",
    });

    expect(errored).toMatchObject({
      samplingPercent: 45,
      samplingChanged: true,
      colorMode: "palette",
      colorAdjusted: true,
      calculatorEdited: true,
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
    expect(state.calculatorEdited).toBe(false);
  });
});
