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
});
