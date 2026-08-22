import { describe, expect, it } from "vitest";
import { createProtocolLessonState, transitionProtocolLesson } from "./state";

describe("protocol lesson state", () => {
  const reduce = transitionProtocolLesson;
  function runToEnd(state: ReturnType<typeof createProtocolLessonState>) {
    let current = state;
    while (current.machine.status === "running") current = reduce(current, { type: "step" });
    return current;
  }

  it("keeps prediction optional and records timeout uncertainty", () => {
    const initial = createProtocolLessonState({ scenario: "ack-loss" });
    const invalid = reduce(initial, { type: "record-prediction" });
    const prepared = reduce(
      reduce(reduce(initial, { type: "set-prediction-draft", value: "delivered" }), {
        type: "set-prediction-attempts-draft",
        value: "2",
      }),
      { type: "set-timeout-conclusion-draft", value: "status-unknown" },
    );
    const recorded = reduce(prepared, { type: "record-prediction" });
    expect(invalid.prediction).toBeUndefined();
    expect(recorded).toMatchObject({
      prediction: "delivered",
      predictionAttempts: 2,
      timeoutConclusion: "status-unknown",
    });
  });

  it.each([
    ["no-loss", ["send-request", "deliver-request", "send-ack", "deliver-ack"], "delivered"],
    [
      "request-loss",
      ["send-request", "timeout", "send-request", "deliver-request", "send-ack", "deliver-ack"],
      "delivered",
    ],
    [
      "ack-loss",
      [
        "send-request",
        "deliver-request",
        "send-ack",
        "deliver-ack",
        "timeout",
        "send-request",
        "deliver-request",
        "send-ack",
        "deliver-ack",
      ],
      "delivered",
    ],
    [
      "receiver-silent",
      ["send-request", "deliver-request", "timeout", "send-request", "deliver-request", "timeout"],
      "failed",
    ],
  ] as const)("projects %s as a complete semantic event sequence", (scenario, kinds, status) => {
    const complete = runToEnd(createProtocolLessonState({ scenario }));
    expect(complete.frames.map((frame) => frame.event.kind)).toEqual(kinds);
    expect(complete.machine.status).toBe(status);
    expect(complete.selectedFrameIndex).toBe(kinds.length - 1);
    expect(complete.frames.every((frame) => frame.after.now === frame.event.at)).toBe(true);
  });

  it("keeps retry duplicate evidence distinct from request loss", () => {
    const ackLoss = runToEnd(createProtocolLessonState({ scenario: "ack-loss" }));
    const requestLoss = runToEnd(createProtocolLessonState({ scenario: "request-loss" }));
    expect(ackLoss.frames.some((frame) => frame.event.outcome === "duplicate-suppressed")).toBe(
      true,
    );
    expect(requestLoss.frames.some((frame) => frame.event.outcome === "duplicate-suppressed")).toBe(
      false,
    );
    expect(ackLoss.machine.duplicateCount).toBe(1);
    expect(requestLoss.machine.duplicateCount).toBe(0);
  });

  it("does not require prediction before stepping and restores the original URL scenario", () => {
    const initial = createProtocolLessonState({ scenario: "request-loss" });
    const stepped = reduce(initial, { type: "step" });
    const changed = reduce(stepped, { type: "set-scenario", scenario: "no-loss" });
    const reset = reduce(changed, { type: "reset" });
    expect(stepped.frames).toHaveLength(1);
    expect(changed.frames).toEqual([]);
    expect(reset.scenario).toBe("request-loss");
    expect(reset.prediction).toBeUndefined();
  });
});
