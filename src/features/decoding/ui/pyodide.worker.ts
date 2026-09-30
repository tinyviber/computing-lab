/**
 * Pyodide module worker — loads the Python runtime lazily and runs the
 * student decoder contract of this lab:
 *
 *   preamble? → student code → `result = call` (default `decode(data)`)
 *
 * `data` is the stage payload injected as a Python object; `preamble` injects
 * the provided helpers (decode_bmp / decode_as_text / decode_as_image) for
 * stages that hand the student ready-made decoders. Student code runs only
 * here, in the browser — the server never sees or executes it. Each run gets
 * a fresh globals dict so runs can't leak state.
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";
import { getPyodide } from "../../../shared/lab/pyodideRuntime";

type RunRequest = {
  id: number;
  code: string;
  data: unknown;
  preamble?: string;
  call?: string;
  useCodeData?: boolean;
  captureStdout?: boolean;
};

type RunResponse =
  | { id: number; phase: "executing" }
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

// Start the ~13 MB runtime download as soon as the worker spawns — a student
// run's timeout should cover their code, not the download.
getPyodide().catch(() => undefined);

async function runRequest(pyodide: PyodideInterface, request: RunRequest): Promise<unknown> {
  const globals = pyodide.toPy({});
  const stdout: string[] = [];
  if (request.captureStdout) {
    pyodide.setStdout({ batched: (text) => stdout.push(text) });
  }
  try {
    if (request.preamble?.trim()) {
      pyodide.runPython(request.preamble, { globals });
    }
    if (request.code.trim()) {
      pyodide.runPython(request.code, { globals });
    }
    if (!request.useCodeData) globals.set("data", pyodide.toPy(request.data));
    const call = request.call ?? "decode(data)";
    const fn = globals.get("decode");
    if (request.call === undefined && (fn === undefined || typeof fn.callKwargs !== "function")) {
      throw new Error("需要一个函数 decode(data)——data 是这一关交给你的数据。");
    }
    const out = pyodide.runPython(call, { globals }) as unknown;
    if (out !== null && typeof out === "object") {
      const proxy = out as {
        toJs?: (options?: unknown) => unknown;
        destroy?: () => void;
      };
      try {
        const result =
          typeof proxy.toJs === "function"
            ? proxy.toJs({ dict_converter: Object.fromEntries })
            : out;
        return request.captureStdout ? { result, stdout: stdout.join("") } : result;
      } finally {
        if (typeof proxy.destroy === "function") proxy.destroy();
      }
    }
    return request.captureStdout ? { result: out, stdout: stdout.join("") } : out;
  } finally {
    if (request.captureStdout) pyodide.setStdout();
    globals.destroy();
  }
}

self.onmessage = (event: MessageEvent<RunRequest>) => {
  const request = event.data;
  void (async (): Promise<RunResponse> => {
    const pyodide = await getPyodide();
    // Ack once the runtime is loaded, before running student code: the
    // caller switches from the load budget to the run budget, and a
    // timeout now means the code itself — never the runtime download.
    self.postMessage({ id: request.id, phase: "executing" } satisfies RunResponse);
    const result = await runRequest(pyodide, request);
    return { id: request.id, ok: true, result };
  })()
    .then((response) => self.postMessage(response))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ id: request.id, ok: false, error: message } satisfies RunResponse);
    });
};
