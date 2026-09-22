/**
 * Pyodide module worker — loads the vendored runtime lazily and runs the two
 * student-facing functions of this lab:
 *
 *   kind "cell":  cell_value(region) over a batch of test regions
 *   kind "size":  choose_size(images) → (width, height); images is the
 *                 public gallery as 0/1 nested lists, so the resolution is
 *                 computed from data rather than hand-picked. The size run
 *                 also gets `helpers` — the student's stage-1 code — plus a
 *                 fixed preamble defining a reference cell_value and a
 *                 downsample() helper, so earlier work stays callable.
 *
 * Student code runs only here, in the browser. The server never sees or
 * executes it. Each run gets a fresh globals dict so runs can't leak state.
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";

type RunRequest =
  | { id: number; kind: "cell"; code: string; regions: number[][][] }
  | { id: number; kind: "size"; code: string; images: number[][][]; helpers?: string };

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

/**
 * Reference helpers for the choose_size stages. `downsample` calls the
 * global `cell_value` at call time, so the student's own stage-1 rule is
 * what actually runs inside it when their code redefines it.
 * Kept identical to the TS domain rule: floor binning + majority coverage.
 */
const HELPERS_PREAMBLE = `def cell_value(region):
    total = 0
    ink = 0
    for row in region:
        for v in row:
            total += 1
            ink += v
    return 1 if ink * 2 >= total else 0

def downsample(image, w, h):
    H = len(image)
    W = len(image[0])
    out = []
    for cy in range(h):
        y0 = cy * H // h
        y1 = (cy + 1) * H // h
        row = []
        for cx in range(w):
            x0 = cx * W // w
            x1 = (cx + 1) * W // w
            row.append(cell_value([r[x0:x1] for r in image[y0:y1]]))
        out.append(row)
    return out
`;

async function runSize(
  pyodide: PyodideInterface,
  code: string,
  images: number[][][],
  helpers: string | undefined,
): Promise<unknown[]> {
  const globals = pyodide.toPy({});
  try {
    pyodide.runPython(HELPERS_PREAMBLE, { globals });
    // Earlier-stage code (their cell_value) may override the reference;
    // a broken helper file simply leaves the reference in place.
    if (helpers?.trim()) {
      try {
        pyodide.runPython(helpers, { globals });
      } catch {
        /* keep reference impl */
      }
    }
    pyodide.runPython(code, { globals });
    globals.set("images", pyodide.toPy(images));
    const fn = globals.get("choose_size");
    if (fn === undefined || typeof fn.callKwargs !== "function") {
      throw new Error("需要一个函数 choose_size(images)，返回 (宽, 高)。");
    }
    const out = pyodide.runPython("choose_size(images)", { globals });
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
        : await runSize(pyodide, request.code, request.images, request.helpers);
    return { id: request.id, ok: true, results };
  })()
    .then((response) => self.postMessage(response))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ id: request.id, ok: false, error: message } satisfies RunResponse);
    });
};
