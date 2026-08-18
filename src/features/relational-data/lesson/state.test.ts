import { describe, expect, it } from "vitest";
import { createRelationalLessonState, transitionRelationalLesson } from "./state";

describe("Relational lesson state", () => {
  const scenario = { scenario: "catalog" as const };
  const reduce = transitionRelationalLesson;

  it("keeps prediction optional and records a row count", () => {
    const initial = createRelationalLessonState(scenario);
    const invalid = reduce(initial, { type: "record-prediction" });
    const recorded = reduce(reduce(initial, { type: "set-prediction", value: "4" }), {
      type: "record-prediction",
    });

    expect(invalid.prediction).toBeUndefined();
    expect(invalid.predictionMessage).toMatch(/row count/i);
    expect(recorded.prediction).toBe(4);
  });

  it("attaches the prediction to the next frame and runs all queries", () => {
    const initial = createRelationalLessonState(scenario);
    const prepared = reduce(reduce(initial, { type: "set-prediction", value: "4" }), {
      type: "record-prediction",
    });
    const first = reduce(prepared, { type: "step" });
    const complete = reduce(initial, { type: "run-all" });

    expect(first.frames[0].predictedRows).toBe(4);
    expect(first.frames[0].result.rows).toHaveLength(4);
    expect(complete.frames).toHaveLength(4);
    expect(complete.frames[3].result.rows).toHaveLength(2);
    expect(complete.selectedFrameIndex).toBe(3);
  });

  it("selects valid frames, rejects invalid selection, and syncs URL baseline", () => {
    const initial = createRelationalLessonState(scenario);
    const complete = reduce(initial, { type: "run-all" });
    const selected = reduce(complete, { type: "select-frame", index: 1 });
    const invalid = reduce(selected, { type: "select-frame", index: 99 });
    const synced = reduce(complete, { type: "sync-url-scenario", scenario: "catalog" });
    const reset = reduce(synced, { type: "reset" });

    expect(selected.selectedFrameIndex).toBe(1);
    expect(invalid).toBe(selected);
    expect(synced.frames).toEqual([]);
    expect(reset.scenario).toBe("catalog");
  });

  it("keeps completion and repeated Run idempotent", () => {
    const complete = reduce(createRelationalLessonState(scenario), { type: "run-all" });
    expect(reduce(complete, { type: "step" })).toBe(complete);
    expect(reduce(complete, { type: "run-all" })).toBe(complete);
  });
});
