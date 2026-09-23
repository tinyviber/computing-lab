import { useEffect, useRef } from "react";
import { api } from "../api/client";

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Silent debounced autosave of the per-stage draft. Timers are keyed by
 * stage so switching stages never cancels a payload that was already
 * captured for the stage the learner was editing.
 */
export function useAutosaveDraft<TDraft>(options: {
  classId: string | undefined;
  labId: string;
  /** The lesson reducer's save flag — the schedule only arms while "dirty". */
  saveStatus: string;
  stageIndex: number;
  /** Snapshots the draft that should persist for the given stage. */
  draftOf: (stageIndex: number) => TDraft | undefined;
  /** PUT body; defaults to `{ stageIndex, draft }`. */
  bodyFor?: (stageIndex: number, draft: TDraft) => unknown;
  /** Extra inputs (e.g. unlocked components) whose change re-arms the timer. */
  deps?: unknown[];
  onSaving: () => void;
  onSaved: () => void;
  onError: () => void;
}): void {
  const {
    classId,
    labId,
    saveStatus,
    stageIndex,
    draftOf,
    bodyFor,
    deps = [],
    onSaving,
    onSaved,
    onError,
  } = options;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const contextRef = useRef({ classId, stageIndex });
  contextRef.current = { classId, stageIndex };

  useEffect(() => {
    if (saveStatus !== "dirty" || !classId) return;
    const draft = draftOf(stageIndex);
    if (draft === undefined) return;
    const body = bodyFor ? bodyFor(stageIndex, draft) : { stageIndex, draft };
    const previous = timers.current.get(stageIndex);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      timers.current.delete(stageIndex);
      onSaving();
      void api
        .put(`/api/classes/${classId}/labs/${labId}/draft`, body)
        .then(() => onSaved())
        .catch(() => onError());
    }, AUTOSAVE_DELAY_MS);
    timers.current.set(stageIndex, timer);
    return () => {
      // Re-arming on the same stage debounces the old timer; a stage switch
      // leaves it alive because its payload is bound to the old stage.
      if (
        contextRef.current.classId === classId &&
        contextRef.current.stageIndex === stageIndex &&
        timers.current.get(stageIndex) === timer
      ) {
        clearTimeout(timer);
        timers.current.delete(stageIndex);
      }
    };
    // The callbacks and draftOf are inline closures — new identity every
    // render — so they cannot join the deps; the timer should only re-arm on
    // the stable inputs (and the caller's extra deps), not on every render.
  }, [saveStatus, stageIndex, classId, labId, ...deps]);
}
