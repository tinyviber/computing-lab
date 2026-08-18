import { describe, expect, it } from "vitest";
import { createUtf8LessonState, transitionUtf8Lesson } from "./state";

describe("UTF-8 lesson state", () => {
  const scenario = { scenario: "mixed" as const };
  const reduce = transitionUtf8Lesson;

  it("keeps prediction optional and records branch plus final byte count", () => {
    const initial = createUtf8LessonState(scenario);
    const invalid = reduce(initial, { type: "record-prediction" });
    const prepared = reduce(reduce(initial, { type: "set-branch-prediction", value: "1-byte" }), {
      type: "set-bytes-prediction",
      value: "10",
    });
    const recorded = reduce(prepared, { type: "record-prediction" });

    expect(invalid.predictionBranch).toBeUndefined();
    expect(invalid.predictionMessage).toMatch(/choose/i);
    expect(recorded.predictionBranch).toBe("1-byte");
    expect(recorded.predictionBytes).toBe(10);
  });

  it("uses one code point per frame and runs the mixed fixture", () => {
    const initial = createUtf8LessonState(scenario);
    const first = reduce(initial, { type: "step" });
    const complete = reduce(initial, { type: "run-all" });

    expect(first.frames).toHaveLength(1);
    expect(first.frames[0].evidence.character).toBe("A");
    expect(complete.frames).toHaveLength(4);
    expect(complete.machine.bytes).toHaveLength(10);
    expect(complete.selectedFrameIndex).toBe(3);
  });

  it("selects valid frames, rejects invalid selection, and resets URL baseline", () => {
    const initial = createUtf8LessonState(scenario);
    const complete = reduce(initial, { type: "run-all" });
    const selected = reduce(complete, { type: "select-frame", index: 1 });
    const invalid = reduce(selected, { type: "select-frame", index: 99 });
    const switched = reduce(complete, { type: "set-scenario", scenario: "emoji" });
    const reset = reduce(switched, { type: "reset" });

    expect(selected.selectedFrameIndex).toBe(1);
    expect(invalid).toBe(selected);
    expect(switched.frames).toEqual([]);
    expect(reset.scenario).toBe("mixed");
  });

  it("updates the reset baseline when the URL scenario changes", () => {
    const initial = createUtf8LessonState({ scenario: "emoji" });
    const synced = reduce(initial, { type: "sync-url-scenario", scenario: "ascii" });
    const reset = reduce(synced, { type: "reset" });

    expect(synced.scenario).toBe("ascii");
    expect(reset.scenario).toBe("ascii");
  });

  it("keeps completion and repeated Run idempotent", () => {
    const complete = reduce(createUtf8LessonState(scenario), { type: "run-all" });
    expect(reduce(complete, { type: "step" })).toBe(complete);
    expect(reduce(complete, { type: "run-all" })).toBe(complete);
  });
});
