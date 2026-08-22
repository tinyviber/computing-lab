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

function stateAfterColor() {
  return transitionImageLesson(stateAfterSampling(), {
    type: "set-color-mode",
    colorMode: "palette",
  });
}

function stateReadyForFormat() {
  return transitionImageLesson(stateAfterColor(), { type: "set-bit-depth", bitDepth: 2 });
}

function stateAfterCalculator() {
  return transitionImageLesson(stateReadyForFormat(), { type: "edit-calculator-field" });
}

describe("image lesson state", () => {
  it("starts locked with original RGB24 color and no progress", () => {
    const state = defaultState();

    expect(state).toMatchObject({
      colorMode: "rgb24",
      samplingChanged: false,
      colorAdjusted: false,
      formatSelected: false,
      selectedFormat: "raw",
      calculatorEdited: false,
    });
  });

  it("records only a real sampling change and guards dependent actions before it", () => {
    const initial = defaultState();
    const sameSampling = transitionImageLesson(initial, {
      type: "set-sampling",
      samplingPercent: initial.samplingPercent,
    });
    expect(sameSampling).toEqual(initial);

    const ignoredColor = transitionImageLesson(initial, {
      type: "set-color-mode",
      colorMode: "palette",
    });
    expect(ignoredColor).toEqual(initial);
    expect(transitionImageLesson(initial, { type: "set-bit-depth", bitDepth: 2 })).toEqual(initial);
    expect(transitionImageLesson(initial, { type: "set-phase", phase: 0.6 })).toEqual(initial);
    expect(transitionImageLesson(initial, { type: "set-view", view: "representation" })).toEqual(
      initial,
    );
    expect(transitionImageLesson(initial, { type: "select-pixel", x: 0, y: 0 })).toEqual(initial);
    expect(transitionImageLesson(initial, { type: "select-format", format: "png" })).toEqual(
      initial,
    );

    const changed = transitionImageLesson(initial, {
      type: "set-sampling",
      samplingPercent: 45,
    });
    expect(changed).toMatchObject({ samplingPercent: 45, samplingChanged: true });
  });

  it("unlocks palette and bit-depth changes only after sampling", () => {
    const afterSampling = stateAfterSampling();
    expect(transitionImageLesson(afterSampling, { type: "set-bit-depth", bitDepth: 2 })).toEqual(
      afterSampling,
    );

    const palette = transitionImageLesson(afterSampling, {
      type: "set-color-mode",
      colorMode: "palette",
    });
    expect(palette).toMatchObject({
      colorMode: "palette",
      colorAdjusted: false,
      bitDepth: 4,
    });

    expect(transitionImageLesson(palette, { type: "set-bit-depth", bitDepth: 5 })).toMatchObject({
      bitDepth: 5,
      colorAdjusted: false,
    });

    const bitDepth = transitionImageLesson(palette, {
      type: "set-bit-depth",
      bitDepth: 2,
    });
    expect(bitDepth).toMatchObject({ bitDepth: 2, colorAdjusted: true });
  });

  it("unlocks format selection only after raw data calculation", () => {
    const initial = defaultState();
    expect(transitionImageLesson(initial, { type: "select-format", format: "png" })).toMatchObject({
      selectedFormat: "raw",
      formatSelected: false,
    });

    const afterSampling = stateAfterSampling();
    expect(
      transitionImageLesson(afterSampling, { type: "select-format", format: "png" }),
    ).toMatchObject({ selectedFormat: "raw", formatSelected: false });

    expect(
      transitionImageLesson(stateReadyForFormat(), { type: "select-format", format: "png" }),
    ).toMatchObject({ selectedFormat: "raw", formatSelected: false });

    const selected = transitionImageLesson(stateAfterCalculator(), {
      type: "select-format",
      format: "webp",
    });
    expect(selected).toMatchObject({
      selectedFormat: "webp",
      formatSelected: true,
    });
  });

  it("marks the calculator step complete only after a calculator edit", () => {
    const initial = defaultState();
    expect(transitionImageLesson(initial, { type: "edit-calculator-field" })).toEqual(initial);

    const edited = transitionImageLesson(stateReadyForFormat(), {
      type: "edit-calculator-field",
    });
    expect(edited).toMatchObject({ formatSelected: false, calculatorEdited: true });

    const selected = transitionImageLesson(edited, { type: "select-format", format: "png" });
    expect(selected).toMatchObject({ formatSelected: true, calculatorEdited: true });
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "lets a legal %s-bit scenario complete the color step and continue",
    (bits) => {
      const initial = createImageLessonState(
        parseImageEncodingScenario(`image=photo&bits=${bits}`),
      );
      const sampled = transitionImageLesson(initial, { type: "set-sampling", samplingPercent: 45 });
      const palette = transitionImageLesson(sampled, {
        type: "set-color-mode",
        colorMode: "palette",
      });
      const adjusted =
        bits === 1
          ? palette
          : transitionImageLesson(palette, { type: "set-bit-depth", bitDepth: bits - 1 });

      expect(adjusted).toMatchObject({
        colorMode: "palette",
        colorAdjusted: true,
      });
      const calculated = transitionImageLesson(adjusted, {
        type: "edit-calculator-field",
      });
      expect(calculated).toMatchObject({ calculatorEdited: true });
      expect(
        transitionImageLesson(calculated, { type: "select-format", format: "png" }),
      ).toMatchObject({ formatSelected: true });
    },
  );

  it("guards phase and view until sampling, then preserves their domain behavior", () => {
    const initial = defaultState();
    const afterSampling = stateAfterSampling();
    const phased = transitionImageLesson(afterSampling, { type: "set-phase", phase: 0.6 });
    const viewed = transitionImageLesson(afterSampling, {
      type: "set-view",
      view: "representation",
    });

    expect(initial.phase).toBe(0);
    expect(phased.phase).toBe(0.6);
    expect(viewed.view).toBe("representation");
  });

  it("clears progress when resetting to the initial scenario", () => {
    const changed = transitionImageLesson(stateAfterCalculator(), {
      type: "select-format",
      format: "png",
    });
    const reset = transitionImageLesson(changed, { type: "reset" });

    expect(reset).toMatchObject({
      fixture: "photo",
      samplingPercent: 50,
      colorMode: "rgb24",
      samplingChanged: false,
      colorAdjusted: false,
      formatSelected: false,
      selectedFormat: "raw",
      calculatorEdited: false,
      view: "compare",
    });
  });

  it("clears progress when loading a different URL scenario", () => {
    const changed = transitionImageLesson(stateAfterCalculator(), {
      type: "select-format",
      format: "png",
    });
    const loaded = transitionImageLesson(changed, {
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
      formatSelected: false,
      selectedFormat: "raw",
      calculatorEdited: false,
    });
  });

  it("clears progress and transient upload state when loading a source", () => {
    const changed = transitionImageLesson(
      transitionImageLesson(stateAfterCalculator(), { type: "select-format", format: "jpeg" }),
      { type: "decode-error", message: "old upload error" },
    );
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
      formatSelected: false,
      selectedFormat: "raw",
      calculatorEdited: false,
      colorMode: "rgb24",
      view: "compare",
      decodeError: undefined,
    });
    expect(loaded.source.sourceKind).toBe("upload");
    expect(loaded.initialScenario.fixture).toBe("photo");
  });

  it("keeps the current experiment when a decode error is recorded", () => {
    const selected = transitionImageLesson(stateAfterCalculator(), {
      type: "select-format",
      format: "png",
    });
    const edited = transitionImageLesson(selected, { type: "edit-calculator-field" });
    const errored = transitionImageLesson(edited, {
      type: "decode-error",
      message: "所选图像无法解码。",
    });

    expect(errored).toMatchObject({
      samplingPercent: 45,
      samplingChanged: true,
      colorMode: "palette",
      colorAdjusted: true,
      selectedFormat: "png",
      formatSelected: true,
      calculatorEdited: true,
      decodeError: "所选图像无法解码。",
    });
  });
});
