import { describe, expect, it } from "vitest";
import { createByteEditLessonState, transitionByteEditLesson } from "./state";

describe("Byte Edit lesson state", () => {
  const scenario = { scenario: "mixed" as const };
  const reduce = transitionByteEditLesson;

  it("keeps prediction optional and records valid/invalid", () => {
    const initial = createByteEditLessonState(scenario);
    const invalid = reduce(initial, { type: "record-prediction" });
    const recorded = reduce(reduce(initial, { type: "set-prediction", value: "invalid" }), {
      type: "record-prediction",
    });

    expect(invalid.predictionValid).toBeUndefined();
    expect(invalid.predictionMessage).toMatch(/valid or invalid/i);
    expect(recorded.predictionValid).toBe(false);
  });

  it("applies one byte edit per frame and attaches the prediction", () => {
    const initial = createByteEditLessonState(scenario);
    const prepared = reduce(
      reduce(reduce(initial, { type: "set-prediction", value: "invalid" }), {
        type: "record-prediction",
      }),
      { type: "set-edit-index", value: "2" },
    );
    const edited = reduce(reduce(prepared, { type: "set-edit-value", value: "65" }), {
      type: "apply-edit",
    });

    expect(edited.frames).toHaveLength(1);
    expect(edited.frames[0].edit).toEqual({ kind: "byte", byteIndex: 2, value: 65 });
    expect(edited.frames[0].predictedValid).toBe(false);
    expect(edited.frames[0].decode).toMatchObject({
      valid: false,
      reason: "missing continuation byte",
    });
    expect(edited.selectedFrameIndex).toBe(0);
  });

  it("loads presets, rejects bad edits, and restores via original", () => {
    const initial = createByteEditLessonState(scenario);
    const surrogate = reduce(initial, { type: "apply-preset", preset: "surrogate" });
    const restored = reduce(surrogate, { type: "apply-preset", preset: "original" });
    const badEdit = reduce(
      reduce(reduce(initial, { type: "set-edit-index", value: "99" }), {
        type: "set-edit-value",
        value: "1",
      }),
      { type: "apply-edit" },
    );

    expect(surrogate.frames[0].decode).toMatchObject({
      valid: false,
      reason: "surrogate code point",
    });
    expect(restored.machine.bytes).toEqual(getMixedBytes());
    expect(badEdit.frames).toHaveLength(0);
    expect(badEdit.predictionMessage).toMatch(/byte index/i);
  });

  it("selects valid frames, rejects invalid selection, and syncs URL baseline", () => {
    const initial = createByteEditLessonState(scenario);
    const surrogate = reduce(initial, { type: "apply-preset", preset: "truncated" });
    const selected = reduce(surrogate, { type: "select-frame", index: 0 });
    const invalid = reduce(selected, { type: "select-frame", index: 99 });
    const synced = reduce(surrogate, { type: "sync-url-scenario", scenario: "emoji" });
    const reset = reduce(synced, { type: "reset" });

    expect(selected.selectedFrameIndex).toBe(0);
    expect(invalid).toBe(selected);
    expect(synced.frames).toEqual([]);
    expect(reset.scenario).toBe("emoji");
  });
});

function getMixedBytes(): number[] {
  return [0x41, 0xc3, 0xa9, 0xe7, 0x8c, 0xab, 0xf0, 0x9f, 0x99, 0x82];
}
