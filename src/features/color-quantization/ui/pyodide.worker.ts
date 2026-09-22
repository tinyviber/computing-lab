/**
 * Pyodide module worker — loads the vendored runtime lazily and runs the
 * three student-facing functions of this lab:
 *
 *   kind "toner":  nearest_toner(r, g, b, toners) over every source color —
 *                  the guided stage-1 exercise. `toners` is a list of
 *                  [r,g,b] candidates; index 0 is paper.
 *   kind "pick":   choose_toners(toners, palette, images, k) → list of toner
 *                  indices to load. `images` are palette-index grids so the
 *                  choice is computed from data, not hand-picked.
 *   kind "mapall": map_color(r, g, b) over every source color → a full
 *                  mapping table (toner index or -1 for paper).
 *
 * Pick and mapall runs get `helpers` — the student's earlier code — plus a
 * fixed preamble with a reference nearest_toner and nn_table/quantize
 * utilities, so earlier work stays callable. A broken helper file simply
 * leaves the reference implementation in place.
 *
 * Student code runs only here, in the browser. The server never sees or
 * executes it. Each run gets a fresh globals dict so runs can't leak state.
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";

type RunRequest =
  | { id: number; kind: "toner"; code: string; colors: number[][]; toners: number[][] }
  | {
      id: number;
      kind: "pick";
      code: string;
      toners: number[][];
      palette: number[][];
      images: number[][][];
      k: number;
      helpers?: string;
    }
  | {
      id: number;
      kind: "mapall";
      code: string;
      colors: number[][];
      toners: number[][];
      palette: number[][];
      helpers?: string;
    };

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

function mustFn(globals: ReturnType<PyodideInterface["toPy"]>, name: string, sig: string) {
  const fn = globals.get(name);
  if (fn === undefined || typeof fn.callKwargs !== "function") {
    throw new Error(`需要一个函数 ${sig}`);
  }
}

async function runToner(
  pyodide: PyodideInterface,
  code: string,
  colors: number[][],
  toners: number[][],
): Promise<unknown[]> {
  const globals = pyodide.toPy({});
  try {
    pyodide.runPython(code, { globals });
    globals.set("colors", pyodide.toPy(colors));
    globals.set("toners", pyodide.toPy(toners));
    mustFn(globals, "nearest_toner", "nearest_toner(r, g, b, toners)。");
    const out = pyodide.runPython("[nearest_toner(c[0], c[1], c[2], toners) for c in colors]", {
      globals,
    });
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
 * Reference helpers for the pick/mapall stages. `nn_table` calls the global
 * `nearest_toner` at call time, so the student's own stage-1 rule is what
 * actually runs inside it when their code redefines it. Table entries are
 * absolute toner indices, or -1 for paper — identical to the TS domain rule:
 * squared euclidean distance, paper wins ties, then lowest toner index.
 */
const HELPERS_PREAMBLE = `def _dist2(a, b):
    return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2

def nearest_toner(r, g, b, toners):
    best = 0
    best_d = _dist2([r, g, b], toners[0])
    for i in range(1, len(toners)):
        d = _dist2([r, g, b], toners[i])
        if d < best_d:
            best_d = d
            best = i
    return best

def nn_table(subset):
    # candidates[0] is paper -> table entry -1; candidates[i>0] is TONERS[subset[i-1]]
    candidates = [PAPER] + [TONERS[i] for i in subset]
    table = []
    for c in PALETTE:
        j = nearest_toner(c[0], c[1], c[2], candidates)
        table.append(-1 if j == 0 else subset[j - 1])
    return table

def quantize(image, table):
    return [[0 if px == 0 else table[px - 1] + 1 for px in row] for row in image]
`;

function injectShared(
  pyodide: PyodideInterface,
  globals: ReturnType<PyodideInterface["toPy"]>,
  helpers: string | undefined,
  toners: number[][],
  palette: number[][],
  paper: number[],
): void {
  // Shared names first: nn_table resolves TONERS/PALETTE/PAPER at call time,
  // and student code may legitimately call helpers at module top level.
  globals.set("TONERS", pyodide.toPy(toners));
  globals.set("PALETTE", pyodide.toPy(palette));
  globals.set("PAPER", pyodide.toPy(paper));
  pyodide.runPython(HELPERS_PREAMBLE, { globals });
  if (helpers?.trim()) {
    try {
      pyodide.runPython(helpers, { globals });
    } catch {
      /* keep reference impl */
    }
  }
}

async function runPick(
  pyodide: PyodideInterface,
  code: string,
  toners: number[][],
  palette: number[][],
  images: number[][][],
  k: number,
  helpers: string | undefined,
): Promise<unknown[]> {
  const globals = pyodide.toPy({});
  try {
    injectShared(pyodide, globals, helpers, toners, palette, [245, 245, 240]);
    pyodide.runPython(code, { globals });
    globals.set("images", pyodide.toPy(images));
    globals.set("k", pyodide.toPy(k));
    mustFn(
      globals,
      "choose_toners",
      "choose_toners(toners, palette, images, k)，返回要装的粉的编号列表。",
    );
    const out = pyodide.runPython("choose_toners(TONERS, PALETTE, images, k)", { globals });
    try {
      return out.toJs() as unknown[];
    } finally {
      out.destroy();
    }
  } finally {
    globals.destroy();
  }
}

async function runMapAll(
  pyodide: PyodideInterface,
  code: string,
  colors: number[][],
  toners: number[][],
  palette: number[][],
  helpers: string | undefined,
): Promise<unknown[]> {
  const globals = pyodide.toPy({});
  try {
    injectShared(pyodide, globals, helpers, toners, palette, [245, 245, 240]);
    pyodide.runPython(code, { globals });
    globals.set("colors", pyodide.toPy(colors));
    mustFn(globals, "map_color", "map_color(r, g, b)，返回墨粉编号（-1 表示留白/纸色）。");
    const out = pyodide.runPython("[map_color(c[0], c[1], c[2]) for c in colors]", { globals });
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
      request.kind === "toner"
        ? await runToner(pyodide, request.code, request.colors, request.toners)
        : request.kind === "pick"
          ? await runPick(
              pyodide,
              request.code,
              request.toners,
              request.palette,
              request.images,
              request.k,
              request.helpers,
            )
          : await runMapAll(
              pyodide,
              request.code,
              request.colors,
              request.toners,
              request.palette,
              request.helpers,
            );
    return { id: request.id, ok: true, results };
  })()
    .then((response) => self.postMessage(response))
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      self.postMessage({ id: request.id, ok: false, error: message } satisfies RunResponse);
    });
};
