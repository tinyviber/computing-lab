import { describe, expect, it } from "vitest";
import { parseAudioEncodingScenario } from "./scenario";
import { createAudioLessonState, transitionAudioLesson } from "./state";

describe("audio lesson workflow", () => {
  it("marks control changes as editing and reset restores scenario", () => {
    const scenario = parseAudioEncodingScenario("scenario=low-bits");
    let state = createAudioLessonState(scenario);
    state = transitionAudioLesson(state, { type: "set-option", key: "bits", value: 8 });
    expect(state.phase).toBe("editing");
    state = transitionAudioLesson(state, { type: "reset" });
    expect(state).toMatchObject({ sampleRate: 16, bits: 2, phase: "ready" });
  });
});
