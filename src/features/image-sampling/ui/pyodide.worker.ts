/**
 * Pyodide module worker — loads the vendored runtime lazily and runs the two
 * student-facing functions of this lab:
 *
 *   kind "cell":  cell_value(region) over a batch of test regions
 *   kind "size":  choose_size(category) → (width, height)
 *
 * Student code runs only here, in the browser. The server never sees or
 * executes it. Each run gets a fresh globals dict so runs can't leak state.
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";

type RunRequest =
  | { id: number; kind: "cell"; code: string; regions: number[][][] }
  | { id: number; kind: "size"; code: string; category: string };

type RunResponse =
  { id: number; ok: true; results: unknown[] } | { id: number; ok: false; error: string };

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

async function runCell(
  pyodide: PyodideInterface,
  code: string,
  regions: number[][][],
): Promise<unknown[]> {
  const globals = pyodide.toPy({});
  try {
    pyodide.runPython(code, { globals });
    globals.set("regions", pyodide.toPy(regions));
    const fn = globals.get("cell_value");
    if (fn === undefined || typeof fn.callKwargs !== "function") {
      throw new Error("需要一个函数 cell_value(region)——region 是 0/1 的二维列表。");
    }
    const out = pyodide.runPython("[cell_value(r) for r in regions]", { globals });
    try {
      return out.toJs() as unknown[];
    } finally {
      out.destroy();
    }
  } finally {
    globals.destroy();
  }
}

async function runSize(
  pyodide: PyodideInterface,
  code: string,
  category: string,
): Promise<unknown[]> {
  const globals = pyodide.toPy({});
  try {
    pyodide.runPython(code, { globals });
    globals.set("category", category);
    const fn = globals.get("choose_size");
    if (fn === undefined || typeof fn.callKwargs !== "function") {
      throw new Error("需要一个函数 choose_size(category)，返回 (宽, 高)。");
    }
    const out = pyodide.runPython("choose_size(category)", { globals });
    try {
      return out.toJs() as unknown[];
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
    const results =
      request.kind === "cell"
        ? await runCell(pyodide, request.code, request.regions)
        : await runSize(pyodide, request.code, request.category);
    return { id: request.id, ok: true, results };
  })()
    .then((response) => self.postMessage(response))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ id: request.id, ok: false, error: message } satisfies RunResponse);
    });
};
