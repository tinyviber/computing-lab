/**
 * Main-thread handle for the Pyodide worker. Lazily spawned, one request at a
 * time per call site is fine — calls are queued through a simple id map and a
 * hard timeout terminates the worker (dead Python code can't be interrupted,
 * so the whole runtime is discarded and will cold-load on the next run).
 */

type Pending = {
  resolve: (results: unknown[]) => void;
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
    const { id, ok, results, error } = event.data as {
      id: number;
      ok: boolean;
      results?: unknown[];
      error?: string;
    };
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (ok) entry.resolve(results ?? []);
    else entry.reject(new Error(error ?? "运行失败"));
  };
  worker.onerror = () => killWorker();
  return worker;
}

function run(message: Record<string, unknown>, timeoutMs: number): Promise<unknown[]> {
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

/** Run the student's cell_value(region) over test regions; returns raw outputs. */
export async function runCellValue(
  code: string,
  regions: number[][][],
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown[]> {
  return run({ kind: "cell", code, regions }, timeoutMs);
}

/**
 * Run choose_size(images) — images is the public gallery as 0/1 nested lists.
 * `helpers` is the student's earlier-stage code (their cell_value), injected
 * so later stages can call it. Returns the raw pair (validated by the caller).
 */
export async function runChooseSize(
  code: string,
  images: number[][][],
  helpers?: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown[]> {
  return run({ kind: "size", code, images, helpers }, timeoutMs);
}
