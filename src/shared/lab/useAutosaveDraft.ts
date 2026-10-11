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
 * monotonic bump) and a per-mount `saveToken` that travel with the PUT body.
 * Three guards use them:
 *
 * - Client side, a resolving request reports its completion only while it is
 *   still the stage's latest revision, so an older in-flight save can never
 *   overwrite a newer dirty state — and a late response after an unmount or
 *   class switch finds an empty revision map and is dropped entirely.
 * - Server side, the pipeline refuses a write whose `(revision, saveToken)`
 *   is behind the one already stored for that stage, so requests that arrive
 *   out of order cannot resurrect an older draft — and equal revisions from
 *   different tabs still resolve to one deterministic winner instead of
 *   silently depending on arrival order.
 * - A rejected write (`applied: false`) that is still the stage's latest arm
 *   means the server holds a newer write from elsewhere: the hook reports it
 *   through `onConflict` so the caller can reload the project and reconcile,
 *   instead of leaving the flag hanging on "saving" or pretending success.
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
  /** PUT body; defaults to `{ stageIndex, draft }`. The revision and saveToken are merged in. */
  bodyFor?: (stageIndex: number, draft: TDraft) => Record<string, unknown>;
  /** Extra inputs (e.g. unlocked components) whose change re-arms the timer. */
  deps?: unknown[];
  onSaving: (stageIndex: number) => void;
  onSaved: (stageIndex: number) => void;
  onError: (stageIndex: number) => void;
  /** The server dropped the stage's latest write because a newer one exists
   * elsewhere — the caller should reload the project and flag the conflict. */
  onConflict?: (stageIndex: number) => void;
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
    onConflict,
  } = options;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const latestRev = useRef(new Map<number, number>());
  const lastIssuedRev = useRef(0);
  // Random per hook instance: two tabs issuing the same revision still order
  // deterministically on the server instead of racing by arrival order.
  const saveToken = useRef(crypto.randomUUID());
  // Which classId the lesson state on screen belongs to. On a class switch
  // the first render still carries the previous class's save flags — arming
  // then would PUT a stale snapshot under the new class. The cleanup effect
  // below re-points this ref right after the arm effect re-runs on that
  // commit (creates run in declaration order), so only dirty flags raised
  // under the new state arm saves.
  const armedClass = useRef(classId);

  useEffect(() => {
    if (armedClass.current !== classId) return;
    if (saveStatus !== "dirty" || !classId) return;
    const draft = draftOf(stageIndex);
    if (draft === undefined) return;
    const rev = Math.max(Date.now(), lastIssuedRev.current + 1);
    lastIssuedRev.current = rev;
    latestRev.current.set(stageIndex, rev);
    const body = {
      ...(bodyFor ? bodyFor(stageIndex, draft) : { stageIndex, draft }),
      revision: rev,
      saveToken: saveToken.current,
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
          // Still the stage's latest arm, yet the server holds a newer write:
          // a genuinely stale state, not a superseded local one — reconcile.
          if (result?.applied === false) {
            onConflict?.(stageIndex);
            return;
          }
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
  // clearing the revision map turns late responses into silent drops. This
  // effect is declared after the arm effect so its create runs last on a
  // class-switch commit: only then does the new classId become armable.
  useEffect(() => {
    armedClass.current = classId;
    const pending = timers.current;
    const revisions = latestRev.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      revisions.clear();
    };
  }, [classId]);
}
