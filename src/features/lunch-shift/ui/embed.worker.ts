/**
 * Embedding worker for the AI-intake PoC — transformers.js in a module
 * worker so tokenize+infer never blocks the page.
 *
 * Everything is self-hosted to match the classroom network reality: the
 * model files and the ONNX Runtime wasm are both served from
 * public/vendor (see scripts/sync-embed-runtime.mjs). No request to
 * huggingface.co or any CDN leaves the browser — allowRemoteModels is
 * deliberately off.
 *
 *   kind "load":  create the feature-extraction pipeline for a device +
 *                 dtype pair; progress events are relayed to the page.
 *   kind "embed": embed a batch of texts → number[][] (CLS pooled,
 *                 L2-normalized — the pooling the BGE family is trained
 *                 for).
 */

/// <reference lib="webworker" />

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

const VENDOR_BASE = `${import.meta.env.BASE_URL}vendor`;

export type EmbedDevice = "webgpu" | "wasm";
export type EmbedDtype = "q8" | "fp16" | "fp32";

export type EmbedWorkerRequest =
  | { id: number; kind: "load"; model: string; device: EmbedDevice; dtype: EmbedDtype }
  | { id: number; kind: "embed"; texts: string[] };

type LoadProgress = { file: string; loaded: number; total: number };

let extractorPromise: Promise<FeatureExtractionPipeline> | null = null;
let loadedWith: { model: string; device: EmbedDevice; dtype: string } | null = null;

function configureRuntime(): void {
  // Same-origin model zoo: {localModelPath}<model-id>/<file>, so the repo
  // keeps its hub-style name under vendor/models/Xenova/… .
  env.allowLocalModels = true;
  env.allowRemoteModels = false;
  env.localModelPath = `${VENDOR_BASE}/models/`;
  env.useBrowserCache = true;
  // Same file names transformers.js would fetch from jsDelivr — one
  // vendored pair serves both the wasm and the WebGPU attempts.
  const onnx = env.backends.onnx as
    | {
        wasm?: { wasmPaths?: unknown };
        versions?: { web?: string };
      }
    | undefined;
  const ortVersion = onnx?.versions?.web;
  if (!onnx?.wasm || !ortVersion) {
    throw new Error("找不到 ONNX Runtime 版本信息");
  }
  onnx.wasm.wasmPaths = {
    mjs: `${VENDOR_BASE}/onnxruntime-web-${ortVersion}/ort-wasm-simd-threaded.asyncify.mjs`,
    wasm: `${VENDOR_BASE}/onnxruntime-web-${ortVersion}/ort-wasm-simd-threaded.asyncify.wasm`,
  };
}

async function handle(request: EmbedWorkerRequest): Promise<object> {
  configureRuntime();
  if (request.kind === "load") {
    if (
      loadedWith &&
      loadedWith.model === request.model &&
      loadedWith.device === request.device &&
      loadedWith.dtype === request.dtype
    ) {
      return { already: true };
    }
    const started = performance.now();
    const task = pipeline("feature-extraction", request.model, {
      device: request.device,
      dtype: request.dtype,
      progress_callback: (info: {
        status?: string;
        file?: string;
        loaded?: number;
        total?: number;
      }) => {
        if (info.status === "progress") {
          self.postMessage({
            id: request.id,
            progress: {
              file: info.file ?? "",
              loaded: info.loaded ?? 0,
              total: info.total ?? 0,
            } satisfies LoadProgress,
          });
        }
      },
    });
    extractorPromise = task;
    try {
      await task;
    } catch (error) {
      // A failed load must not poison the next attempt (wasm fallback).
      if (extractorPromise === task) extractorPromise = null;
      throw error;
    }
    loadedWith = { model: request.model, device: request.device, dtype: request.dtype };
    return {
      device: request.device,
      dtype: request.dtype,
      ms: Math.round(performance.now() - started),
    };
  }
  if (!extractorPromise) throw new Error("模型还没加载好");
  const extractor = await extractorPromise;
  const started = performance.now();
  const output = await extractor(request.texts, { pooling: "cls", normalize: true });
  const vectors = output.tolist() as number[][];
  return { vectors, ms: Math.round(performance.now() - started) };
}

self.onmessage = (event: MessageEvent<EmbedWorkerRequest>) => {
  const request = event.data;
  void handle(request)
    .then((payload) => self.postMessage({ id: request.id, ok: true, ...payload }))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ id: request.id, ok: false, error: message });
    });
};
