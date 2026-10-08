/**
 * Processing worker: runs the domain `digitize` pipeline off the main
 * thread so a long import doesn't freeze the page, and posts progress per
 * channel so the UI can show honest busy state. Cancelled jobs are simply
 * terminated by the owner — results of stale jobs are dropped there too.
 */

import { digitize } from "../domain/digitize.ts";
import type { AudioParams, PcmAudio } from "../domain/audio.ts";
import type { QuantizationStats } from "../domain/quantize.ts";

export type DigitizeRequest = {
  id: number;
  audio: PcmAudio;
  params: AudioParams;
};

export type DigitizeProgress = {
  type: "progress";
  id: number;
  phase: string;
  done: number;
  total: number;
};
export type DigitizeDone = {
  type: "result";
  id: number;
  audio: PcmAudio;
  effectiveChannels: number;
  quantization: QuantizationStats[];
};
export type DigitizeError = { type: "error"; id: number; message: string };
export type DigitizeResponse = DigitizeProgress | DigitizeDone | DigitizeError;

self.onmessage = (event: MessageEvent<DigitizeRequest>) => {
  const { id, audio, params } = event.data;
  try {
    const result = digitize(audio, params, (phase, done, total) => {
      const msg: DigitizeProgress = { type: "progress", id, phase, done, total };
      self.postMessage(msg);
    });
    const msg: DigitizeDone = {
      type: "result",
      id,
      audio: result.audio,
      effectiveChannels: result.effectiveChannels,
      quantization: result.quantization,
    };
    const transfers = result.audio.channels.map((c) => c.buffer);
    (self as unknown as Worker).postMessage(msg, transfers);
  } catch (error) {
    const msg: DigitizeError = {
      type: "error",
      id,
      message: error instanceof Error ? error.message : "处理失败",
    };
    self.postMessage(msg);
  }
};
