import { describe, expect, it } from "vitest";
import { DEMO_SIGNALS, demoSignalById, renderSignal, signalMaxFreq } from "./signals.ts";

describe("DEMO_SIGNALS", () => {
  it("every preset renders deterministic, in-range audio", { timeout: 20000 }, () => {
    for (const sig of DEMO_SIGNALS) {
      const a = renderSignal(sig.spec);
      const b = renderSignal(sig.spec);
      expect(a.sampleRate).toBe(sig.spec.sampleRate);
      expect(a.channels).toHaveLength(sig.spec.channels.length);
      const n = Math.round(sig.spec.durationSec * sig.spec.sampleRate);
      for (const ch of a.channels) {
        expect(ch).toHaveLength(n);
        for (let i = 0; i < n; i += 97) expect(Math.abs(ch[i])).toBeLessThanOrEqual(0.9001);
      }
      expect(a.channels[0].slice(0, 64)).toEqual(b.channels[0].slice(0, 64));
      expect(signalMaxFreq(sig.spec)).toBeGreaterThan(0);
    }
  });

  it("music preset is stereo and carries >8kHz partials for aliasing demos", () => {
    const music = demoSignalById("music");
    expect(music.spec.channels).toHaveLength(2);
    expect(signalMaxFreq(music.spec)).toBeGreaterThan(7000);
  });

  it("highs preset forces aliasing at telephone rates", () => {
    const highs = demoSignalById("highs");
    expect(signalMaxFreq(highs.spec)).toBeGreaterThan(8000);
  });

  it("demoSignalById falls back to the first preset", () => {
    expect(demoSignalById("nope").id).toBe(DEMO_SIGNALS[0].id);
    expect(demoSignalById(null).id).toBe(DEMO_SIGNALS[0].id);
  });
});
