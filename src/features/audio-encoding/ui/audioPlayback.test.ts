import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderAppAt } from "../../../test/router-test-helpers";
import {
  buildPlaybackBuffers,
  createAudioPlaybackRuntime,
  type AudioPlaybackRequest,
} from "./audioPlayback";

type StartCall = [when?: number, offset?: number, duration?: number];

class MockAudioBuffer {
  readonly channels: Float32Array[];

  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number) {
    return this.channels[channel];
  }
}

class MockAudioBufferSourceNode {
  buffer: MockAudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  readonly startCalls: StartCall[] = [];
  stopCalls = 0;
  disconnectCalls = 0;
  connectCalls = 0;

  connect() {
    this.connectCalls += 1;
    return this;
  }

  start(...args: StartCall) {
    this.startCalls.push(args);
  }

  stop() {
    this.stopCalls += 1;
  }

  disconnect() {
    this.disconnectCalls += 1;
  }
}

class MockAudioContext {
  static contexts: MockAudioContext[] = [];
  currentTime = 0;
  state: AudioContextState = "running";
  readonly destination = {};
  readonly createBufferCalls: MockAudioBuffer[] = [];
  readonly sources: MockAudioBufferSourceNode[] = [];
  readonly resume = vi.fn(async () => undefined);
  readonly close = vi.fn(async () => {
    this.state = "closed";
  });

  constructor() {
    if (!MockAudioContext.available) throw new Error("AudioContext unavailable");
    MockAudioContext.contexts.push(this);
  }

  static available = true;

  createBuffer(numberOfChannels: number, length: number, sampleRate: number) {
    const buffer = new MockAudioBuffer(numberOfChannels, length, sampleRate);
    this.createBufferCalls.push(buffer);
    return buffer;
  }

  createBufferSource() {
    const source = new MockAudioBufferSourceNode();
    this.sources.push(source);
    return source;
  }
}

let rafId = 0;
let rafCallbacks = new Map<number, FrameRequestCallback>();

function runAnimationFrame(timestamp: number) {
  const callbacks = [...rafCallbacks.values()];
  rafCallbacks.clear();
  callbacks.forEach((callback) => callback(timestamp));
}

function audioContext() {
  expect(MockAudioContext.contexts).toHaveLength(1);
  return MockAudioContext.contexts[0];
}

function cursorValue() {
  return Number((document.querySelector("#sound-cursor") as HTMLInputElement).value);
}

describe("Sound audioPlayback boundary", () => {
  beforeEach(() => {
    MockAudioContext.contexts = [];
    MockAudioContext.available = true;
    rafId = 0;
    rafCallbacks = new Map();
    vi.stubGlobal("AudioContext", MockAudioContext);
    vi.stubGlobal("webkitAudioContext", MockAudioContext);
    const requestFrame = (callback: FrameRequestCallback) => {
      const id = ++rafId;
      rafCallbacks.set(id, callback);
      return id;
    };
    const cancelFrame = (id: number) => {
      rafCallbacks.delete(id);
    };
    vi.stubGlobal("requestAnimationFrame", requestFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    Object.defineProperty(window, "requestAnimationFrame", {
      configurable: true,
      value: requestFrame,
    });
    Object.defineProperty(window, "cancelAnimationFrame", {
      configurable: true,
      value: cancelFrame,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("creates deterministic fixed-rate original and reconstructed buffers on the Play gesture", async () => {
    const request: AudioPlaybackRequest = {
      source: "pure440",
      config: { sampleRate: 8000, bitDepth: 8, phase: 0 },
      audition: "original",
      cursorMs: 0,
      loop: "off",
      durationMs: 1000,
    };
    const buffers = buildPlaybackBuffers(request);
    expect(buffers.sampleRate).toBe(48_000);
    expect(buffers.original).toHaveLength(48_000);
    expect(buffers.reconstructed).toHaveLength(48_000);
    expect(Array.from(buffers.original)).not.toEqual(Array.from(buffers.reconstructed));

    const runtime = createAudioPlaybackRuntime(() => new MockAudioContext());
    const runtimeResult = runtime.play(request);
    expect(runtimeResult.available).toBe(true);
    expect(audioContext().sources[0].buffer?.getChannelData(0)).toEqual(buffers.original);
    runtime.dispose();
    MockAudioContext.contexts = [];

    const { unmount } = await renderAppAt(
      "/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8",
    );

    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));

    const context = audioContext();
    expect(context.createBufferCalls).toHaveLength(2);
    const [original, reconstructed] = context.createBufferCalls;
    expect(original.numberOfChannels).toBe(1);
    expect(original.sampleRate).toBe(48_000);
    expect(original.length).toBe(48_000);
    expect(reconstructed.numberOfChannels).toBe(1);
    expect(reconstructed.sampleRate).toBe(48_000);
    expect(reconstructed.length).toBe(48_000);
    expect(Array.from(original.getChannelData(0))).toEqual(Array.from(buffers.original));
    expect(Array.from(reconstructed.getChannelData(0))).toEqual(Array.from(buffers.reconstructed));
    expect(Array.from(original.getChannelData(0))).not.toEqual(
      Array.from(reconstructed.getChannelData(0)),
    );
    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].buffer).toBe(original);
    expect(context.sources[0].startCalls).toHaveLength(1);
    expect(screen.getByTestId("sound-audio-status")).toHaveTextContent(/audio playback active/i);

    unmount();
  });

  it("selects the A/B buffer without recreating a source for cursor ticks", async () => {
    await renderAppAt("/labs/audio-encoding?source=sawtooth&sampleRate=16000&bitDepth=4");
    const play = screen.getByRole("button", { name: /^play$/i });
    const reconstructed = screen.getByRole("button", { name: /^reconstructed$/i });
    const advance = screen.getByRole("button", { name: /advance 100 ms/i });

    fireEvent.click(play);
    const context = audioContext();
    const firstSource = context.sources[0];
    fireEvent.click(advance);
    fireEvent.click(advance);
    expect(context.sources).toHaveLength(1);
    expect(firstSource.stopCalls).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: /^stop$/i }));
    fireEvent.click(reconstructed);
    fireEvent.click(play);
    expect(context.sources).toHaveLength(2);
    expect(context.sources[1].buffer).toBe(context.createBufferCalls[1]);
    expect(context.sources[0].stopCalls).toBeGreaterThan(0);
  });

  it("restarts the active audition at the user seek offset without duplicating reducer ticks", async () => {
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8");
    fireEvent.click(screen.getByRole("button", { name: /^reconstructed$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));

    const context = audioContext();
    const firstSource = context.sources[0];
    const cursor = document.querySelector("#sound-cursor") as HTMLInputElement;
    fireEvent.change(cursor, { target: { value: "250" } });

    expect(cursor).toHaveValue("250");
    expect(firstSource.stopCalls).toBeGreaterThan(0);
    expect(context.sources).toHaveLength(2);
    const seekSource = context.sources[1];
    expect(seekSource.buffer).toBe(context.createBufferCalls[1]);
    expect(seekSource.startCalls[0]?.[1]).toBeCloseTo(0.25, 6);
    expect(screen.getByRole("button", { name: /^reconstructed$/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    const sourceCountAfterSeek = context.sources.length;
    await waitFor(() => expect(rafCallbacks.size).toBeGreaterThan(0));
    runAnimationFrame(1000);
    runAnimationFrame(1100);
    expect(context.sources).toHaveLength(sourceCountAfterSeek);
    expect(seekSource.startCalls).toHaveLength(1);
  });

  it("keeps paused seeks visual-only until the next Play uses the new offset", async () => {
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8");
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    const context = audioContext();
    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));
    const sourceCount = context.sources.length;

    fireEvent.change(document.querySelector("#sound-cursor")!, { target: { value: "250" } });
    expect(cursorValue()).toBe(250);
    expect(context.sources).toHaveLength(sourceCount);

    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    expect(context.sources).toHaveLength(sourceCount + 1);
    expect(context.sources.at(-1)?.startCalls[0]?.[1]).toBeCloseTo(0.25, 6);
  });

  it("uses the reducer clock as the visual authority and keeps RAF deterministic", async () => {
    await renderAppAt("/labs/audio-encoding?source=pure440&sampleRate=8000&bitDepth=8");
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));

    await waitFor(() => expect(rafCallbacks.size).toBeGreaterThan(0));
    const startTime = performance.now();
    runAnimationFrame(startTime);
    runAnimationFrame(startTime + 100);
    await waitFor(() => expect(cursorValue()).toBeCloseTo(100, 6));
    expect(audioContext().sources).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));
    const paused = cursorValue();
    runAnimationFrame(200);
    expect(cursorValue()).toBe(paused);
  });

  it("continues visual-only reducer playback when AudioContext is unavailable", async () => {
    MockAudioContext.available = false;
    await renderAppAt("/labs/audio-encoding?source=high-pulse&sampleRate=16000");

    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    expect(screen.getByTestId("sound-audio-status")).toHaveTextContent(
      /visual-only|audio unavailable/i,
    );
    fireEvent.click(screen.getByRole("button", { name: /advance 100 ms/i }));
    expect(cursorValue()).toBe(100);
  });

  it("cleans up the active node on pause, stop, source/config changes, and unmount", async () => {
    const { unmount } = await renderAppAt("/labs/audio-encoding?source=pure440");
    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    const context = audioContext();
    const firstSource = context.sources[0];

    fireEvent.click(screen.getByRole("button", { name: /^pause$/i }));
    expect(firstSource.stopCalls).toBeGreaterThan(0);
    expect(firstSource.disconnectCalls).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    const secondSource = context.sources[1];
    fireEvent.change(document.getElementById("sound-source")!, { target: { value: "speech" } });
    expect(secondSource.stopCalls).toBeGreaterThan(0);
    expect(secondSource.disconnectCalls).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /^play$/i }));
    fireEvent.change(document.getElementById("sound-rate")!, { target: { value: "16000" } });
    expect(context.sources.at(-1)?.stopCalls).toBeGreaterThan(0);
    unmount();
    expect(context.close).toHaveBeenCalled();
  });
});
