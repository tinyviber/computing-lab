import { describe, expect, it } from "vitest";
import { createMonteCarloLessonState, transitionMonteCarloLesson } from "./state";

describe("Monte Carlo lesson state", () => {
  const scenario = { scenario: "small" as const };
  const reduce = transitionMonteCarloLesson;

  it("keeps prediction optional and records above/below π", () => {
    const initial = createMonteCarloLessonState(scenario);
    const invalid = reduce(initial, { type: "record-prediction" });
    const recorded = reduce(reduce(initial, { type: "set-prediction", value: "below" }), {
      type: "record-prediction",
    });

    expect(invalid.prediction).toBeUndefined();
    expect(invalid.predictionMessage).toMatch(/choose/i);
    expect(recorded.prediction).toBe("below");
  });

  it("uses one batch per frame and completes the small fixture", () => {
    const initial = createMonteCarloLessonState(scenario);
    const first = reduce(initial, { type: "step" });
    const complete = reduce(initial, { type: "run-all" });

    expect(first.frames).toHaveLength(1);
    expect(first.frames[0].batch).toBe(1);
    expect(first.frames[0].sampleCount).toBe(250);
    expect(complete.frames).toHaveLength(4);
    expect(complete.machine.samplesDrawn).toBe(1000);
    expect(complete.selectedFrameIndex).toBe(3);
  });

  it("selects valid frames, rejects invalid selection, and syncs URL baseline", () => {
    const initial = createMonteCarloLessonState(scenario);
    const complete = reduce(initial, { type: "run-all" });
    const selected = reduce(complete, { type: "select-frame", index: 1 });
    const invalid = reduce(selected, { type: "select-frame", index: 99 });
    const synced = reduce(complete, { type: "sync-url-scenario", scenario: "large" });
    const reset = reduce(synced, { type: "reset" });

    expect(selected.selectedFrameIndex).toBe(1);
    expect(invalid).toBe(selected);
    expect(synced.frames).toEqual([]);
    expect(reset.scenario).toBe("large");
  });

  it("keeps completion and repeated Run idempotent", () => {
    const complete = reduce(createMonteCarloLessonState(scenario), { type: "run-all" });
    expect(reduce(complete, { type: "step" })).toBe(complete);
    expect(reduce(complete, { type: "run-all" })).toBe(complete);
  });
});
