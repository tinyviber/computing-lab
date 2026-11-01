/**
 * Main-thread handle for the embedding worker. Kept separate from
 * shared/worker/createWorkerClient because its contract differs on
 * purpose: loading relays download progress, one successful pipeline is
 * reused for every embed call, and a failed GPU attempt falls back to
 * wasm in the SAME worker.
 */

import { AI_MODEL_ID } from "../domain/aiIntake.ts";
import type { EmbedDevice, EmbedDtype } from "./embed.worker.ts";

export type EmbedProgress = { file: string; loaded: number; total: number };

export type EmbedInfo = { device: string; dtype: string; loadMs: number };

type Pending = {
  resolve: (payload: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();
let onProgress: ((progress: EmbedProgress) => void) | null = null;
let loading: Promise<EmbedInfo> | null = null;
let readyInfo: EmbedInfo | null = null;

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./embed.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
    const data = event.data;
    const id = data.id as number;
    if ("progress" in data) {
      onProgress?.(data.progress as EmbedProgress);
      return;
    }
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (data.ok === true) {
      const payload = { ...data };
      delete payload.id;
      delete payload.ok;
      entry.resolve(payload);
    } else {
      entry.reject(new Error(typeof data.error === "string" ? data.error : "加载模型失败"));
    }
  };
  worker.onerror = () => {
    for (const entry of pending.values()) entry.reject(new Error("模型 worker 崩溃了"));
    pending.clear();
    worker = null;
    // The respawned worker is unloaded — clear the memoized state so the
    // next loadEmbedder() retries instead of reporting stale readiness.
    readyInfo = null;
    loading = null;
  };
  return worker;
}

function request<TPayload extends object>(message: Record<string, unknown>): Promise<TPayload> {
  const w = ensureWorker();
  const id = (seq += 1);
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: resolve as (payload: Record<string, unknown>) => void,
      reject,
    });
    w.postMessage({ id, ...message });
  });
}

async function tryLoad(device: EmbedDevice, dtype: EmbedDtype): Promise<EmbedInfo> {
  const payload = await request<{ device: string; dtype: string; ms: number }>({
    kind: "load",
    model: AI_MODEL_ID,
    device,
    dtype,
  });
  return { device: payload.device, dtype: payload.dtype, loadMs: payload.ms };
}

/**
 * Load the model once: WebGPU first (integrated GPUs included), wasm as
 * the every-machine fallback. Progress callbacks fire while weights
 * download; a successful load is memoized for the session.
 */
export function loadEmbedder(progress?: (progress: EmbedProgress) => void): Promise<EmbedInfo> {
  if (readyInfo) return Promise.resolve(readyInfo);
  onProgress = progress ?? null;
  loading ??= (async () => {
    try {
      return await tryLoad("webgpu", "q8");
    } catch {
      return await tryLoad("wasm", "q8");
    }
  })().then(
    (info) => {
      readyInfo = info;
      loading = null;
      return info;
    },
    (error: unknown) => {
      loading = null;
      throw error;
    },
  );
  return loading;
}

export function embedderReady(): EmbedInfo | null {
  return readyInfo;
}

/** Embed a batch of texts; resolves [text][dims] plus inference time. */
export async function embedTexts(texts: string[]): Promise<{ vectors: number[][]; ms: number }> {
  const payload = await request<{ vectors: number[][]; ms: number }>({
    kind: "embed",
    texts,
  });
  return { vectors: payload.vectors, ms: payload.ms };
}
