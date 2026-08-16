import { describe, expect, it } from "vitest";
import { parseHomeNetworkScenario } from "./scenario";
import { createHomeNetworkLessonState, transitionHomeNetworkLesson } from "./state";

describe("home network lesson workflow", () => {
  it("keeps validation result as lesson phase and reset restores gateway", () => {
    const scenario = parseHomeNetworkScenario("scenario=wrong-gateway");
    let state = createHomeNetworkLessonState(scenario);
    state = transitionHomeNetworkLesson(state, { type: "submit", valid: false });
    expect(state.phase).toBe("failure");
    state = transitionHomeNetworkLesson(state, {
      type: "set-gateway",
      gateway: "192.168.1.1",
    });
    state = transitionHomeNetworkLesson(state, { type: "submit", valid: true });
    expect(state.phase).toBe("success");
    state = transitionHomeNetworkLesson(state, { type: "reset" });
    expect(state).toMatchObject({ gateway: "192.168.1.254", phase: "ready" });
  });
});
