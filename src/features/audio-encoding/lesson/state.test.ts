import { describe, expect, it } from "vitest";
import * as stateModule from "./state";

type SoundState = Record<string, any>;

const createState =
  (stateModule as Record<string, unknown>).createSoundState ??
  (stateModule as Record<string, unknown>).createAudioLessonState;
const reduce =
  (stateModule as Record<string, unknown>).soundReducer ??
  (stateModule as Record<string, unknown>).transitionSoundState ??
  (stateModule as Record<string, unknown>).transitionAudioLesson;

const initialScenario = {
  source: "pure440",
  sampleRate: 8000,
  bitDepth: 8,
  phase: 0,
  mode: "compare",
  loop: "off",
  view: "compare",
};

function initial(): SoundState {
  expect(createState, "Sound state factory is not exported").toEqual(expect.any(Function));
  return (createState as (scenario: SoundState) => SoundState)(initialScenario);
}

function transition(current: SoundState, action: SoundState): SoundState {
  expect(reduce, "Sound reducer is not exported").toEqual(expect.any(Function));
  return (reduce as (state: SoundState, action: SoundState) => SoundState)(current, action);
}

describe("Sound orthogonal reducer", () => {
  it("keeps config/source, transport, audition, mode, view, cursor, and loop independent", () => {
    const state = initial();
    expect(state).toMatchObject({
      source: "pure440",
      transport: "stopped",
      audition: "original",
      mode: "compare",
      view: "compare",
      cursor: 0,
      loop: "off",
    });
    expect(state).toHaveProperty("config");
  });

  it("plays only through explicit tick actions and stops exactly at the duration", () => {
    let state = transition(initial(), { type: "set-transport", transport: "playing" });
    expect(state.transport).toBe("playing");

    state = transition(state, { type: "tick", deltaMs: 250 });
    expect(state.cursor).toBe(250);
    state = transition(state, { type: "tick", deltaMs: 750 });
    expect(state.cursor).toBe(1000);
    expect(state.transport).toBe("stopped");

    const overshoot = transition(
      transition(initial(), { type: "set-transport", transport: "playing" }),
      { type: "tick", deltaMs: 1200 },
    );
    expect(overshoot.cursor).toBe(1000);
    expect(overshoot.transport).toBe("stopped");
  });

  it("keeps reducer clock ticks distinct from explicit user seeks", () => {
    let state = transition(initial(), { type: "play" });
    state = transition(state, { type: "tick", deltaMs: 100 });
    expect(state).toMatchObject({ cursor: 100, transport: "playing" });

    const sought = transition(state, { type: "seek", cursor: 250 });
    expect(sought).toMatchObject({ cursor: 250, transport: "playing" });

    const tickedAgain = transition(sought, { type: "tick", deltaMs: 50 });
    expect(tickedAgain).toMatchObject({ cursor: 300, transport: "playing" });
    expect(transition(sought, { type: "tick", deltaMs: 0 })).toEqual(sought);
  });

  it("updates a paused seek without starting or stopping transport", () => {
    let state = transition(initial(), { type: "set-transport", transport: "paused" });
    const sought = transition(state, { type: "seek", cursor: 250 });

    expect(state.transport).toBe("stopped");
    expect(sought).toMatchObject({ cursor: 250, transport: "stopped" });
    state = transition(transition(initial(), { type: "play" }), { type: "pause" });
    expect(transition(state, { type: "seek", cursor: 250 })).toMatchObject({
      cursor: 250,
      transport: "paused",
    });
  });

  it("makes invalid, negative, zero, and non-finite ticks no-ops", () => {
    let state = transition(transition(initial(), { type: "set-transport", transport: "playing" }), {
      type: "tick",
      deltaMs: 200,
    });
    for (const deltaMs of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const next = transition(state, { type: "tick", deltaMs });
      expect(next).toEqual(state);
    }
  });

  it("disables playback for a zero-duration fixture", () => {
    const zeroDuration = { ...initialScenario, durationMs: 0 };
    let state = (createState as (scenario: SoundState) => SoundState)(zeroDuration);
    state = transition(state, { type: "set-transport", transport: "playing" });
    const afterTick = transition(state, { type: "tick", deltaMs: 100 });

    expect(afterTick.cursor).toBe(0);
    expect(afterTick.transport).toBe("stopped");
  });

  it("uses the loop as a half-open interval and retains the prior loop for invalid updates", () => {
    let state = transition(initial(), { type: "set-loop", loop: { startMs: 250, endMs: 500 } });
    expect(state.loop).toEqual({ startMs: 250, endMs: 500 });
    state = transition(state, { type: "set-cursor", cursor: 450 });
    state = transition(state, { type: "set-transport", transport: "playing" });
    state = transition(state, { type: "tick", deltaMs: 100 });
    expect(state.cursor).toBe(300);

    const priorLoop = state.loop;
    expect(
      transition(state, { type: "set-loop", loop: { startMs: 500, endMs: 500 } }).loop,
    ).toEqual(priorLoop);
    expect(
      transition(state, { type: "set-loop", loop: { startMs: 700, endMs: 200 } }).loop,
    ).toEqual(priorLoop);
    expect(transition(state, { type: "set-loop", loop: { startMs: -1, endMs: 200 } }).loop).toEqual(
      priorLoop,
    );
  });

  it("reset restores the full matrix, including transport and cursor", () => {
    let state = initial();
    for (const action of [
      { type: "set-source", source: "speech" },
      { type: "set-transport", transport: "playing" },
      { type: "set-audition", audition: "original" },
      { type: "set-mode", mode: "aliasing" },
      { type: "set-view", view: "error" },
      { type: "set-cursor", cursor: 400 },
      { type: "set-loop", loop: { startMs: 100, endMs: 600 } },
    ]) {
      state = transition(state, action);
    }

    expect(transition(state, { type: "reset" })).toMatchObject({
      source: "pure440",
      transport: "stopped",
      audition: "original",
      mode: "compare",
      view: "compare",
      cursor: 0,
      loop: "off",
    });
  });

  it("normalizes a URL loop into the initial state and restores that loop on reset", () => {
    const scenario = {
      ...initialScenario,
      source: "speech",
      sampleRate: 16000,
      bitDepth: 12,
      phase: 0.25,
      mode: "aliasing",
      view: "samples",
      loop: { startMs: 125, endMs: 875 },
    };
    let state = (createState as (scenario: SoundState) => SoundState)(scenario);
    expect(state.loop).toEqual({ startMs: 125, endMs: 875 });

    for (const action of [
      { type: "set-source", source: "high-pulse" },
      { type: "set-sample-rate", sampleRate: 2000 },
      { type: "set-bit-depth", bitDepth: 4 },
      { type: "set-phase", phase: 0.75 },
      { type: "set-mode", mode: "quantization" },
      { type: "set-view", view: "levels" },
      { type: "set-audition", audition: "reconstructed" },
      { type: "set-transport", transport: "playing" },
      { type: "set-cursor", cursor: 400 },
      { type: "set-loop", loop: { startMs: 200, endMs: 600 } },
    ]) {
      state = transition(state, action);
    }

    expect(transition(state, { type: "reset" })).toMatchObject({
      source: "speech",
      config: { sampleRate: 16000, bitDepth: 12, phase: 0.25 },
      mode: "aliasing",
      view: "samples",
      transport: "stopped",
      audition: "original",
      cursor: 0,
      loop: { startMs: 125, endMs: 875 },
    });
  });

  it("keeps reset and terminal transport transitions idempotent", () => {
    let state = transition(initial(), { type: "play" });
    state = transition(state, { type: "tick", deltaMs: 1000 });
    const reset = transition(state, { type: "reset" });

    expect(transition(reset, { type: "reset" })).toEqual(reset);
    expect(transition(state, { type: "stop" })).toEqual(
      transition(transition(state, { type: "stop" }), { type: "stop" }),
    );
  });
});

describe("Sound evidence records", () => {
  function beginEvidence(state: SoundState): SoundState {
    state = transition(state, { type: "record-sound-baseline" });
    state = transition(state, { type: "set-sample-rate", sampleRate: 2000 });
    state = transition(state, { type: "record-sound-changed" });
    return transition(state, {
      type: "set-sound-observation",
      observation: "从 8000 改到 2000 后，声音变得粗糙。",
    });
  }

  it("snapshots the current config when recording baseline and changed groups", () => {
    let state = transition(transition(initial(), { type: "set-sample-rate", sampleRate: 2000 }), {
      type: "set-bit-depth",
      bitDepth: 4,
    });
    state = transition(state, { type: "record-sound-baseline" });
    expect(state.soundEvidence.baseline).toEqual({
      sampleRate: 2000,
      bitDepth: 4,
      audition: "original",
    });
    expect(state.soundEvidence.changed).toBeNull();

    state = transition(state, { type: "set-audition", audition: "reconstructed" });
    state = transition(state, { type: "record-sound-changed" });
    expect(state.soundEvidence.changed).toEqual({
      sampleRate: 2000,
      bitDepth: 4,
      audition: "reconstructed",
    });
  });

  it("starts a fresh A/B note when baseline is recorded again", () => {
    let state = beginEvidence(initial());
    expect(state.soundEvidence.observation).not.toBe("");

    state = transition(state, { type: "record-sound-baseline" });
    expect(state.soundEvidence.baseline).toEqual({
      sampleRate: 2000,
      bitDepth: 8,
      audition: "original",
    });
    expect(state.soundEvidence.changed).toBeNull();
    expect(state.soundEvidence.observation).toBe("");

    state = transition(state, { type: "set-bit-depth", bitDepth: 4 });
    state = transition(state, { type: "record-sound-changed" });
    expect(state.soundEvidence.changed).toEqual({
      sampleRate: 2000,
      bitDepth: 4,
      audition: "original",
    });
    expect(state.soundEvidence.observation).toBe("");
  });

  it("clear-sound-evidence empties baseline, changed, and observation", () => {
    const before = beginEvidence(initial());
    expect(before.soundEvidence.baseline).not.toBeNull();
    expect(before.soundEvidence.changed).not.toBeNull();
    expect(before.soundEvidence.observation).not.toBe("");

    const cleared = transition(before, { type: "clear-sound-evidence" });
    expect(cleared.soundEvidence).toEqual({ baseline: null, changed: null, observation: "" });
    // Clearing evidence must not disturb the rest of the lesson state.
    expect({ ...cleared, soundEvidence: before.soundEvidence }).toEqual(before);
  });

  it("keeps evidence across reset-analysis and reset-transport but clears it on reset", () => {
    let state = beginEvidence(initial());
    state = transition(state, { type: "set-mode", mode: "aliasing" });
    state = transition(state, { type: "set-view", view: "samples" });
    state = transition(state, { type: "play" });
    state = transition(state, { type: "tick", deltaMs: 200 });

    const recorded = state.soundEvidence;
    const analysisReset = transition(state, { type: "reset-analysis" });
    expect(analysisReset.soundEvidence).toEqual(recorded);
    expect(analysisReset.mode).toBe("compare");

    const transportReset = transition(analysisReset, { type: "reset-transport" });
    expect(transportReset.soundEvidence).toEqual(recorded);
    expect(transportReset.cursor).toBe(0);

    const fullReset = transition(transportReset, { type: "reset" });
    expect(fullReset.soundEvidence).toEqual({ baseline: null, changed: null, observation: "" });
  });
});
