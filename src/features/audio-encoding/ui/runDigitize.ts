/**
 * Job wrapper around the digitize worker: each run gets its own worker so
 * cancel = terminate (no half-written state, no stale results). Falls back
 * to synchronous processing when Workers are unavailable (e.g. tests).
 */

import type { AudioParams, PcmAudio } from "../domain/audio.ts";
import { digitize, type DigitizeResult } from "../domain/digitize.ts";
import type { DigitizeResponse } from "./digitize.worker.ts";

export class DigitizeCancelled extends Error {
  constructor() {
    super("已取消");
    this.name = "DigitizeCancelled";
  }
}

export type DigitizeJob = {
  promise: Promise<DigitizeResult>;
  cancel: () => void;
};

let nextId = 1;

export function runDigitize(
  audio: PcmAudio,
  params: AudioParams,
  onProgress?: (phase: string, done: number, total: number) => void,
): DigitizeJob {
  if (typeof Worker === "undefined") {
    return {
      promise: Promise.resolve().then(() =>
        digitize(audio, params, (p, d, t) => onProgress?.(p, d, t)),
      ),
      cancel: () => {},
    };
  }
  const id = nextId++;
  const worker = new Worker(new URL("./digitize.worker.ts", import.meta.url), { type: "module" });
  let cancelFn: () => void = () => {};
  const promise = new Promise<DigitizeResult>((resolve, reject) => {
    cancelFn = () => {
      worker.terminate();
      reject(new DigitizeCancelled());
    };
    worker.onmessage = (event: MessageEvent<DigitizeResponse>) => {
      const msg = event.data;
      if (msg.id !== id) return; // stale message from a previous job
      if (msg.type === "progress") {
        onProgress?.(msg.phase, msg.done, msg.total);
      } else if (msg.type === "result") {
        worker.terminate();
        resolve({
          audio: msg.audio,
          effectiveChannels: msg.effectiveChannels,
          quantization: msg.quantization,
        });
      } else {
        worker.terminate();
        reject(new Error(msg.message));
      }
    };
    worker.onerror = () => {
      worker.terminate();
      reject(new Error("处理过程出错了。"));
    };
    // Transfer copies of the channel buffers — keep the source intact.
    const copies = audio.channels.map((c) => c.slice());
    worker.postMessage(
      { id, audio: { sampleRate: audio.sampleRate, channels: copies }, params },
      copies.map((c) => c.buffer),
    );
  });
  return { promise, cancel: () => cancelFn() };
}
