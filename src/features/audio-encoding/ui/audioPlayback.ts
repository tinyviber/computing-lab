import { sampleSoundFixture, type SoundSource } from "../domain/fixtures";
import { deriveSoundModel, type SoundConfig } from "../domain/model";
import type { SoundLoop } from "../lesson/scenario";

export const PLAYBACK_SAMPLE_RATE = 48_000;

export type AudioPlaybackRequest = {
  source: SoundSource;
  config: SoundConfig;
  audition: "original" | "reconstructed";
  cursorMs: number;
  loop: SoundLoop;
  durationMs: number;
};

export type AudioPlaybackResult = {
  available: boolean;
  message: string;
};

type AudioBufferLike = {
  getChannelData: (channel: number) => Float32Array;
};

type AudioBufferSourceLike = {
  buffer: AudioBufferLike | null;
  loop: boolean;
  loopStart: number;
  loopEnd: number;
  connect: (destination: unknown) => void;
  disconnect?: () => void;
  start: (when?: number, offset?: number, duration?: number) => void;
  stop: (when?: number) => void;
  onended: (() => void) | null;
};

type AudioContextLike = {
  currentTime: number;
  destination: unknown;
  createBuffer: (channels: number, length: number, sampleRate: number) => AudioBufferLike;
  createBufferSource: () => AudioBufferSourceLike;
  resume?: () => Promise<void> | void;
  close?: () => Promise<void> | void;
};

export type AudioContextFactory = () => AudioContextLike | null;

export type PlaybackBuffers = {
  original: Float32Array;
  reconstructed: Float32Array;
  sampleRate: number;
};

function requestKey(request: AudioPlaybackRequest): string {
  return [
    request.source,
    request.config.sampleRate,
    request.config.bitDepth,
    request.config.phase,
    request.durationMs,
  ].join(":");
}

function loopKey(loop: SoundLoop): string {
  return loop === "off" ? "off" : `${loop.startMs}:${loop.endMs}`;
}

function configKey(request: AudioPlaybackRequest): string {
  return `${requestKey(request)}:${request.audition}:${loopKey(request.loop)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function buildPlaybackBuffers(request: AudioPlaybackRequest): PlaybackBuffers {
  const frameCount = Math.max(1, Math.ceil((request.durationMs / 1000) * PLAYBACK_SAMPLE_RATE));
  const original = new Float32Array(frameCount);
  const reconstructed = new Float32Array(frameCount);
  const model = deriveSoundModel(request.source, request.config, 0);

  for (let index = 0; index < frameCount; index += 1) {
    const timeMs = (index / PLAYBACK_SAMPLE_RATE) * 1000;
    original[index] = sampleSoundFixture(request.source, timeMs);
    reconstructed[index] = model.reconstructAt(timeMs);
  }

  return { original, reconstructed, sampleRate: PLAYBACK_SAMPLE_RATE };
}

function defaultAudioContextFactory(): AudioContextLike | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as typeof window & {
    webkitAudioContext?: new () => AudioContextLike;
  };
  const Context = window.AudioContext ?? audioWindow.webkitAudioContext;
  return Context ? new Context() : null;
}

export type AudioPlaybackRuntime = {
  sync: (request: AudioPlaybackRequest) => void;
  play: (request: AudioPlaybackRequest) => AudioPlaybackResult;
  pause: () => void;
  stop: () => void;
  dispose: () => void;
};

export function createAudioPlaybackRuntime(
  audioContextFactory: AudioContextFactory = defaultAudioContextFactory,
): AudioPlaybackRuntime {
  let context: AudioContextLike | null = null;
  let sourceNode: AudioBufferSourceLike | null = null;
  let currentRequest: AudioPlaybackRequest | null = null;
  let cachedBuffers: PlaybackBuffers | null = null;
  let cachedKey = "";
  let audioBuffers: { original: AudioBufferLike; reconstructed: AudioBufferLike } | null = null;
  let audioBufferKey = "";
  let playing = false;

  const stopNode = () => {
    if (!sourceNode) return;
    sourceNode.onended = null;
    try {
      sourceNode.stop();
    } catch {
      // AudioBufferSourceNode.stop can throw when a test double is already ended.
    }
    sourceNode.disconnect?.();
    sourceNode = null;
    playing = false;
  };

  const ensureBuffers = (request: AudioPlaybackRequest): PlaybackBuffers => {
    const key = requestKey(request);
    if (!cachedBuffers || cachedKey !== key) {
      cachedBuffers = buildPlaybackBuffers(request);
      cachedKey = key;
    }
    return cachedBuffers;
  };

  const startNode = (request: AudioPlaybackRequest, cursorMs: number) => {
    if (!context) return;
    stopNode();
    const buffers = ensureBuffers(request);
    const key = requestKey(request);
    if (!audioBuffers || audioBufferKey !== key) {
      const original = context.createBuffer(1, buffers.original.length, buffers.sampleRate);
      const reconstructed = context.createBuffer(
        1,
        buffers.reconstructed.length,
        buffers.sampleRate,
      );
      original.getChannelData(0).set(buffers.original);
      reconstructed.getChannelData(0).set(buffers.reconstructed);
      audioBuffers = { original, reconstructed };
      audioBufferKey = key;
    }
    const node = context.createBufferSource();
    node.buffer =
      request.audition === "original" ? audioBuffers.original : audioBuffers.reconstructed;
    node.connect(context.destination);

    const loop = request.loop;
    const durationMs = Math.max(0, request.durationMs);
    let offsetMs = clamp(Number.isFinite(cursorMs) ? cursorMs : 0, 0, durationMs);
    if (loop !== "off" && offsetMs >= loop.endMs) offsetMs = loop.startMs;
    node.loop = loop !== "off";
    if (loop !== "off") {
      node.loopStart = loop.startMs / 1000;
      node.loopEnd = loop.endMs / 1000;
    }
    node.onended = () => {
      if (sourceNode === node) {
        sourceNode = null;
        playing = false;
      }
    };
    sourceNode = node;
    playing = true;
    node.start(0, offsetMs / 1000);
  };

  return {
    sync(request) {
      const previous = currentRequest;
      currentRequest = request;
      if (!playing || !previous || configKey(previous) === configKey(request)) return;
      startNode(request, request.cursorMs);
    },

    play(request) {
      currentRequest = request;
      if (!context) {
        try {
          context = audioContextFactory();
        } catch {
          context = null;
        }
      }
      if (!context) {
        return { available: false, message: "Audio unavailable; visual-only playback is active." };
      }
      try {
        void context.resume?.();
        startNode(request, request.cursorMs);
        return { available: true, message: `${request.audition} audio playback active.` };
      } catch {
        stopNode();
        return { available: false, message: "Audio unavailable; visual-only playback is active." };
      }
    },

    pause() {
      stopNode();
    },

    stop() {
      stopNode();
    },

    dispose() {
      stopNode();
      const oldContext = context;
      context = null;
      if (oldContext?.close) void oldContext.close();
    },
  };
}
