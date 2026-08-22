import { describe, expect, it } from "vitest";
import { getImageFixture } from "../domain/fixture";
import { parseImageEncodingScenario } from "./scenario";
import { createImageLessonState, transitionImageLesson } from "./state";

describe("image lesson state", () => {
  it("keeps parameter exploration continuous without phase or submit state", () => {
    const scenario = parseImageEncodingScenario("image=gradient&sample=50&bits=4");
    let state = createImageLessonState(scenario);
    state = transitionImageLesson(state, { type: "set-sampling", samplingPercent: 25 });
    state = transitionImageLesson(state, { type: "set-bit-depth", bitDepth: 2 });
    state = transitionImageLesson(state, { type: "set-phase", phase: 0.6 });
    state = transitionImageLesson(state, { type: "set-view", view: "representation" });
    expect(state).toMatchObject({
      samplingPercent: 25,
      bitDepth: 2,
      phase: 0.6,
      view: "representation",
    });
    expect("submit" in state).toBe(false);
  });

  it("canonicalizes phase against actual rounded geometry", () => {
    const state = createImageLessonState(
      parseImageEncodingScenario("image=checkerboard&sample=99&phase=0.8"),
    );
    expect(state.samplingPercent).toBe(99);
    expect(state.phase).toBe(0);
    expect(transitionImageLesson(state, { type: "set-phase", phase: 0.8 }).phase).toBe(0);
  });

  it("keeps phase when only one uploaded-source axis is full density", () => {
    const narrowSource = {
      id: "upload:narrow",
      label: "Narrow upload",
      sourceKind: "upload" as const,
      width: 3,
      height: 20,
      pixels: Array.from({ length: 60 }, (_, index) => ({ r: index, g: 0, b: 0 })),
    };
    let state = createImageLessonState(parseImageEncodingScenario("image=photo&sample=50"));
    state = transitionImageLesson(state, { type: "load-source", source: narrowSource });
    state = transitionImageLesson(state, { type: "set-sampling", samplingPercent: 90 });
    state = transitionImageLesson(state, { type: "set-phase", phase: 0.8 });
    expect(state).toMatchObject({ samplingPercent: 90, phase: 0.8 });
    expect(transitionImageLesson(state, { type: "set-sampling", samplingPercent: 99 }).phase).toBe(
      0,
    );
  });

  it("selects a bounded source coordinate and keeps uploaded pixels transient", () => {
    const state = createImageLessonState(parseImageEncodingScenario(""));
    const uploaded = {
      ...getImageFixture("pixel-grid"),
      id: "upload:test",
      sourceKind: "upload" as const,
    };
    let next = transitionImageLesson(state, { type: "load-source", source: uploaded });
    next = transitionImageLesson(next, { type: "select-pixel", x: 999, y: -4 });
    expect(next.source.sourceKind).toBe("upload");
    expect(next.selectedCoordinate).toEqual({ x: uploaded.width - 1, y: 0 });
    expect(next.initialScenario.fixture).toBe("photo");
  });

  it("resets an uploaded source to the scenario that opened the page", () => {
    const state = createImageLessonState(parseImageEncodingScenario("image=photo&sample=75"));
    const uploaded = {
      ...getImageFixture("gradient"),
      id: "upload:gradient.png",
      label: "gradient.png",
      sourceKind: "upload" as const,
    };
    let changed = transitionImageLesson(state, { type: "load-source", source: uploaded });
    changed = transitionImageLesson(changed, { type: "set-sampling", samplingPercent: 25 });
    changed = transitionImageLesson(changed, { type: "set-bit-depth", bitDepth: 2 });

    const reset = transitionImageLesson(changed, { type: "reset" });
    expect(reset).toMatchObject({
      fixture: "photo",
      samplingPercent: 75,
      bitDepth: 4,
      source: getImageFixture("photo"),
      initialScenario: state.initialScenario,
    });
    expect(reset.source.sourceKind).toBe("fixture");
  });

  it("reset restores the URL scenario baseline rather than a hidden success profile", () => {
    const scenario = parseImageEncodingScenario(
      "image=checkerboard&sample=25&phase=0.5&bits=2&view=error",
    );
    let state = createImageLessonState(scenario);
    state = transitionImageLesson(state, { type: "set-sampling", samplingPercent: 90 });
    state = transitionImageLesson(state, { type: "set-bit-depth", bitDepth: 8 });
    state = transitionImageLesson(state, { type: "set-phase", phase: 0.75 });
    state = transitionImageLesson(state, { type: "set-view", view: "compare" });
    state = transitionImageLesson(state, { type: "select-pixel", x: 3, y: 4 });
    expect(state.initialScenario).toEqual(scenario);

    const reset = transitionImageLesson(state, { type: "reset" });
    expect(reset).toMatchObject({
      fixture: "checkerboard",
      samplingPercent: 25,
      bitDepth: 2,
      phase: 0.5,
      view: "error",
      initialScenario: scenario,
      selectedCoordinate: { x: 24, y: 16 },
    });
    expect(reset.source).toBe(getImageFixture("checkerboard"));
  });
});
