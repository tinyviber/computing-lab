/**
 * Main-thread handle for the Pyodide worker. Lazily spawned, one request at a
 * time per call site is fine — calls are queued through a simple id map and a
 * hard timeout terminates the worker (dead Python code can't be interrupted,
 * so the whole runtime is discarded and will cold-load on the next run).
 */

type RunPayload = { results: unknown[]; helperFailed?: boolean };

type Pending = {
  resolve: (payload: RunPayload) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_TIMEOUT_MS = 15_000;

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, Pending>();

function killWorker(): void {
  worker?.terminate();
  worker = null;
  for (const entry of pending.values()) {
    clearTimeout(entry.timer);
    entry.reject(new Error("运行超时——代码里可能有死循环，已重置 Python 环境。"));
  }
  pending.clear();
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent) => {
    const { id, ok, results, error, helperFailed } = event.data as {
      id: number;
      ok: boolean;
      results?: unknown[];
      error?: string;
      helperFailed?: boolean;
    };
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (ok) entry.resolve({ results: results ?? [], helperFailed });
    else entry.reject(new Error(error ?? "运行失败"));
  };
  worker.onerror = () => killWorker();
  return worker;
}

function run(message: Record<string, unknown>, timeoutMs: number): Promise<RunPayload> {
  const w = ensureWorker();
  const id = (seq += 1);
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      timer: setTimeout(() => killWorker(), timeoutMs),
    });
    w.postMessage({ id, ...message });
  });
}

export class PythonRunError extends Error {
  constructor(
    message: string,
    readonly pythonTraceback: string | null = null,
  ) {
    super(message);
    this.name = "PythonRunError";
  }
}

/**
 * Run the student's nearest_toner(r, g, b, toners) over the source palette.
 * `toners` is the candidate list as [r,g,b] rows (index 0 = paper).
 */
export async function runNearestToner(
  code: string,
  colors: number[][],
  toners: number[][],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown[]> {
  const payload = await run({ kind: "toner", code, colors, toners }, timeoutMs);
  return payload.results;
}

export type HelperRunResult = {
  results: unknown[];
  /** True when the injected earlier-stage code failed and the built-in
   *  reference helpers ran instead — the UI must tell the student whose
   *  code actually executed. */
  helperFailed: boolean;
};

/**
 * Run choose_toners(toners, palette, images, k) — images is the public
 * gallery as palette-index nested lists. `helpers` is the student's
 * earlier-stage code (their nearest_toner), injected so it stays callable.
 */
export async function runChooseToners(
  code: string,
  toners: number[][],
  palette: number[][],
  images: number[][][],
  k: number,
  helpers?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HelperRunResult> {
  const payload = await run({ kind: "pick", code, toners, palette, images, k, helpers }, timeoutMs);
  return { results: payload.results, helperFailed: payload.helperFailed ?? false };
}

/**
 * Run map_color(r, g, b) over every source color — returns the raw table
 * (toner index or -1 per source color, validated by the caller).
 */
export async function runMapAll(
  code: string,
  colors: number[][],
  toners: number[][],
  palette: number[][],
  helpers?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<HelperRunResult> {
  const payload = await run({ kind: "mapall", code, colors, toners, palette, helpers }, timeoutMs);
  return { results: payload.results, helperFailed: payload.helperFailed ?? false };
}
