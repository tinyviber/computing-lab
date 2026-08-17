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

  it("reset restores the URL scenario baseline rather than a hidden success profile", () => {
    const scenario = parseImageEncodingScenario("image=checkerboard&sample=25&bits=2&view=error");
    let state = createImageLessonState(scenario);
    state = transitionImageLesson(state, { type: "set-sampling", samplingPercent: 90 });
    state = transitionImageLesson(state, { type: "set-view", view: "compare" });
    state = transitionImageLesson(state, { type: "reset" });
    expect(state).toMatchObject({
      fixture: "checkerboard",
      samplingPercent: 25,
      bitDepth: 2,
      view: "error",
    });
  });
});
