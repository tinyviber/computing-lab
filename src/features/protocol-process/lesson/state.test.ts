import { describe, expect, it } from "vitest";
import { createProtocolLessonState, transitionProtocolLesson } from "./state";

describe("protocol lesson state", () => {
  const scenario = { scenario: "ack-loss" as const };
  const reduce = transitionProtocolLesson;

  it("keeps prediction optional and records a valid outcome", () => {
    const initial = createProtocolLessonState(scenario);
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
    expect(invalid.predictionMessage).toMatch(/choose/i);
    expect(recorded.prediction).toBe("delivered");
    expect(recorded.predictionMessage).toMatch(/recorded/i);
  });

  it("uses one domain step per lesson frame and runs the expected retry trace", () => {
    const initial = createProtocolLessonState(scenario);
    const first = reduce(initial, { type: "step" });
    const complete = reduce(initial, { type: "run-all" });

    expect(first.frames).toHaveLength(1);
    expect(first.frames[0].event.kind).toBe("send-request");
    expect(complete.frames).toHaveLength(9);
    expect(complete.frames[0].event.kind).toBe("send-request");
    expect(complete.frames.at(-1)?.event.kind).toBe("deliver-ack");
    expect(complete.selectedFrameIndex).toBe(8);
  });

  it("selects guided fault and retry evidence only when present", () => {
    const initial = createProtocolLessonState(scenario);
    const before = reduce(initial, { type: "inspect-first-fault" });
    const complete = reduce(initial, { type: "run-all" });
    const fault = reduce(complete, { type: "inspect-first-fault" });
    const retry = reduce(complete, { type: "inspect-retry" });
    const noLoss = reduce(initial, { type: "set-scenario", scenario: "no-loss" });
    const noLossComplete = reduce(noLoss, { type: "run-all" });
    const noFault = reduce(noLossComplete, { type: "inspect-first-fault" });

    expect(before).toBe(initial);
    expect(fault.selectedFrameIndex).toBe(3);
    expect(retry.selectedFrameIndex).toBe(4);
    expect(noFault).toBe(noLossComplete);

    const silent = reduce(reduce(initial, { type: "set-scenario", scenario: "receiver-silent" }), {
      type: "run-all",
    });
    expect(reduce(silent, { type: "inspect-first-fault" }).selectedFrameIndex).toBe(1);
  });

  it("clears frames and transient prediction state on scenario switch and reset", () => {
    const initial = createProtocolLessonState(scenario);
    const changed = reduce(
      reduce(reduce(initial, { type: "set-prediction-draft", value: "delivered" }), {
        type: "record-prediction",
      }),
      { type: "run-all" },
    );
    const switched = reduce(changed, { type: "set-scenario", scenario: "request-loss" });
    const reset = reduce(changed, { type: "reset" });

    expect(switched.frames).toEqual([]);
    expect(switched.scenario).toBe("request-loss");
    expect(switched.prediction).toBeUndefined();
    expect(reset.scenario).toBe("ack-loss");
    expect(reset.frames).toEqual([]);
    expect(reset.prediction).toBeUndefined();
  });

  it("keeps terminal stepping and repeated run idempotent", () => {
    const complete = reduce(createProtocolLessonState(scenario), { type: "run-all" });
    const afterStep = reduce(complete, { type: "step" });
    const afterRun = reduce(complete, { type: "run-all" });

    expect(afterStep).toBe(complete);
    expect(afterRun).toBe(complete);
  });
});
