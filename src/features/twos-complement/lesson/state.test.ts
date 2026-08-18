import { describe, expect, it } from "vitest";
import { parseTwosComplementScenario } from "./scenario";
import { createTwosComplementLessonState, transitionTwosComplementLesson } from "./state";

describe("two's-complement lesson state", () => {
  it("keeps fixed-width words while toggling bits and changing width", () => {
    let state = createTwosComplementLessonState(
      parseTwosComplementScenario("width=4&a=1000&b=0001&reading=signed"),
    );
    state = transitionTwosComplementLesson(state, {
      type: "toggle-bit",
      operand: "left",
      msbIndex: 3,
    });
    expect(state.left).toBe("1001");
    expect(state.left).toHaveLength(4);

    state = transitionTwosComplementLesson(state, { type: "set-width", width: 8 });
    expect(state).toMatchObject({
      width: 8,
      left: "11111001",
      right: "00000001",
      reading: "signed",
    });
    expect(state.left).toHaveLength(8);
    expect(state.right).toHaveLength(8);
  });

  it("uses the active reading when expanding words and preserves it", () => {
    let state = createTwosComplementLessonState(
      parseTwosComplementScenario("width=4&a=1000&b=0001&reading=unsigned"),
    );
    state = transitionTwosComplementLesson(state, { type: "set-width", width: 8 });
    expect(state).toMatchObject({ left: "00001000", right: "00000001", reading: "unsigned" });
    state = transitionTwosComplementLesson(state, { type: "set-reading", reading: "signed" });
    expect(state.reading).toBe("signed");
  });

  it("applies guided examples at either finite width without adding workflow state", () => {
    let state = createTwosComplementLessonState(
      parseTwosComplementScenario("width=8&a=00000000&b=00000000&reading=signed"),
    );
    state = transitionTwosComplementLesson(state, {
      type: "apply-example",
      example: "negative-overflow",
    });
    expect(state).toMatchObject({ left: "11111000", right: "11111111", width: 8 });
    expect("submit" in state).toBe(false);
    expect("status" in state).toBe(false);
  });

  it("resets to the original URL scenario rather than an example", () => {
    const scenario = parseTwosComplementScenario("width=4&a=0011&b=0010&reading=unsigned");
    let state = createTwosComplementLessonState(scenario);
    state = transitionTwosComplementLesson(state, { type: "apply-example", example: "carry-only" });
    state = transitionTwosComplementLesson(state, { type: "set-width", width: 8 });
    state = transitionTwosComplementLesson(state, { type: "reset" });
    expect(state).toMatchObject({ ...scenario, initialScenario: scenario });
  });
});
