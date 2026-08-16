import { getSoundFixture, type SoundSource } from "../domain/fixtures";
import { normalizeSoundConfig, type SoundConfig } from "../domain/model";
import type { SoundLoop, SoundMode, SoundScenario, SoundView } from "./scenario";

export type SoundTransport = "stopped" | "playing" | "paused";
export type SoundAudition = "original" | "reconstructed";

type SoundResetState = {
  source: SoundSource;
  config: SoundConfig;
  mode: SoundMode;
  view: SoundView;
  durationMs: number;
};

export type SoundLessonState = SoundResetState & {
  transport: SoundTransport;
  audition: SoundAudition;
  cursor: number;
  loop: SoundLoop;
  initial: SoundResetState;
};

export type SoundLessonAction =
  | { type: "load-scenario"; scenario: SoundScenario }
  | { type: "set-source"; source: SoundSource }
  | { type: "set-config"; key: keyof SoundConfig; value: number }
  | { type: "set-sample-rate"; sampleRate: number }
  | { type: "set-bit-depth"; bitDepth: number }
  | { type: "set-phase"; phase: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "stop" }
  | { type: "set-transport"; transport: SoundTransport }
  | { type: "set-audition"; audition: SoundAudition }
  | { type: "set-mode"; mode: SoundMode }
  | { type: "set-view"; view: SoundView }
  | { type: "set-cursor"; cursor: number }
  | { type: "set-loop"; loop: SoundLoop }
  | { type: "tick"; deltaMs: number }
  | { type: "reset" }
  | { type: "reset-transport" }
  | { type: "reset-analysis" };

function resetState(scenario: SoundScenario): SoundResetState {
  return {
    source: scenario.source,
    config: normalizeSoundConfig(scenario),
    mode: scenario.mode,
    view: scenario.view,
    durationMs: Number.isFinite(scenario.durationMs)
      ? Math.max(0, scenario.durationMs as number)
      : getSoundFixture(scenario.source).durationMs,
  };
}

export function createSoundLessonState(scenario: SoundScenario): SoundLessonState {
  const initial = resetState(scenario);
  return {
    ...initial,
    transport: "stopped",
    audition: "original",
    cursor: 0,
    loop: normalizeLoop(scenario.loop, initial.durationMs),
    initial,
  };
}

function validLoop(loop: SoundLoop, durationMs: number): boolean {
  if (loop === "off") return true;
  return (
    durationMs > 0 &&
    Number.isFinite(loop.startMs) &&
    Number.isFinite(loop.endMs) &&
    loop.startMs >= 0 &&
    loop.endMs <= durationMs &&
    loop.startMs < loop.endMs
  );
}

function normalizeLoop(loop: SoundLoop, durationMs: number): SoundLoop {
  if (loop === "off" || durationMs <= 0) return "off";
  const startMs = Math.min(durationMs, Math.max(0, loop.startMs));
  const endMs = Math.min(durationMs, Math.max(0, loop.endMs));
  return startMs < endMs ? { startMs, endMs } : "off";
}

function updateConfig(state: SoundLessonState, key: keyof SoundConfig, value: number) {
  const config = normalizeSoundConfig({ ...state.config, [key]: value });
  return {
    ...state,
    config,
    cursor: 0,
    transport: "stopped" as const,
    loop: normalizeLoop(state.loop, state.durationMs),
  };
}

function tickSound(state: SoundLessonState, deltaMs: number): SoundLessonState {
  if (state.transport !== "playing" || !Number.isFinite(deltaMs) || deltaMs <= 0) return state;
  const durationMs = state.durationMs;
  if (durationMs <= 0) return { ...state, cursor: 0, transport: "stopped" };
  const next = state.cursor + deltaMs;
  if (state.loop !== "off" && validLoop(state.loop, durationMs) && next >= state.loop.endMs) {
    const span = state.loop.endMs - state.loop.startMs;
    const wrapped = state.loop.startMs + ((next - state.loop.startMs) % span);
    return { ...state, cursor: wrapped, transport: "playing" };
  }
  if (next >= durationMs) return { ...state, cursor: durationMs, transport: "stopped" };
  return { ...state, cursor: next };
}

function startPlayback(state: SoundLessonState): SoundLessonState {
  if (state.durationMs <= 0) return { ...state, cursor: 0, transport: "stopped" };
  return {
    ...state,
    cursor: state.cursor >= state.durationMs ? 0 : state.cursor,
    transport: "playing",
  };
}

function pausePlayback(state: SoundLessonState): SoundLessonState {
  return state.transport === "playing" ? { ...state, transport: "paused" } : state;
}

export function transitionSoundLesson(
  state: SoundLessonState,
  action: SoundLessonAction,
): SoundLessonState {
  switch (action.type) {
    case "load-scenario":
      return createSoundLessonState(action.scenario);
    case "set-source": {
      const durationMs = getSoundFixture(action.source).durationMs;
      return {
        ...state,
        source: action.source,
        durationMs,
        cursor: 0,
        transport: "stopped",
        loop: normalizeLoop(state.loop, durationMs),
      };
    }
    case "set-config":
      return updateConfig(state, action.key, action.value);
    case "set-sample-rate":
      return updateConfig(state, "sampleRate", action.sampleRate);
    case "set-bit-depth":
      return updateConfig(state, "bitDepth", action.bitDepth);
    case "set-phase":
      return updateConfig(state, "phase", action.phase);
    case "play":
      return startPlayback(state);
    case "pause":
      return pausePlayback(state);
    case "stop":
      return { ...state, cursor: 0, transport: "stopped" };
    case "set-transport":
      if (action.transport === "playing") return startPlayback(state);
      if (action.transport === "paused") return pausePlayback(state);
      return { ...state, cursor: 0, transport: "stopped" };
    case "set-audition":
      return { ...state, audition: action.audition };
    case "set-mode":
      return { ...state, mode: action.mode };
    case "set-view":
      return { ...state, view: action.view };
    case "set-cursor":
      return {
        ...state,
        cursor: Number.isFinite(action.cursor)
          ? Math.min(state.durationMs, Math.max(0, action.cursor))
          : state.cursor,
      };
    case "set-loop":
      return validLoop(action.loop, state.durationMs) ? { ...state, loop: action.loop } : state;
    case "tick":
      return tickSound(state, action.deltaMs);
    case "reset":
      return {
        ...state.initial,
        transport: "stopped",
        audition: "original",
        cursor: 0,
        loop: "off",
        initial: state.initial,
      };
    case "reset-transport":
      return { ...state, transport: "stopped", cursor: 0, loop: "off" };
    case "reset-analysis":
      return { ...state, mode: "compare", view: "compare", audition: "original" };
  }
}

export const tickSoundLesson = tickSound;
export const createAudioLessonState = createSoundLessonState;
export const transitionAudioLesson = transitionSoundLesson;
