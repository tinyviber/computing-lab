/**
 * Wire protocol shared by every Pyodide lab worker:
 *
 *   main → worker: { id, ...lab-specific request fields }
 *   worker → main: { id, phase: "executing" }    — runtime loaded, code starting
 *                  { id, ok: true, ...payload }  — lab-defined result fields
 *                  { id, ok: false, error }      — Python or runtime failure
 *
 * The envelope is shared; each lab's worker keeps its own request union and
 * its own ok-payload fields (`result` vs `results`, `helperFailed`, ...).
 */

/// <reference lib="webworker" />

import type { PyodideInterface } from "pyodide";
import { getPyodide } from "../lab/pyodideRuntime.ts";

export type WorkerRequestBase = { id: number };

export type WorkerPhaseMessage = { id: number; phase: "executing" };
export type WorkerOkMessage<TPayload extends object = Record<string, unknown>> = {
  id: number;
  ok: true;
} & TPayload;
export type WorkerErrorMessage = { id: number; ok: false; error: string };
export type WorkerResponse<TPayload extends object = Record<string, unknown>> =
  WorkerPhaseMessage | WorkerOkMessage<TPayload> | WorkerErrorMessage;

/**
 * Install `self.onmessage` for a lab's Pyodide worker. `runRequest` produces
 * the lab's ok-payload fields; thrown errors become `{ ok:false, error }`.
 * The runtime download is kicked off on install, so a student's first run
 * doesn't have to wait for the ~13 MB fetch.
 */
export function installPyodideWorker<TRequest extends WorkerRequestBase>(
  runRequest: (pyodide: PyodideInterface, request: TRequest) => Promise<object>,
): void {
  // Start the runtime download as soon as the worker spawns — a student run's
  // timeout should cover their code, not the download.
  getPyodide().catch(() => undefined);
  self.onmessage = (event: MessageEvent<TRequest>) => {
    const request = event.data;
    void (async (): Promise<WorkerOkMessage | WorkerErrorMessage> => {
      const pyodide = await getPyodide();
      // Ack once the runtime is loaded, before running student code: the
      // caller switches from the load budget to the run budget, and a
      // timeout now means the code itself — never the runtime download.
      self.postMessage({ id: request.id, phase: "executing" } satisfies WorkerPhaseMessage);
      const payload = await runRequest(pyodide, request);
      return { id: request.id, ok: true, ...payload };
    })()
      .then((response) => self.postMessage(response))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        self.postMessage({
          id: request.id,
          ok: false,
          error: message,
        } satisfies WorkerErrorMessage);
      });
  };
}
