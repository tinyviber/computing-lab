/**
 * One async-execution channel of the decoding lab. Every run is stamped
 * with the (stageIndex, inputRevision) it started under — its input
 * version. A result or error commits only while that stamp is still
 * current, so:
 *
 * - an out-of-order Pyodide completion from a previous stage can never
 *   land on the stage now on screen, nor clear its running flag;
 * - a run that finishes after the student edited the draft no longer
 *   describes the current code — it is dropped, and submit stays gated on
 *   a result that still matches the input it ran under.
 */

import { useCallback, useRef, useState } from "react";

/** An execution outcome stamped with the input it ran under. */
export type ExecutionResult<T> = {
  inputRevision: number;
  stageIndex: number;
  result: T;
};

type Outcome<T> = { ok: true; value: T } | { ok: false; error: string };

export function useDecodeExecution<T>({
  stageIndex,
  inputRevision,
  describeError,
}: {
  stageIndex: number;
  /** Version of the run input (e.g. the draft's code/fills counter). */
  inputRevision: number;
  /** Maps a thrown error to the student-facing message; defaults to message text. */
  describeError?: (error: unknown) => string;
}): {
  /** True while this channel's latest run is still in flight. */
  running: boolean;
  /** Latest successful result that still matches the current stage+input. */
  result: T | null;
  /** Latest error that still matches the current stage+input. */
  error: string | null;
  /** Run a task on this channel; its outcome is stamped and can go stale. */
  execute: (task: () => Promise<T>) => Promise<void>;
  /** Record an input-validation error on this channel (same staleness rules). */
  fail: (message: string) => void;
  /** Drop the stored outcome (e.g. leaving the stage). */
  clear: () => void;
} {
  const [envelope, setEnvelope] = useState<ExecutionResult<Outcome<T>> | null>(null);
  const [running, setRunning] = useState(false);
  // Each execute gets a ticket: only the latest run may publish or settle
  // the running flag — an older promise resolving later finds a stale ticket.
  const ticketRef = useRef(0);
  // The live stage/revision for async continuations to compare against.
  const currentRef = useRef({ stageIndex, inputRevision });
  currentRef.current = { stageIndex, inputRevision };

  const fail = useCallback(
    (message: string) => {
      setEnvelope({
        stageIndex,
        inputRevision,
        result: { ok: false, error: message },
      });
    },
    [stageIndex, inputRevision],
  );

  const execute = useCallback(
    async (task: () => Promise<T>) => {
      const ticket = ++ticketRef.current;
      const tag = { stageIndex, inputRevision };
      const settle = (result: Outcome<T>) => {
        const cur = currentRef.current;
        // A newer run owns the channel, or the input moved on mid-flight.
        if (ticketRef.current !== ticket) return;
        if (cur.stageIndex !== tag.stageIndex || cur.inputRevision !== tag.inputRevision) return;
        setEnvelope({ ...tag, result });
      };
      setRunning(true);
      setEnvelope(null);
      try {
        settle({ ok: true, value: await task() });
      } catch (error) {
        settle({
          ok: false,
          error: describeError?.(error) ?? (error instanceof Error ? error.message : String(error)),
        });
      } finally {
        if (ticketRef.current === ticket) setRunning(false);
      }
    },
    [stageIndex, inputRevision, describeError],
  );

  const clear = useCallback(() => {
    // Retire any in-flight run: its late settle/finally may no longer write
    // here, and the running flag belongs to whatever is on screen now.
    ticketRef.current += 1;
    setEnvelope(null);
    setRunning(false);
  }, []);

  // Read-time guard: an envelope stored before an edit no longer matches.
  const valid =
    envelope && envelope.stageIndex === stageIndex && envelope.inputRevision === inputRevision
      ? envelope
      : null;
  return {
    running,
    result: valid && valid.result.ok ? valid.result.value : null,
    error: valid && !valid.result.ok ? valid.result.error : null,
    execute,
    fail,
    clear,
  };
}
