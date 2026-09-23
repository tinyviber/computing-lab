import { useEffect, useRef } from "react";
import { api } from "../api/client";

const AUTOSAVE_DELAY_MS = 1500;

/**
 * Silent debounced autosave of the per-stage draft. Timers live in a ref keyed
 * by stage, so an armed payload always reaches the server: effect re-runs and
 * stage switches never cancel a pending timer — only a newer arm for the same
 * stage (debounce) or unmount does. Each arm is stamped with a per-stage
 * revision; when a request resolves, its completion is reported only while it
 * is still the stage's latest revision, so an older in-flight save can never
 * overwrite a newer dirty state.
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
  const latestRev = useRef(new Map<number, number>());
  const seq = useRef(0);

  useEffect(() => {
    if (saveStatus !== "dirty" || !classId) return;
    const draft = draftOf(stageIndex);
    if (draft === undefined) return;
    const body = bodyFor ? bodyFor(stageIndex, draft) : { stageIndex, draft };
    const rev = ++seq.current;
    latestRev.current.set(stageIndex, rev);
    const previous = timers.current.get(stageIndex);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      timers.current.delete(stageIndex);
      onSaving();
      void api
        .put(`/api/classes/${classId}/labs/${labId}/draft`, body)
        .then(() => {
          if (latestRev.current.get(stageIndex) === rev) onSaved();
        })
        .catch(() => {
          if (latestRev.current.get(stageIndex) === rev) onError();
        });
    }, AUTOSAVE_DELAY_MS);
    timers.current.set(stageIndex, timer);
    // Deliberately no cleanup: the callbacks and draftOf are inline closures
    // (new identity every render), so they stay out of the dep list and the
    // timer only re-arms on the stable inputs below — never on every render,
    // and never just because saveStatus flipped.
  }, [saveStatus, stageIndex, classId, labId, ...deps]);

  // Unmount or class switch: nothing armed for this context should still fire.
  useEffect(() => {
    const pending = timers.current;
    const revisions = latestRev.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      revisions.clear();
    };
  }, [classId]);
}
