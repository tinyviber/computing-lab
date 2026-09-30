/**
 * Main-thread handle for the decoding lab's Pyodide worker. Same two-phase
 * timeout policy as the other Pyodide labs: a generous budget while the
 * vendored runtime (~13 MB) is still downloading, then `timeoutMs` once the
 * worker acks that student code is executing. An execution timeout kills the
 * worker (dead Python can't be interrupted); a load timeout only rejects that
 * request — the download continues and a retry reuses it.
 */

type Pending = {
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
  executing: boolean;
  timeoutMs: number;
};

const DEFAULT_TIMEOUT_MS = 15_000;
const LOAD_TIMEOUT_MS = 90_000;

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

function onTimeout(id: number): void {
  const entry = pending.get(id);
  if (!entry) return;
  if (entry.executing) {
    killWorker();
    return;
  }
  pending.delete(id);
  entry.reject(new Error("首次加载 Python 运行环境超时（需下载约 13MB）——请检查网络后再试一次。"));
}

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (event: MessageEvent) => {
    const data = event.data as {
      id: number;
      phase?: string;
      ok?: boolean;
      result?: unknown;
      error?: string;
    };
    const entry = pending.get(data.id);
    if (!entry) return;
    if (data.phase === "executing") {
      entry.executing = true;
      clearTimeout(entry.timer);
      entry.timer = setTimeout(() => onTimeout(data.id), entry.timeoutMs);
      return;
    }
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.result);
    else entry.reject(new Error(data.error ?? "运行失败"));
  };
  worker.onerror = () => killWorker();
  return worker;
}

/** Spawn the worker now so the vendored runtime downloads before the first run. */
export function warmPyodide(): void {
  ensureWorker();
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

export type DecodeRunOptions = {
  /** Provided-decoder preamble injected before the student code. */
  preamble?: string;
  /** Expression to evaluate instead of the default `decode(data)`. */
  call?: string;
  /** Keep data assignments in code instead of injecting the stage payload. */
  useCodeData?: boolean;
  /** Return captured stdout with the Python result. */
  captureStdout?: boolean;
  timeoutMs?: number;
};

/**
 * Run `call` (default `decode(data)`) after optional preamble + student code.
 * `data` is the stage payload — a list of ints, a list of bit strings, or a
 * BMP byte array. Returns the raw Python result (validated by the caller).
 */
export async function runDecode(
  code: string,
  data: unknown,
  options: DecodeRunOptions = {},
): Promise<unknown> {
  const w = ensureWorker();
  const id = (seq += 1);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve,
      reject,
      timer: setTimeout(() => onTimeout(id), LOAD_TIMEOUT_MS),
      executing: false,
      timeoutMs,
    });
    w.postMessage({
      id,
      code,
      data,
      preamble: options.preamble,
      call: options.call,
      useCodeData: options.useCodeData,
      captureStdout: options.captureStdout,
    });
  });
}

// ---------- provided-decoder preambles (kept identical to domain semantics) ----------

/**
 * X1: the ready-made BMP decoder — same constrained profile as the domain:
 * 54-byte header, BGR triples, bottom-up rows → top-down [r,g,b] matrix.
 */
export const BMP_HELPER = `def decode_bmp(data):
    width = data[18] + data[19] * 256 + data[20] * 65536 + data[21] * 16777216
    height = data[22] + data[23] * 256 + data[24] * 65536 + data[25] * 16777216
    offset = data[10] + data[11] * 256 + data[12] * 65536 + data[13] * 16777216
    body = data[offset:]
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            i = (y * width + x) * 3
            b, g, r = body[i], body[i + 1], body[i + 2]
            row.append([r, g, b])
        pixels.append(row)
    pixels.reverse()
    return pixels
`;

/**
 * Stage 4: the two ready-made decoders the issue hands the student. Note the
 * image decoder is NOT the BMP rule — raw R,G,B triples, top-down. Different
 * data, different agreement.
 */
export const FILE_HELPERS = `def decode_as_text(data):
    chars = []
    for code in data:
        chars.append(chr(code))
    return "".join(chars)

def decode_as_image(data, width, height):
    pixels = []
    for y in range(height):
        row = []
        for x in range(width):
            i = (y * width + x) * 3
            r, g, b = data[i], data[i + 1], data[i + 2]
            row.append([r, g, b])
        pixels.append(row)
    return pixels
`;
