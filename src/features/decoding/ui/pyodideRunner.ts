/**
 * Main-thread entry points for the decoding lab's Pyodide worker. Worker
 * lifecycle, the two-phase timeout policy and the wire envelope live in
 * shared/worker — this module only keeps the lab's request fields and the
 * payload shape of its ok responses (`{ result }`).
 */
import { createWorkerClient } from "../../../shared/worker/createWorkerClient.ts";

export { PythonRunError } from "../../../shared/worker/workerErrors.ts";

const client = createWorkerClient(
  () => new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" }),
);

/** Spawn the worker now so the runtime download finishes before the first run. */
export const warmPyodide = client.warm;

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
  const payload = await client.run<{ result: unknown }>(
    {
      code,
      data,
      preamble: options.preamble,
      call: options.call,
      useCodeData: options.useCodeData,
      captureStdout: options.captureStdout,
    },
    options.timeoutMs,
  );
  return payload.result;
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
