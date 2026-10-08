import { describe, expect, it } from "vitest";
import { renderSignal, signalMaxFreq, signalSpecFor } from "./signals.ts";
import { getAudioStage } from "./stages.ts";
import { audioPeak } from "./metrics.ts";

describe("signalSpecFor", () => {
  it("is deterministic per (user, stage) and differs across users", () => {
    const stage = getAudioStage(2)!;
    const a = signalSpecFor("u-1", stage);
    const b = signalSpecFor("u-2", stage);
    const a2 = signalSpecFor("u-1", stage);
    expect(a2).toEqual(a);
    expect(signalMaxFreq(a)).not.toBe(signalMaxFreq(b));
  });

  it("guided stage ships one shared public signal", () => {
    const stage = getAudioStage(1)!;
    expect(signalSpecFor("u-1", stage)).toEqual(signalSpecFor("u-9", stage));
    expect(signalMaxFreq(signalSpecFor("u-1", stage))).toBe(2750);
  });

  it("design stage produces a stereo fixture", () => {
    const spec = signalSpecFor("u-1", getAudioStage(4)!);
    expect(spec.channels).toHaveLength(2);
  });
});

describe("renderSignal", () => {
  it("renders identical audio for identical specs", () => {
    const spec = signalSpecFor("u-1", getAudioStage(3)!);
    const a = renderSignal(spec);
    const b = renderSignal(spec);
    expect(a.channels[0]).toEqual(b.channels[0]);
  });

  it("normalizes peak to 0.9 and preserves duration", () => {
    const spec = signalSpecFor("u-1", getAudioStage(4)!);
    const audio = renderSignal(spec);
    expect(audio.sampleRate).toBe(spec.sampleRate);
    expect(audio.channels[0].length).toBe(Math.round(spec.durationSec * spec.sampleRate));
    expect(audioPeak(audio)).toBeCloseTo(0.9, 5);
  });
});
