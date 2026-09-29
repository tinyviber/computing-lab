/**
 * Pyodide module worker — loads the vendored runtime lazily and runs the
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

type RunRequest = {
  id: number;
  code: string;
  data: unknown;
  preamble?: string;
  call?: string;
};

type RunResponse =
  | { id: number; phase: "executing" }
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: false; error: string };

type PyodideModule = {
  loadPyodide: (options: { indexURL: string }) => Promise<PyodideInterface>;
};

let pyodideReady: Promise<PyodideInterface> | null = null;

function getPyodide(): Promise<PyodideInterface> {
  if (!pyodideReady) {
    const base = import.meta.env.BASE_URL;
    pyodideReady = import(/* @vite-ignore */ `${base}vendor/pyodide/pyodide.mjs`).then(
      (mod: PyodideModule) => mod.loadPyodide({ indexURL: `${base}vendor/pyodide/` }),
    );
    pyodideReady.catch(() => {
      // Let the next request retry a failed runtime load.
      pyodideReady = null;
    });
  }
  return pyodideReady;
}

// Start the ~13 MB runtime download as soon as the worker spawns — a student
// run's timeout should cover their code, not the vendored download.
getPyodide().catch(() => undefined);

async function runRequest(pyodide: PyodideInterface, request: RunRequest): Promise<unknown> {
  const globals = pyodide.toPy({});
  try {
    if (request.preamble?.trim()) {
      pyodide.runPython(request.preamble, { globals });
    }
    if (request.code.trim()) {
      pyodide.runPython(request.code, { globals });
    }
    globals.set("data", pyodide.toPy(request.data));
    const call = request.call ?? "decode(data)";
    const fn = globals.get("decode");
    if (request.call === undefined && (fn === undefined || typeof fn.callKwargs !== "function")) {
      throw new Error("需要一个函数 decode(data)——data 是这一关交给你的数据。");
    }
    const out = pyodide.runPython(call, { globals });
    try {
      return out.toJs({ dict_converter: Object.fromEntries }) as unknown;
    } finally {
      out.destroy();
    }
  } finally {
    globals.destroy();
  }
}

self.onmessage = (event: MessageEvent<RunRequest>) => {
  const request = event.data;
  void (async (): Promise<RunResponse> => {
    const pyodide = await getPyodide();
    // Ack once the runtime is loaded, before running student code: the
    // caller switches from the load budget to the run budget, and a
    // timeout now means the code itself — never the vendored download.
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
