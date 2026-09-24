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
  createCpuLessonState,
  draftOf,
  programOf,
  stageOf,
  transitionCpuLesson,
  type CpuLessonAction,
} from "../lesson/state.ts";
import { publicCasesFor } from "../lesson/publicCases.ts";
import { BlockDiagram } from "./BlockDiagram.tsx";
import { CpuStageRail } from "./CpuStageRail.tsx";
import { CpuTestPanel } from "./CpuTestPanel.tsx";
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
  const [clock, setClock] = useState<"idle" | "running" | "paused">("idle");

  const stage = stageOf(state);
  const draft = draftOf(state);
  const rows = programOf(state);

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

  // A stage switch or case switch restarts the playback.
  useEffect(() => {
    setCaseIndex(0);
    setReplayCase(null);
    setCursor(0);
    setClock("idle");
  }, [state.stageIndex]);
  useEffect(() => {
    setCursor(0);
    setClock("idle");
  }, [caseIndex, replayCase]);

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
      setClock("idle");
    },
    [stage],
  );

  // 2 Hz clock: each tick commits one cycle; editing is locked while it runs.
  const canStep = run !== null && effectiveCursor < maxCursor;
  useEffect(() => {
    if (clock !== "running") return;
    if (!canStep) {
      setClock("idle");
      return;
    }
    const timer = setInterval(() => {
      setCursor((c) => {
        const next = Math.min(c + 1, maxCursor);
        return next;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [clock, canStep, maxCursor]);
  // Reaching the trace end stops the clock on its own.
  useEffect(() => {
    if (clock === "running" && effectiveCursor >= maxCursor) setClock("idle");
  }, [clock, effectiveCursor, maxCursor]);

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await api.post<CpuJudgeResult>(`/api/classes/${classId}/labs/cpu/judge`, {
        stageIndex: stage.index,
        draft,
      });
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, draft]);

  const lastOp = display?.lastRow?.decoded.op ?? null;

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

            {stage ? (
              <ProgramEditor
                disabled={clock === "running"}
                onInsertRow={(index) => dispatch({ type: "insert-row", index })}
                onMoveRow={(index, dir) => dispatch({ type: "move-row", index, dir })}
                onRemoveRow={(index) => dispatch({ type: "remove-row", index })}
                onSetRow={(index, patch) => dispatch({ type: "set-row", index, patch })}
                ops={stage.ops}
                rows={rows}
              />
            ) : null}

            {stage && run && display ? (
              <section aria-label="机器运行" className="cpu-machine">
                <div className="cpu-clock-row">
                  <div className="cpu-clock-buttons">
                    <button
                      className="button button-secondary"
                      disabled={!canStep || clock === "running"}
                      onClick={() => {
                        setClock("paused");
                        setCursor((c) => Math.min(c + 1, maxCursor));
                      }}
                      type="button"
                    >
                      单步
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
                      }}
                      type="button"
                    >
                      复位
                    </button>
                  </div>
                  <div className="cpu-phasebar" key={effectiveCursor}>
                    <span className="cpu-phase cpu-phase-fetch">取指</span>
                    <span className="cpu-phase cpu-phase-decode">译码</span>
                    <span className="cpu-phase cpu-phase-exec">执行 · 周期末提交</span>
                  </div>
                  <label className="cpu-case-picker">
                    演示数据
                    <select
                      disabled={clock === "running"}
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

                <div className="cpu-viz-grid">
                  <RegistersPanel
                    carried={display.lastRow?.carried === true}
                    ir={display.lastRow?.ir ?? null}
                    pc={display.pc}
                    prevPc={display.lastRow?.pc ?? null}
                    prevRegs={display.lastRow?.regsBefore ?? null}
                    regs={display.regs}
                  />
                  <MemoryGrid
                    fetchCell={display.pc < 16 ? display.pc : -1}
                    mem={display.mem}
                    programRows={rows.length}
                    scratchCells={stage.scratchCells}
                    writtenCell={display.lastRow?.memWrite?.addr ?? null}
                  />
                </div>

                <BlockDiagram op={lastOp} />

                <TraceTable
                  cursor={effectiveCursor}
                  onScrub={(cycle) => {
                    setClock("paused");
                    setCursor(cycle);
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
                  disabled={submitting || rows.length === 0}
                  onClick={() => void onSubmit()}
                  type="button"
                >
                  {submitting ? "判定中…" : "提交判定"}
                </button>
                <span className="submit-note">
                  服务器会用带隐藏数据的用例判定——公开测试只是热身。
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
