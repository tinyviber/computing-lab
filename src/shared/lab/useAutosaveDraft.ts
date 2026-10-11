import { useEffect, useRef } from "react";
import { api } from "../api/client";

const AUTOSAVE_DELAY_MS = 1500;

type DraftSaveResponse = { ok?: boolean; applied?: boolean };

/**
 * Silent debounced autosave of the per-stage draft. Timers live in a ref keyed
 * by stage, so an armed payload always reaches the server: effect re-runs and
 * stage switches never cancel a pending timer — only a newer arm for the same
 * stage (debounce) or unmount does.
 *
 * Every arm is stamped with a globally increasing revision (wall clock plus a
 * monotonic bump) that travels with the PUT body. Two guards use it:
 *
 * - Client side, a resolving request reports its completion only while it is
 *   still the stage's latest revision, so an older in-flight save can never
 *   overwrite a newer dirty state — and a late response after an unmount or
 *   class switch finds an empty revision map and is dropped entirely.
 * - Server side, the pipeline refuses a write whose revision is behind the
 *   one already stored for that stage, so requests that arrive out of order
 *   cannot resurrect an older draft.
 *
 * The lifecycle callbacks all receive the stage they fired for; the lesson
 * reducer keeps flags per stage so one stage's late completion cannot
 * clobber the flag of the stage now on screen.
 */
export function useAutosaveDraft<TDraft>(options: {
  classId: string | undefined;
  labId: string;
  /** The lesson's save flag for `stageIndex` — the schedule only arms while "dirty". */
  saveStatus: string;
  stageIndex: number;
  /** Snapshots the draft that should persist for the given stage. */
  draftOf: (stageIndex: number) => TDraft | undefined;
  /** PUT body; defaults to `{ stageIndex, draft }`. The revision is merged in. */
  bodyFor?: (stageIndex: number, draft: TDraft) => Record<string, unknown>;
  /** Extra inputs (e.g. unlocked components) whose change re-arms the timer. */
  deps?: unknown[];
  onSaving: (stageIndex: number) => void;
  onSaved: (stageIndex: number) => void;
  onError: (stageIndex: number) => void;
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
  const lastIssuedRev = useRef(0);

  useEffect(() => {
    if (saveStatus !== "dirty" || !classId) return;
    const draft = draftOf(stageIndex);
    if (draft === undefined) return;
    const rev = Math.max(Date.now(), lastIssuedRev.current + 1);
    lastIssuedRev.current = rev;
    latestRev.current.set(stageIndex, rev);
    const body = {
      ...(bodyFor ? bodyFor(stageIndex, draft) : { stageIndex, draft }),
      revision: rev,
    } as Record<string, unknown>;
    const previous = timers.current.get(stageIndex);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      timers.current.delete(stageIndex);
      onSaving(stageIndex);
      void api
        .put<DraftSaveResponse>(`/api/classes/${classId}/labs/${labId}/draft`, body)
        .then((result) => {
          if (latestRev.current.get(stageIndex) !== rev) return;
          // The server dropped this write as stale — the newer arm that
          // superseded it owns the stage's flag and will settle it itself.
          if (result?.applied === false) return;
          onSaved(stageIndex);
        })
        .catch(() => {
          if (latestRev.current.get(stageIndex) === rev) onError(stageIndex);
        });
    }, AUTOSAVE_DELAY_MS);
    timers.current.set(stageIndex, timer);
    // Deliberately no cleanup: the callbacks and draftOf are inline closures
    // (new identity every render), so they stay out of the dep list and the
    // timer only re-arms on the stable inputs below — never on every render,
    // and never just because saveStatus flipped.
  }, [saveStatus, stageIndex, classId, labId, ...deps]);

  // Unmount or class switch: nothing armed for this context should still fire,
  // and nothing already in flight may report back into the new context —
  // clearing the revision map turns late responses into silent drops.
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
