import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useLabCatalog } from "../../../shared/lab/labs";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
// Cross-feature reuse per issue #58 §6 — do not lift to shared until a third
// consumer appears. The terms annotator just renders plain text here.
import { HintDisclosure } from "../../calculator/ui/HintDisclosure";
import { encodeInstr, opOperandMeaning } from "../domain/isa.ts";
import { runProgram, type CpuCase, type MachineRun } from "../domain/machine.ts";
import type {
  CpuCounterexample,
  CpuDraft,
  CpuJudgeResult,
  CpuProjectPayload,
} from "../domain/protocol.ts";
import { seedFor } from "../domain/rng.ts";
import { cpuStageUnlocked, type CpuStageDef } from "../domain/stages.ts";
import {
  answeredPromptIds,
  createCpuLessonState,
  blankRowSet,
  draftOf,
  editableRowSet,
  guidedComplete,
  nextPrompt,
  programOf,
  stageOf,
  transitionCpuLesson,
  type CpuLessonAction,
} from "../lesson/state.ts";
import { publicCasesFor } from "../lesson/publicCases.ts";
import { BlockDiagram, type CpuPhase } from "./BlockDiagram.tsx";
import { BytePlayground } from "./BytePlayground.tsx";
import { CpuStageRail } from "./CpuStageRail.tsx";
import { CpuTestPanel } from "./CpuTestPanel.tsx";
import { CurrentPromptCard, GuidedPanel } from "./GuidedPanel.tsx";
import { InstructionShelf } from "./InstructionShelf.tsx";
import { MemoryGrid } from "./MemoryGrid.tsx";
import { ProgramEditor } from "./ProgramEditor.tsx";
import { RegistersPanel } from "./RegistersPanel.tsx";
import { TraceTable } from "./TraceTable.tsx";
import "./cpu.css";

/** Reconstruct the machine image "after `cursor` cycles committed". */
function displayState(run: MachineRun, cursor: number) {
  const k = Math.min(cursor, run.trace.length);
  const mem = run.initial.mem.slice();
  for (let i = 0; i < k; i += 1) {
    const write = run.trace[i].memWrite;
    if (write) mem[write.addr] = write.value;
  }
  const lastRow = k > 0 ? run.trace[k - 1] : null;
  return {
    mem,
    regs: k < run.trace.length ? run.trace[k].regsBefore : run.final.regs,
    pc: k < run.trace.length ? run.trace[k].pc : run.final.pc,
    lastRow,
  };
}

function StageBrief({ stage }: { stage: CpuStageDef }) {
  return (
    <section className="stage-brief">
      <p>{stage.description}</p>
      <p className="cpu-task">
        <strong>任务：</strong>
        {stage.task}
      </p>
      <p className="submit-note">判题方式：{stage.judgeNote}</p>
      <HintDisclosure hint={stage.hint} />
    </section>
  );
}

const PHASES: { id: CpuPhase; label: string }[] = [
  { id: "fetch", label: "取指" },
  { id: "decode", label: "译码" },
  { id: "exec", label: "执行 · 周期末提交" },
];

export function CpuLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/cpu" });
  const { status, role, session } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionCpuLesson, undefined, () =>
    createCpuLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The machine view: which public case feeds memory, and how far through
  // its trace the display sits. Derived data — never persisted.
  const [caseIndex, setCaseIndex] = useState(0);
  // A hidden counterexample the student replayed into the machine view —
  // overrides the public-case picker until they pick a public case again.
  const [replayCase, setReplayCase] = useState<CpuCase | null>(null);
  const [cursor, setCursor] = useState(0);
  // The 3-phase scrub (issue #70 §5.2): a UI-only lens on the pending cycle
  // — fetch shows PC→mem→IR, decode the IR field split, exec the ghost
  // values about to commit. All data comes from the same trace row.
  const [phase, setPhase] = useState<CpuPhase>("fetch");
  const [clock, setClock] = useState<"idle" | "running" | "paused">("idle");

  const stage = stageOf(state);
  const draft = draftOf(state);
  const rows = programOf(state);
  const guided = stage?.guided === undefined ? false : true;

  const { loadError } = useLabProject<
    CpuDraft,
    { calculatorCoreComplete: boolean },
    CpuLessonAction
  >({
    classId,
    labId: "cpu",
    ready: status === "authenticated",
    toAction: (project: CpuProjectPayload) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
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
    saveStatus: state.saveStatus,
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

  const userId = session?.user.id ?? "";
  const publicCases = useMemo(
    () => (stage ? publicCasesFor(stage.index, seedFor(userId, "cpu", stage.index)) : []),
    [stage, userId],
  );
  const machineCase =
    replayCase ?? publicCases[Math.min(caseIndex, Math.max(0, publicCases.length - 1))] ?? null;
  const run = useMemo(
    () =>
      stage && machineCase
        ? runProgram(rows, machineCase.initMem, machineCase.initRegs, stage.maxCycles)
        : null,
    [stage, machineCase, rows],
  );
  const maxCursor = run?.trace.length ?? 0;
  const effectiveCursor = Math.min(cursor, maxCursor);
  const display = useMemo(
    () => (run ? displayState(run, effectiveCursor) : null),
    [run, effectiveCursor],
  );
  /** The cycle about to commit — all phase previews read this one row. */
  const pending = run && effectiveCursor < maxCursor ? run.trace[effectiveCursor] : null;
  /** Machine state the pending cycle is about to produce (exec ghosts). */
  const nextDisplay = useMemo(
    () => (run && pending ? displayState(run, effectiveCursor + 1) : null),
    [run, pending, effectiveCursor],
  );

  // Guided prompt gating: the first unanswered `at` prompt whose cycle
  // threshold has been reached blocks the stepper until answered.
  const answeredPrompts = useMemo(() => answeredPromptIds(state), [state]);
  // A prompt that quotes demo data pins the picker to its caseIndex while
  // unanswered — the question and the machine state can never disagree.
  const livePrompt = nextPrompt(state);
  const pinnedCaseIndex = livePrompt?.caseIndex ?? null;
  const blockingPrompt =
    stage?.guided?.prompts.find(
      (p) => !answeredPrompts.has(p.id) && p.at !== undefined && effectiveCursor >= p.at,
    ) ?? null;
  const complete = guidedComplete(state);

  // A stage switch or case switch restarts the playback.
  useEffect(() => {
    setCaseIndex(0);
    setReplayCase(null);
    setCursor(0);
    setPhase("fetch");
    setClock("idle");
  }, [state.stageIndex]);
  useEffect(() => {
    setCursor(0);
    setPhase("fetch");
    setClock("idle");
  }, [caseIndex, replayCase]);

  // While a data-pinned prompt is unanswered the picker follows it — and
  // switching cases restarts playback, which the effect above handles.
  useEffect(() => {
    if (pinnedCaseIndex === null) return;
    setReplayCase(null);
    setCaseIndex(pinnedCaseIndex);
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
      setCursor(0);
      setPhase("fetch");
      setClock("idle");
    },
    [stage],
  );

  /** One beat: advance the phase lens, and on exec→commit the cycle. */
  const onBeat = useCallback(() => {
    if (!pending || blockingPrompt) return;
    setClock("paused");
    if (phase === "fetch") setPhase("decode");
    else if (phase === "decode") setPhase("exec");
    else {
      setCursor((c) => Math.min(c + 1, maxCursor));
      setPhase("fetch");
    }
  }, [pending, blockingPrompt, phase, maxCursor]);

  // The clock ticks the machine forward; editing is locked while it runs.
  // Guided stages tick beat-by-beat (fetch → decode → exec → commit) so
  // auto-play can never skip the datapath — only challenges get the fast
  // per-cycle run. A blocking prompt pauses the clock instead of stopping.
  const canStep = pending !== null && !blockingPrompt;
  useEffect(() => {
    if (clock !== "running") return;
    if (!canStep) {
      setClock("paused");
      return;
    }
    const timer = setInterval(
      () => {
        if (guided) {
          setPhase((p) => {
            if (p === "fetch") return "decode";
            if (p === "decode") return "exec";
            setCursor((c) => Math.min(c + 1, maxCursor));
            return "fetch";
          });
        } else {
          setCursor((c) => Math.min(c + 1, maxCursor));
          setPhase("fetch");
        }
      },
      guided ? 350 : 500,
    );
    return () => clearInterval(timer);
  }, [clock, canStep, maxCursor, guided]);
  // Reaching the trace end (or a gate) settles the clock on its own.
  useEffect(() => {
    if (clock === "running" && (effectiveCursor >= maxCursor || blockingPrompt)) {
      setClock(blockingPrompt ? "paused" : "idle");
    }
  }, [clock, effectiveCursor, maxCursor, blockingPrompt]);

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
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
  }, [classId, stage, draft, state.guidedAnswers]);

  const lastOp = display?.lastRow?.decoded.op ?? null;
  const pendingIsMemRead =
    pending !== null &&
    opOperandMeaning(pending.decoded.op) === "mem" &&
    pending.decoded.op !== "STORE";
  const editable = editableRowSet(state);
  const blanks = blankRowSet(state);

  return (
    <LabAccessGate
      classId={classId}
      hidden={catalog?.get("cpu")?.hidden === true}
      labName="冯诺依曼数据通路"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="cpu-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage
            ? `${String(stage.index).padStart(2, "0")} ${stage.title}`
            : "冯诺依曼数据通路",
        }}
      >
        <div className="page-content cpu-layout">
          <CpuStageRail
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            unlocked={(s) => cpuStageUnlocked(state.passedStages, s.index)}
          />

          <main aria-label="CPU 数据通路实验区" className="cpu-workspace">
            {state.calculatorCoreComplete === false ? (
              <p className="cpu-gate-banner" role="note">
                建议先完成「实现ALU」前 6 关再来——这个实验会用到加法器和 ALU 的概念。
              </p>
            ) : null}

            {stage ? <StageBrief stage={stage} /> : null}

            {stage ? <InstructionShelf ops={stage.ops} /> : null}

            {state.message ? (
              <p className="test-error" role="alert">
                {state.message}
                <button onClick={() => dispatch({ type: "dismiss-message" })} type="button">
                  <Icon name="x" size={12} />
                </button>
              </p>
            ) : null}
            {(loadError ?? submitError) ? (
              <p className="test-error" role="alert">
                {loadError ?? submitError}
              </p>
            ) : null}

            {stage?.guided ? (
              <GuidedPanel answered={answeredPrompts} blocking={blockingPrompt} stage={stage} />
            ) : null}

            {stage && run && display ? (
              <section aria-label="机器运行" className="cpu-machine">
                {/* Everything a step needs in one viewport: the sticky bar
                    keeps clock controls, the blocking banner and the live
                    prompt card on screen while the student scrolls. */}
                <div className="cpu-step-bar">
                  <div className="cpu-clock-row">
                    <div className="cpu-clock-buttons">
                      <button
                        className="button button-secondary"
                        disabled={!canStep || clock === "running"}
                        onClick={onBeat}
                        type="button"
                      >
                        {phase === "exec" ? "提交这一周期" : "下一拍"}
                      </button>
                      {clock === "running" ? (
                        <button
                          className="button button-secondary"
                          onClick={() => setClock("paused")}
                          type="button"
                        >
                          暂停
                        </button>
                      ) : (
                        <button
                          className="button button-secondary"
                          disabled={!canStep}
                          onClick={() => setClock("running")}
                          type="button"
                        >
                          {clock === "paused" || effectiveCursor > 0 ? "继续" : "连跑"}
                        </button>
                      )}
                      <button
                        className="button button-ghost"
                        onClick={() => {
                          setClock("idle");
                          setCursor(0);
                          setPhase("fetch");
                        }}
                        type="button"
                      >
                        复位
                      </button>
                    </div>
                    <div className="cpu-phasebar" key={effectiveCursor}>
                      {PHASES.map((p, i) => (
                        <button
                          aria-pressed={pending !== null && phase === p.id}
                          className={`cpu-phase cpu-phase-${p.id}${
                            pending && phase === p.id ? " is-active" : ""
                          }`}
                          disabled={!pending || blockingPrompt !== null}
                          key={p.id}
                          onClick={() => setPhase(p.id)}
                          type="button"
                        >
                          {i > 0 ? <span className="cpu-phase-arrow">→</span> : null}
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <label className="cpu-case-picker">
                      演示数据
                      {pinnedCaseIndex !== null ? (
                        <span className="cpu-case-pin" role="note">
                          已锁定到本题的数据
                        </span>
                      ) : null}
                      <select
                        disabled={clock === "running" || pinnedCaseIndex !== null}
                        onChange={(event) => {
                          if (event.target.value === "replay") return;
                          setReplayCase(null);
                          setCaseIndex(Number(event.target.value));
                        }}
                        value={
                          replayCase
                            ? "replay"
                            : Math.min(caseIndex, Math.max(0, publicCases.length - 1))
                        }
                      >
                        {publicCases.map((testCase, i) => (
                          <option key={testCase.name} value={i}>
                            {testCase.name}
                          </option>
                        ))}
                        {replayCase ? <option value="replay">{replayCase.name}</option> : null}
                      </select>
                    </label>
                    <span className="cpu-cycle-count">
                      周期 {effectiveCursor} / {run.trace.length}
                    </span>
                  </div>

                  {blockingPrompt ? (
                    <p className="cpu-block-banner" role="note">
                      ⏸ 机器停在周期 {effectiveCursor} ——答对当前题才能继续走。
                    </p>
                  ) : null}

                  {livePrompt ? (
                    <CurrentPromptCard
                      blocking={blockingPrompt?.id === livePrompt.id}
                      currentByte={state.playgroundByte}
                      onAnswer={(promptId, option) =>
                        dispatch({ type: "answer-prompt", promptId, option })
                      }
                      prompt={livePrompt}
                      wrongPick={state.wrongPick}
                    />
                  ) : null}
                </div>

                {stage.guided?.bytePlayground ? (
                  <BytePlayground
                    byte={state.playgroundByte}
                    onByte={(value) => dispatch({ type: "set-byte", value })}
                    programBytes={rows.map(encodeInstr)}
                  />
                ) : null}

                <div className="cpu-viz-grid">
                  <ProgramEditor
                    activeRow={pending && pending.pc < rows.length ? pending.pc : null}
                    blankRows={blanks}
                    disabled={clock === "running"}
                    editableRows={guided ? editable : undefined}
                    onInsertRow={(index) => dispatch({ type: "insert-row", index })}
                    onMoveRow={(index, dir) => dispatch({ type: "move-row", index, dir })}
                    onRemoveRow={(index) => dispatch({ type: "remove-row", index })}
                    onSetRow={(index, patch) => dispatch({ type: "set-row", index, patch })}
                    ops={stage.ops}
                    rowOps={stage.guided?.rowOps}
                    rows={rows}
                  />
                  <RegistersPanel
                    carried={display.lastRow?.carried === true}
                    ir={pending && phase !== "fetch" ? pending.ir : null}
                    irInFlight={pending && phase === "fetch" ? pending.ir : null}
                    nextCarried={pending && phase === "exec" ? pending.carried === true : null}
                    nextPc={pending && phase === "exec" ? pending.nextPc : null}
                    nextRegs={nextDisplay && phase === "exec" ? nextDisplay.regs : null}
                    pc={display.pc}
                    prevPc={display.lastRow?.pc ?? null}
                    prevRegs={display.lastRow?.regsBefore ?? null}
                    regs={display.regs}
                  />
                  <MemoryGrid
                    fetchCell={pending && pending.pc < 16 ? pending.pc : -1}
                    mem={display.mem}
                    pendingWrite={
                      pending && phase === "exec" && pending.memWrite ? pending.memWrite : null
                    }
                    programRows={rows.length}
                    readCell={
                      pending && phase === "exec" && pendingIsMemRead
                        ? pending.decoded.operand
                        : null
                    }
                    scratchCells={stage.scratchCells}
                    writtenCell={display.lastRow?.memWrite?.addr ?? null}
                  />
                </div>

                <BlockDiagram op={lastOp} pending={pending} phase={pending ? phase : null} />

                <TraceTable
                  cursor={effectiveCursor}
                  onScrub={(cycle) => {
                    setClock("paused");
                    setCursor(cycle);
                    setPhase("fetch");
                  }}
                  run={run}
                />
              </section>
            ) : null}

            {stage ? (
              <div className="submit-row">
                <button
                  className="button button-secondary"
                  disabled={publicCases.length === 0}
                  onClick={() => dispatch({ type: "run-public-tests", cases: publicCases })}
                  type="button"
                >
                  运行公开测试
                </button>
                <button
                  className="button button-primary"
                  disabled={submitting || rows.length === 0 || (guided && !complete)}
                  onClick={() => void onSubmit()}
                  title={guided && !complete ? "先完成上面的引导任务" : undefined}
                  type="button"
                >
                  {submitting ? "判定中…" : "提交判定"}
                </button>
                <span className="submit-note">
                  {guided && !complete
                    ? "这一关要先完成上面的引导任务才能提交。"
                    : "服务器会用带隐藏数据的用例判定——公开测试只是热身。"}
                </span>
              </div>
            ) : null}

            <CpuTestPanel
              judgeOutcome={state.judgeOutcome}
              onReplayCounterexample={onReplayCounterexample}
              runOutcome={state.runOutcome}
            />
          </main>
        </div>
      </AppPageLayout>
    </LabAccessGate>
  );
}
