import { useEffect, useRef } from "react";
import { api } from "../api/client";

const AUTOSAVE_DELAY_MS = 1500;

type DraftSaveResponse = {
  ok?: boolean;
  applied?: boolean;
  revision?: number;
  /** Calculator only: the component library's own OCC counter after this
   *  write (see `expectedComponentsRevision` in the body). */
  componentsRevision?: number;
};

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
 *   newer dirty state — and a response from an earlier context (unmount or
 *   class switch, including A→B→A) is generation-checked and dropped before
 *   it can cancel the new context's timers or fire conflict handling.
 * - A rejected write (`applied: false`) means the server holds a newer
 *   write from elsewhere. The stage is then fenced: its queued arm and any
 *   still-debouncing timer die with it — letting one send would carry the
 *   reconciled revision on content that predates it and silently overwrite
 *   the winning write — `onConflict` fires so the caller can refetch and
 *   reconcile, and no new arm for that stage may leave until the lesson
 *   state has caught up to the revision the rejection reported (the re-arm
 *   gate below). A failed refetch leaves the fence up: the caller flags the
 *   stage as sync-error instead of resolved and only an explicit retry may
 *   lift it. Only then does a dirty flag schedule a write that legitimately
 *   supersedes the server draft.
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
  /** The component library's OCC counter (calculator only) — the library-
   *  wide counterpart of `expectedRevisionOf`. Required when `bodyFor` may
   *  include `components`: sent back as `expectedComponentsRevision` and
   *  likewise read when a request sends, so a queued arm always carries
   *  the freshest counter rather than the one from arm time. */
  expectedComponentsRevisionOf?: () => number;
  /** PUT body; defaults to `{ stageIndex, draft }`. `expectedRevision` is merged in. */
  bodyFor?: (stageIndex: number, draft: TDraft) => Record<string, unknown>;
  /** Extra inputs (e.g. unlocked components) whose change re-arms the timer. */
  deps?: unknown[];
  onSaving: (stageIndex: number) => void;
  onSaved: (stageIndex: number, revision?: number, componentsRevision?: number) => void;
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
  // The component library's counter mirrors appliedRev but is project-wide
  // (one counter shared by every stage's save): every response that reports
  // it raises the floor a later send will claim.
  const appliedComponentsRev = useRef(0);
  // Stages the server fenced with a rejection: nothing for them may send
  // until the lesson state reconciles to the rejection's revision (gate in
  // the arm effect below).
  const conflicted = useRef(new Set<number>());
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
  // Lifecycle identity of the current mount/class context. The class-switch
  // cleanup bumps it, so a response that arrives after a switch — including
  // A→B→A where armedClass alone would match again — or after unmount is
  // dropped before it can touch timers, queues, or callbacks.
  const generation = useRef(0);

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
    // The library's expected counter joins the body only when the save
    // actually carries components — and, like expectedRevision, it is
    // computed here rather than in bodyFor so an arm that queued behind an
    // in-flight save claims the revision that save just reported.
    if (body.components !== undefined && opts.expectedComponentsRevisionOf) {
      body.expectedComponentsRevision = Math.max(
        appliedComponentsRev.current,
        opts.expectedComponentsRevisionOf(),
      );
    }
    const gen = generation.current;
    inFlight.current.add(stage);
    opts.onSaving(stage);
    void api
      .put<DraftSaveResponse>(`/api/classes/${armClass}/labs/${labId}/draft`, body)
      .then((result) => {
        if (generation.current !== gen) return;
        inFlight.current.delete(stage);
        armDraft.current.delete(arm);
        const rev = typeof result?.revision === "number" ? result.revision : undefined;
        if (rev !== undefined) {
          appliedRev.current.set(stage, Math.max(appliedRev.current.get(stage) ?? 0, rev));
        }
        const componentsRev =
          typeof result?.componentsRevision === "number" ? result.componentsRevision : undefined;
        // Adopt the reported library counter unconditionally (applied or
        // refused — both tell us where the server's counter now stands)
        // BEFORE flushing a queued arm below, so its send claims it.
        if (componentsRev !== undefined) {
          appliedComponentsRev.current = Math.max(appliedComponentsRev.current, componentsRev);
        }
        // The server refused the write — it already holds a newer draft
        // from elsewhere. Fence the stage BEFORE touching the queue: a
        // queued or still-debouncing arm would resend with the reconciled
        // expectedRevision on content that predates it and silently
        // overwrite the winning write. Kill every pending path for the
        // stage (their snapshots are dead), then report the conflict — even
        // when a newer local arm exists, since the bypassed-write window is
        // exactly what must never stay silent.
        if (result?.applied === false) {
          conflicted.current.add(stage);
          const pendingTimer = timers.current.get(stage);
          if (pendingTimer !== undefined) {
            clearTimeout(pendingTimer);
            timers.current.delete(stage);
          }
          // The stage's pending debounce arm (its latest) can never fire
          // now — drop its snapshot. The responding arm's own was already
          // dropped above; a queued arm's goes with its entry below.
          const pendingArm = latestArm.current.get(stage);
          if (pendingArm !== undefined) armDraft.current.delete(pendingArm);
          latestArm.current.delete(stage);
          const queued = queuedArm.current.get(stage);
          if (queued !== undefined) {
            queuedArm.current.delete(stage);
            armDraft.current.delete(queued);
          }
          opts.onConflict?.(stage);
          return;
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
        opts.onSaved(stage, rev, componentsRev);
      })
      .catch(() => {
        if (generation.current !== gen) return;
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
    // A fenced stage stays silent until the lesson state has reconciled to
    // the revision the rejection reported — `expectedRevisionOf` reads the
    // reducer's reconciled revisions. Drafts edited before that point may
    // never arm: their content predates the server write they would claim
    // to succeed. Once the gate passes (reconcile landed, or the learner
    // explicitly restored their copy) the stage autosaves normally.
    if (conflicted.current.has(stageIndex)) {
      const fenced =
        latestOptions.current.expectedRevisionOf(stageIndex) <
        (appliedRev.current.get(stageIndex) ?? 0);
      if (fenced) return;
      conflicted.current.delete(stageIndex);
    }
    const draft = latestOptions.current.draftOf(stageIndex);
    if (draft === undefined) return;
    const arm = ++armSeq.current;
    const prevArm = latestArm.current.get(stageIndex);
    latestArm.current.set(stageIndex, arm);
    armDraft.current.set(arm, { stage: stageIndex, draft });
    const previous = timers.current.get(stageIndex);
    if (previous) {
      clearTimeout(previous);
      // The cancelled arm's snapshot can never send — a pending-timer arm
      // is by definition neither in-flight nor queued, so nothing else
      // would ever drop it.
      if (prevArm !== undefined) armDraft.current.delete(prevArm);
    }
    const timer = setTimeout(() => {
      timers.current.delete(stageIndex);
      // The stage's earlier save is still in flight: queue this arm and let
      // the response flush it — same-session writes must never race each
      // other into a conflict.
      if (inFlight.current.has(stageIndex)) {
        // Replacing an earlier queued arm: its snapshot can never send now —
        // drop it the same way a cancelled debounce arm's is dropped.
        const prev = queuedArm.current.get(stageIndex);
        if (prev !== undefined) armDraft.current.delete(prev);
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
  // and nothing already in flight may report back into the new context — the
  // generation bump turns every earlier context's late response into a silent
  // drop even when the classId matches again (A→B→A).
  // This effect is declared after the arm effect so its create runs last on a
  // class-switch commit: only then does the new classId become armable.
  useEffect(() => {
    armedClass.current = classId;
    const pending = timers.current;
    const arms = latestArm.current;
    const queued = queuedArm.current;
    const flying = inFlight.current;
    const applied = appliedRev.current;
    const appliedComponents = appliedComponentsRev;
    const fenced = conflicted.current;
    const gen = generation;
    return () => {
      // Every request sent in this context is dead: its completion must not
      // report, fire conflicts, or cancel a newer context's timers.
      gen.current += 1;
      for (const t of pending.values()) clearTimeout(t);
      pending.clear();
      arms.clear();
      queued.clear();
      flying.clear();
      applied.clear();
      appliedComponents.current = 0;
      fenced.clear();
      armDraft.current.clear();
    };
  }, [classId]);
}
