import { describe, expect, it } from "vitest";
import { parseImageEncodingScenario } from "./scenario";
import { createImageLessonState, transitionImageLesson } from "./state";

describe("image lesson workflow", () => {
  it("keeps submit gated and progresses only after target success", () => {
    const scenario = parseImageEncodingScenario("");
    let state = createImageLessonState(scenario);

    state = transitionImageLesson(state, { type: "submit" });
    expect(state.phase).toBe("ready");
    state = transitionImageLesson(state, { type: "run-preview" });
    state = transitionImageLesson(state, { type: "submit" });
    expect(state.phase).toBe("success");
    state = transitionImageLesson(state, { type: "next-step" });
    expect(state).toMatchObject({ phase: "ready", step: 2 });
  });

  it("resets edited values to scenario initial state while preserving step", () => {
    const scenario = parseImageEncodingScenario("scenario=low-sampling");
    let state = createImageLessonState(scenario);
    state = transitionImageLesson(state, { type: "set-density", density: 4 });
    state = transitionImageLesson(state, { type: "reset" });
    expect(state).toMatchObject({ density: 2, bits: 8, phase: "ready", step: 1 });
  });
});
