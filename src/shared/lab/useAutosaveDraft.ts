import { useEffect, useRef } from "react";
import { api } from "../api/client";

const AUTOSAVE_DELAY_MS = 1500;

type DraftSaveResponse = { ok?: boolean; applied?: boolean; revision?: number };

/**
 * Silent debounced autosave of the per-stage draft. Timers live in a ref keyed
 * by stage, so an armed payload always reaches the server: effect re-runs and
 * stage switches never cancel a pending timer — only a newer arm for the same
 * stage (debounce) or unmount does.
 *
 * Draft writes are optimistic concurrency on a server-assigned revision:
 * every PUT carries `expectedRevision` — the revision the client last saw
 * applied for that stage (0 when none). The server applies the write only
 * while that still equals its stored revision and answers with the assigned
 * (`applied: true`) or current stored (`applied: false`) revision, so a stale
 * write can never resurrect an older draft and client clocks play no role.
 * The draft snapshot is taken when the timer arms — the dirty flag marks
 * THAT draft — while `expectedRevision` is computed when a request sends, so
 * a save that applied between arm and send still raises it. Four guards make
 * that safe in a live editor:
 *
 * - One request per stage at a time: a timer that fires while its stage's
 *   earlier save is still in flight queues instead of sending; when the
 *   response lands, the newest queued arm sends with a freshly computed
 *   expectedRevision. Without it two of our own writes would race each other
 *   into a false conflict and clobber newer local edits.
 * - The draft snapshot is per arm, not read at send time: `draftOf` in the
 *   committed options returns the stage the page is showing NOW, which would
 *   send the wrong stage's draft once the learner has switched away.
 * - A resolving request reports its completion only while it is still the
 *   stage's latest arm, so an older in-flight save can never overwrite a
 *   newer dirty state — and a late response after an unmount or class switch
 *   finds an empty arm map and is dropped entirely.
 * - A rejected write (`applied: false`) that is still the stage's latest arm
 *   means the server holds a newer write from elsewhere: the hook reports it
 *   through `onConflict` so the caller can reconcile that stage's draft,
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
  /** The revision the stage's last applied save reported (0 when none) —
   *  sent back to the server as `expectedRevision`. Read when a request
   *  sends, so it always reflects the freshest project state. */
  expectedRevisionOf: (stageIndex: number) => number;
  /** PUT body; defaults to `{ stageIndex, draft }`. `expectedRevision` is merged in. */
  bodyFor?: (stageIndex: number, draft: TDraft) => Record<string, unknown>;
  /** Extra inputs (e.g. unlocked components) whose change re-arms the timer. */
  deps?: unknown[];
  onSaving: (stageIndex: number) => void;
  onSaved: (stageIndex: number, revision?: number) => void;
  onError: (stageIndex: number) => void;
  /** The server dropped the stage's latest write because a newer one exists
   *  elsewhere — the caller should refetch the project and reconcile the
   *  conflicted stage's draft. */
  onConflict?: (stageIndex: number) => void;
}): void {
  const { classId, labId, saveStatus, stageIndex, deps = [] } = options;
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());
  const latestArm = useRef(new Map<number, number>());
  const queuedArm = useRef(new Map<number, number>());
  const inFlight = useRef(new Set<number>());
  const appliedRev = useRef(new Map<number, number>());
  const armSeq = useRef(0);
  // The request body and expectedRevision are built when a request sends,
  // not when it armed — reads always go through the latest committed options.
  const latestOptions = useRef(options);
  // Which classId the lesson state on screen belongs to. On a class switch
  // the first render still carries the previous class's save flags — arming
  // then would PUT a stale snapshot under the new class. The cleanup effect
  // below re-points this ref right after the arm effect re-runs on that
  // commit (creates run in declaration order), so only dirty flags raised
  // under the new state arm saves.
  const armedClass = useRef(classId);

  useEffect(() => {
    latestOptions.current = options;
  });

  // Per-arm draft snapshots: the draft a dirty flag marked belongs to the
  // stage armed at that moment — reading draftOf later would see whatever
  // stage is on screen when the timer fires, not the one that was edited.
  const armDraft = useRef(new Map<number, { stage: number; draft: TDraft }>());

  const sendNow = (stage: number, arm: number, armClass: string) => {
    const opts = latestOptions.current;
    const entry = armDraft.current.get(arm);
    if (!entry || entry.stage !== stage) return;
    const draft = entry.draft;
    const expectedRevision = Math.max(
      appliedRev.current.get(stage) ?? 0,
      opts.expectedRevisionOf(stage),
    );
    const body = {
      ...(opts.bodyFor ? opts.bodyFor(stage, draft) : { stageIndex: stage, draft }),
      expectedRevision,
    } as Record<string, unknown>;
    inFlight.current.add(stage);
    opts.onSaving(stage);
    void api
      .put<DraftSaveResponse>(`/api/classes/${armClass}/labs/${labId}/draft`, body)
      .then((result) => {
        if (armedClass.current !== armClass) return;
        inFlight.current.delete(stage);
        armDraft.current.delete(arm);
        const rev = typeof result?.revision === "number" ? result.revision : undefined;
        if (rev !== undefined) {
          appliedRev.current.set(stage, Math.max(appliedRev.current.get(stage) ?? 0, rev));
        }
        // A newer arm waited for this response — send it and let ITS result
        // report; this arm was superseded whether it applied or not.
        const queued = queuedArm.current.get(stage);
        if (queued !== undefined) {
          queuedArm.current.delete(stage);
          sendNow(stage, queued, armClass);
          return;
        }
        if (latestArm.current.get(stage) !== arm) return;
        // Still the stage's latest arm, yet the server holds a newer write:
        // a genuinely stale state, not a superseded local one — reconcile.
        if (result?.applied === false) {
          opts.onConflict?.(stage);
          return;
        }
        opts.onSaved(stage, rev);
      })
      .catch(() => {
        if (armedClass.current !== armClass) return;
        inFlight.current.delete(stage);
        armDraft.current.delete(arm);
        const queued = queuedArm.current.get(stage);
        if (queued !== undefined) {
          queuedArm.current.delete(stage);
          sendNow(stage, queued, armClass);
          return;
        }
        if (latestArm.current.get(stage) === arm) opts.onError(stage);
      });
  };

  useEffect(() => {
    if (armedClass.current !== classId) return;
    if (saveStatus !== "dirty" || !classId) return;
    const draft = latestOptions.current.draftOf(stageIndex);
    if (draft === undefined) return;
    const arm = ++armSeq.current;
    latestArm.current.set(stageIndex, arm);
    armDraft.current.set(arm, { stage: stageIndex, draft });
    const previous = timers.current.get(stageIndex);
    if (previous) clearTimeout(previous);
    const timer = setTimeout(() => {
      timers.current.delete(stageIndex);
      // The stage's earlier save is still in flight: queue this arm and let
      // the response flush it — same-session writes must never race each
      // other into a conflict.
      if (inFlight.current.has(stageIndex)) {
        queuedArm.current.set(stageIndex, arm);
        return;
      }
      sendNow(stageIndex, arm, classId);
    }, AUTOSAVE_DELAY_MS);
    timers.current.set(stageIndex, timer);
    // Deliberately no cleanup: the callbacks and draftOf are inline closures
    // (new identity every render), so they stay out of the dep list and the
    // timer only re-arms on the stable inputs below — never on every render,
    // and never just because saveStatus flipped.
  }, [saveStatus, stageIndex, classId, labId, ...deps]);

  // Unmount or class switch: nothing armed for this context should still fire,
  // and nothing already in flight may report back into the new context —
  // clearing the arm/revision maps turns late responses into silent drops.
  // This effect is declared after the arm effect so its create runs last on a
  // class-switch commit: only then does the new classId become armable.
  useEffect(() => {
    armedClass.current = classId;
    const pending = timers.current;
    const arms = latestArm.current;
    const queued = queuedArm.current;
    const flying = inFlight.current;
    const applied = appliedRev.current;
    return () => {
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      arms.clear();
      queued.clear();
      flying.clear();
      applied.clear();
      armDraft.current.clear();
    };
  }, [classId]);
}
