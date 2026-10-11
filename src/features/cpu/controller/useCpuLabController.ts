import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { runProgram, type CpuCase } from "../domain/machine.ts";
import type {
  CpuCounterexample,
  CpuDraft,
  CpuJudgeResult,
  CpuProjectPayload,
} from "../domain/protocol.ts";
import { seedFor, shuffledIndices } from "../domain/rng.ts";
import {
  createCpuLessonState,
  draftOf,
  nextPrompt,
  programOf,
  stageOf,
  transitionCpuLesson,
  type CpuLessonAction,
} from "../lesson/state.ts";
import { publicCasesFor } from "../lesson/publicCases.ts";
import { createCpuLabViewModel } from "./createViewModel.ts";
import type { CpuLabActions, CpuPhase, CpuPlaybackView, CpuWorkspaceProps } from "./viewModel.ts";

const ZERO_PLAY_VIEW: CpuPlaybackView = { cursor: 0, visited: 0, phase: "fetch" };

/** Cycle commit: cursor+1, visited never shrinks, phase back to fetch. */
function commitView(cur: CpuPlaybackView, maxCursor: number): CpuPlaybackView {
  const cursor = Math.min(cur.cursor + 1, maxCursor);
  return { cursor, visited: Math.max(cur.visited, cursor), phase: "fetch" };
}

/** One beat: fetch → decode → exec → commit. Pure — the whole step is a
 * single state computation, so a StrictMode-double-invoked updater can
 * never commit a cycle twice (issue #100 review). */
function beatView(cur: CpuPlaybackView, maxCursor: number): CpuPlaybackView {
  if (cur.phase === "fetch") return { ...cur, phase: "decode" };
  if (cur.phase === "decode") return { ...cur, phase: "exec" };
  return commitView(cur, maxCursor);
}

/** Owns persistence, lesson transitions and the trace-driven clock. */
export function useCpuLabController({
  classId,
  ready,
  userId,
}: {
  classId: string;
  ready: boolean;
  userId: string;
}): CpuWorkspaceProps {
  const [state, dispatch] = useReducer(transitionCpuLesson, undefined, () =>
    createCpuLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [recordingPrompt, setRecordingPrompt] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The machine view: which public case feeds memory, and how far through
  // its trace the display sits. Derived data — never persisted.
  const [caseIndex, setCaseIndex] = useState(0);
  // A hidden counterexample the student replayed into the machine view —
  // overrides the public-case picker until they pick a public case again.
  const [replayCase, setReplayCase] = useState<CpuCase | null>(null);
  // Machine-view positions, kept per playbackId so a case/program switch
  // discards the previous run's position on the same render — the new run
  // starts at 0 instead of inheriting a stale end cursor (issue #100
  // review: case-switch race + program-edit stale run).
  const [playbackViews, setPlaybackViews] = useState<Record<string, CpuPlaybackView>>({});
  // Every counterexample load gets its own playback identity — two
  // different hidden cases can never share a walk-through (issue #100
  // review).
  const [replayRevision, setReplayRevision] = useState(0);
  // Public cases this student has walked to HALT on this stage — the
  // observation gate for submitting a zero-programming core stage.
  const [observedCases, setObservedCases] = useState<ReadonlySet<number>>(new Set());
  const [clock, setClock] = useState<"idle" | "running" | "paused">("idle");

  const stage = stageOf(state);
  const draft = draftOf(state);
  const rows = programOf(state);
  const guided = stage?.guided === undefined ? false : true;
  const stageSeed = stage ? seedFor(userId, "cpu", stage.index) : 0;
  // 点餐机 I/O: the stage's 拨码开关 input cell and fixed 数码管 output cell
  // — only stages that declare `io` get the I/O boxes lit.

  const { projectLoaded, loadError, fetchProject } = useLabProject<
    CpuDraft,
    { calculatorCoreComplete: boolean },
    CpuLessonAction
  >({
    classId,
    labId: "cpu",
    ready,
    toAction: (project: CpuProjectPayload) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      draftRevisions: project.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      calculatorCoreComplete: project.calculatorCoreComplete,
    }),
    dispatch,
  });

  useAutosaveDraft<CpuDraft>({
    classId,
    labId: "cpu",
    // While the (new class's) project is loading the flags on screen still
    // belong to the previous context — nothing may schedule writes for it.
    saveStatus: projectLoaded ? statusForStage(state.saveStatusByStage, state.stageIndex) : "idle",
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
    onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
    onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
    onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
    // The server dropped this write because a newer one already exists
    // elsewhere: refetch so local state reconciles to the winning draft,
    // then flag the conflict briefly on the stage.
    onConflict: (s) => {
      // Reconcile only the conflicted stage against the server's copy —
      // other stages keep their unsaved local drafts and flags.
      void fetchProject().then((project) => {
        if (!project) {
          dispatch({ type: "mark-save-conflict", stageIndex: s });
          return;
        }
        dispatch({
          type: "resolve-save-conflict",
          stageIndex: s,
          draft: project.drafts?.[s],
          revision: project.draftRevisions?.[s],
        });
      });
    },
  });

  const publicCases = useMemo(
    () => (stage ? publicCasesFor(stage.index, stageSeed) : []),
    [stage, stageSeed],
  );
  const promptOptionOrders = useMemo(() => {
    if (!stage?.guided) return {};
    return Object.fromEntries(
      stage.guided.prompts.map((prompt) => [
        prompt.id,
        shuffledIndices(
          prompt.options.length,
          seedFor(userId, `cpu-prompt-${prompt.id}`, stage.index),
        ),
      ]),
    );
  }, [stage, userId]);
  const machineCase =
    replayCase ?? publicCases[Math.min(caseIndex, Math.max(0, publicCases.length - 1))] ?? null;
  // The playback identity — (stage, case, replay revision, edit revision).
  // Any change discards the previous run's view on the SAME render because
  // `view` is keyed by it: the new run's entry is absent, so
  // cursor/visited/phase fall back to 0. A stale end-cursor can never leak
  // into the next run's transitional render — that was the case-switch
  // race (fresh case wrongly marked observed + its trace flashed), the
  // program-edit stale run (P2), the cross-stage collision between
  // free-authoring stages whose empty programs produced identical keys,
  // and the A→B→A edit that used to resurrect the cached run (P3).
  const playbackId = `${stage?.index ?? 0}-${caseIndex}-${
    replayCase === null ? "p" : `r${replayRevision}`
  }-e${state.editRevision}`;
  const run = useMemo(
    () =>
      stage && machineCase
        ? runProgram(rows, machineCase.initMem, machineCase.initRegs, stage.maxCycles)
        : null,
    [stage, machineCase, rows],
  );
  const maxCursor = run?.trace.length ?? 0;
  const view = playbackViews[playbackId] ?? ZERO_PLAY_VIEW;
  const model = createCpuLabViewModel({
    state,
    run,
    view,
    clock,
    caseIndex,
    replayCase,
    publicCases,
    observedCases,
    promptOptionOrders,
    recordingPrompt,
    submitting,
    loadError: loadError ?? null,
    submitError,
  });
  const effectiveCursor = model.machine?.cursor ?? 0;
  const blockingPrompt = model.machine?.blockingNote ?? null;
  const canStep = model.machine?.canStep ?? false;

  const setViewPhase = useCallback(
    (phase: CpuPhase) => {
      setPlaybackViews((views) => {
        const cur = views[playbackId] ?? ZERO_PLAY_VIEW;
        return { ...views, [playbackId]: { ...cur, phase } };
      });
    },
    [playbackId],
  );
  /** Scrub the machine view to a committed cycle (no re-observation). */
  const scrubTo = useCallback(
    (cycle: number) => {
      setPlaybackViews((views) => {
        const cur = views[playbackId] ?? ZERO_PLAY_VIEW;
        return { ...views, [playbackId]: { ...cur, cursor: cycle, phase: "fetch" } };
      });
    },
    [playbackId],
  );
  /** Restart the current run's walk-through (复位 button). */
  const resetView = useCallback(() => {
    setPlaybackViews((views) => ({ ...views, [playbackId]: ZERO_PLAY_VIEW }));
  }, [playbackId]);
  const pinnedCaseIndex = nextPrompt(state)?.caseIndex ?? null;

  // A stage switch restarts the playback and the observation record — each
  // stage asks for its own full walk-through. A case/replay/program switch
  // needs no reset effect at all: `view` is keyed by `playbackId`, so the
  // new run renders cursor/visited/phase=0 on its first render and a stale
  // end-cursor can never leak across (issue #100 review: the transitional
  // render is what made the old cursor+effect reset racy).
  useEffect(() => {
    setCaseIndex(0);
    setReplayCase(null);
    setObservedCases(new Set());
    setClock("idle");
  }, [state.stageIndex]);

  // While a data-pinned prompt is unanswered the picker follows it — and
  // switching cases restarts playback, which the effect above handles. The
  // clock goes back to idle too so a paused walk doesn't mislabel the
  // fresh run's button as 「继续」 (issue #100 review).
  useEffect(() => {
    if (pinnedCaseIndex === null) return;
    setReplayCase(null);
    setCaseIndex(pinnedCaseIndex);
    setClock("idle");
  }, [pinnedCaseIndex]);

  // The hidden judge counterexample can be replayed through the same
  // machine view — the run re-executes locally on the student's current
  // program, so edits can be re-checked without another submission.
  const onReplayCounterexample = useCallback(
    (c: CpuCounterexample) => {
      if (!stage) return;
      setReplayCase({
        name: `隐藏反例 · ${c.name}`,
        category: c.category,
        initMem: c.initMem,
        initRegs: c.initRegs,
        expect: { cycles: stage.maxCycles },
      });
      setReplayRevision((n) => n + 1);
      setClock("idle");
    },
    [stage],
  );

  /** Advance the machine view — "beat" walks the phase lens then commits
   * the cycle at exec; "cycle" commits a whole cycle (challenge fast-run).
   * ONE pure state transition per call: phase, cursor and visited move
   * together, so a StrictMode double-invoked updater can never commit a
   * cycle twice (issue #100 review). */
  const advanceView = useCallback(
    (mode: "beat" | "cycle") => {
      setPlaybackViews((views) => {
        const cur = views[playbackId] ?? ZERO_PLAY_VIEW;
        const next = mode === "beat" ? beatView(cur, maxCursor) : commitView(cur, maxCursor);
        return { ...views, [playbackId]: next };
      });
    },
    [playbackId, maxCursor],
  );

  /** One beat: advance the phase lens, and on exec→commit the cycle. */
  const onBeat = useCallback(() => {
    if (!canStep) return;
    setClock("paused");
    advanceView("beat");
  }, [canStep, advanceView]);

  // Observation is recorded from COMMITTED state, not inside an updater:
  // when this playback's `visited` reaches the trace end on a public case
  // the case counts as watched (issue #100 review — updaters must stay
  // pure; StrictMode may double-invoke them in development).
  useEffect(() => {
    if (replayCase !== null || maxCursor === 0 || view.visited < maxCursor) return;
    setObservedCases((s) => (s.has(caseIndex) ? s : new Set(s).add(caseIndex)));
  }, [view.visited, maxCursor, replayCase, caseIndex]);

  // The clock ticks the machine forward; editing is locked while it runs.
  // Guided stages tick beat-by-beat (fetch → decode → exec → commit) so
  // auto-play can never skip the datapath — only challenges get the fast
  // per-cycle run. A blocking prompt pauses the clock instead of stopping.
  useEffect(() => {
    if (clock !== "running") return;
    if (!canStep) {
      setClock("paused");
      return;
    }
    const timer = setInterval(() => advanceView(guided ? "beat" : "cycle"), guided ? 350 : 500);
    return () => clearInterval(timer);
  }, [clock, canStep, guided, advanceView]);
  // Reaching the trace end (or a gate) settles the clock on its own.
  useEffect(() => {
    if (clock === "running" && (effectiveCursor >= maxCursor || blockingPrompt)) {
      setClock(blockingPrompt ? "paused" : "idle");
    }
  }, [clock, effectiveCursor, maxCursor, blockingPrompt]);

  const onSubmit = useCallback(async () => {
    if (!classId || !stage || !model.submission.canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await api.post<CpuJudgeResult>(`/api/classes/${classId}/labs/cpu/judge`, {
        stageIndex: stage.index,
        draft,
        guidedAnswers: stage.guided ? (state.guidedAnswers[stage.index] ?? {}) : undefined,
      });
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, draft, state.guidedAnswers, model.submission.canSubmit]);

  const onPromptAnswer = useCallback(
    async (promptId: string, option: number) => {
      if (!classId || !stage || recordingPrompt) return;
      const prompt = model.guide?.prompts.find((p) => p.id === promptId);
      if (!prompt?.next || !prompt.options.some((o) => o.index === option && !o.disabled)) return;
      setRecordingPrompt(true);
      setSubmitError(null);
      try {
        await api.post<{ optionIndex: number }>(`/api/classes/${classId}/labs/cpu/guided-answer`, {
          stageIndex: stage.index,
          promptId,
          optionIndex: option,
        });
        dispatch({ type: "answer-prompt", stageIndex: stage.index, promptId, option });
      } catch (error) {
        setSubmitError(`记录预测失败：${describeApiError(error)}`);
      } finally {
        setRecordingPrompt(false);
      }
    },
    [classId, stage, recordingPrompt, model.guide],
  );

  const actions: CpuLabActions = {
    selectStage: (stageIndex) => dispatch({ type: "select-stage", stageIndex }),
    dismissMessage: () => dispatch({ type: "dismiss-message" }),
    setRow: (index, patch) => {
      if (clock !== "running") dispatch({ type: "set-row", index, patch });
    },
    insertRow: (index) => {
      if (clock !== "running") dispatch({ type: "insert-row", index });
    },
    moveRow: (index, dir) => {
      if (clock !== "running") dispatch({ type: "move-row", index, dir });
    },
    removeRow: (index) => {
      if (clock !== "running") dispatch({ type: "remove-row", index });
    },
    answerPrompt: onPromptAnswer,
    setByte: (value) => dispatch({ type: "set-byte", value }),
    step: () => {
      if (clock !== "running") onBeat();
    },
    run: () => {
      if (canStep) setClock("running");
    },
    pause: () => setClock("paused"),
    reset: () => {
      setClock("idle");
      resetView();
    },
    selectPhase: (phase) => {
      if (model.machine?.canSelectPhase) setViewPhase(phase);
    },
    selectCase: (index) => {
      if (
        !model.machine?.canSelectCase ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= publicCases.length
      )
        return;
      setReplayCase(null);
      setCaseIndex(index);
      setClock("idle");
    },
    scrubTo: (cycle) => {
      if (!Number.isInteger(cycle) || cycle < 0 || cycle > Math.min(view.visited, maxCursor))
        return;
      setClock("paused");
      scrubTo(cycle);
    },
    runPublicTests: () => dispatch({ type: "run-public-tests", cases: publicCases }),
    submit: onSubmit,
    replayCounterexample: onReplayCounterexample,
  };
  return { model, actions };
}
