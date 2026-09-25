/**
 * Is-sim lab page: stage rail, light canvas (palette + wiring +
 * inspector), and a scenario preview — pick a public case (or replay a
 * hidden counterexample) and the whole trace steps across the wiring,
 * scrubbed row by row like the cpu lab's per-cycle view.
 */

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
// consumer appears. The hint annotator just renders plain text here.
import { HintDisclosure } from "../../calculator/ui/HintDisclosure";
import type {
  IsDraft,
  IsJudgeResult,
  IsProjectPayload,
  IsCounterexample,
} from "../domain/protocol.ts";
import { seedFor } from "../domain/rng.ts";
import type { IsCase } from "../domain/scenario.ts";
import { isSimStageUnlocked, type IsStageDef } from "../domain/stages.ts";
import type { DeviceView, SimRun } from "../domain/sim.ts";
import {
  createIsLessonState,
  draftOf,
  stageOf,
  topologyOf,
  transitionIsLesson,
  type IsLessonAction,
} from "../lesson/state.ts";
import { publicCasesFor } from "../lesson/publicCases.ts";
import { runScenario } from "../domain/sim.ts";
import { DeviceInspector } from "./DeviceInspector.tsx";
import { EventTimeline } from "./EventTimeline.tsx";
import { IsStageRail } from "./IsStageRail.tsx";
import { IsTestPanel } from "./IsTestPanel.tsx";
import { TopologyCanvas } from "./TopologyCanvas.tsx";
import "./is-sim.css";

/** Device views "after `cursor` steps processed" — each row carries its after snapshot. */
function viewsAt(run: SimRun, cursor: number): Record<string, DeviceView> {
  const views: Record<string, DeviceView> = { ...run.initialDevices };
  for (const row of run.trace) {
    if (row.step >= cursor) break;
    if (row.after) views[row.node] = row.after;
  }
  return views;
}

function StageBrief({ stage }: { stage: IsStageDef }) {
  return (
    <section className="stage-brief">
      <p>{stage.description}</p>
      <p className="is-task">
        <strong>任务：</strong>
        {stage.task}
      </p>
      <p className="submit-note">判题方式：{stage.judgeNote}</p>
      <HintDisclosure hint={stage.hint} />
    </section>
  );
}

export function IsLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/is-sim" });
  const { status, role, session } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionIsLesson, undefined, () => createIsLessonState(1));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The preview view: which public case feeds the timeline, and how far
  // through its trace the device panels sit. Derived data — never persisted.
  const [caseIndex, setCaseIndex] = useState(0);
  const [replayCase, setReplayCase] = useState<IsCase | null>(null);
  const [replayName, setReplayName] = useState("");
  const [cursor, setCursor] = useState(0);
  const [clock, setClock] = useState<"idle" | "running" | "paused">("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stage = stageOf(state);
  const draft = draftOf(state);
  const topology = useMemo(() => topologyOf(state), [state.drafts, state.stageIndex]);

  const { loadError } = useLabProject<IsDraft, Record<string, never>, IsLessonAction>({
    classId,
    labId: "is-sim",
    ready: status === "authenticated",
    toAction: (project: IsProjectPayload) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
    }),
    dispatch,
  });

  useAutosaveDraft<IsDraft>({
    classId,
    labId: "is-sim",
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
    () => (stage ? publicCasesFor(stage.index, seedFor(userId, "is-sim", stage.index)) : []),
    [stage, userId],
  );
  const previewCase =
    replayCase ?? publicCases[Math.min(caseIndex, Math.max(0, publicCases.length - 1))] ?? null;
  const run = useMemo(
    () => (stage && previewCase ? runScenario(topology, previewCase, stage.maxEvents) : null),
    [stage, previewCase, topology],
  );
  const maxCursor = run?.eventsUsed ?? 0;
  const effectiveCursor = Math.min(cursor, maxCursor);
  const views = useMemo(() => (run ? viewsAt(run, effectiveCursor) : null), [run, effectiveCursor]);

  // A stage or case switch restarts the playback.
  useEffect(() => {
    setCaseIndex(0);
    setReplayCase(null);
    setCursor(0);
    setClock("idle");
    setSelectedId(null);
  }, [state.stageIndex]);
  useEffect(() => {
    setCursor(0);
    setClock("idle");
  }, [caseIndex, replayCase]);

  const onReplayCounterexample = useCallback((c: IsCounterexample) => {
    setReplayCase({ ...c.scenario, name: `隐藏反例 · ${c.name}` });
    setReplayName(`隐藏反例 · ${c.name}`);
    setCursor(0);
    setClock("idle");
  }, []);

  // ~2 Hz clock: each tick advances one processed step; canvas edits lock
  // while it runs so the wiring can't change under a playing trace.
  const canStep = run !== null && effectiveCursor < maxCursor;
  useEffect(() => {
    if (clock !== "running") return;
    if (!canStep) {
      setClock("idle");
      return;
    }
    const timer = setInterval(() => {
      setCursor((c) => Math.min(c + 1, maxCursor));
    }, 500);
    return () => clearInterval(timer);
  }, [clock, canStep, maxCursor]);
  useEffect(() => {
    if (clock === "running" && effectiveCursor >= maxCursor) setClock("idle");
  }, [clock, effectiveCursor, maxCursor]);

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await api.post<IsJudgeResult>(`/api/classes/${classId}/labs/is-sim/judge`, {
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

  const editing = clock !== "running";
  const selected = selectedId ? (topology.nodes.find((n) => n.id === selectedId) ?? null) : null;

  return (
    <LabAccessGate
      classId={classId}
      hidden={catalog?.get("is-sim")?.hidden === true}
      labName="小型信息系统"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="is-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "小型信息系统",
        }}
      >
        <div className="page-content is-layout">
          <IsStageRail
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            unlocked={(s) => isSimStageUnlocked(state.passedStages, s.index)}
          />

          <main aria-label="信息系统实验区" className="is-workspace">
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
              <div className="is-edit-grid">
                <TopologyCanvas
                  disabled={!editing}
                  onAddLink={(link) => dispatch({ type: "add-link", link })}
                  onAddNode={(kind) => dispatch({ type: "add-node", kind })}
                  onRemoveLink={(link) => dispatch({ type: "remove-link", link })}
                  onSelect={setSelectedId}
                  selectedId={selectedId}
                  stage={stage}
                  topology={topology}
                  views={views}
                />
                <DeviceInspector
                  disabled={!editing}
                  node={selected}
                  onLabel={(id, label) => dispatch({ type: "set-node-label", nodeId: id, label })}
                  onParam={(id, key, value) =>
                    dispatch({ type: "set-node-param", nodeId: id, key, value })
                  }
                  onRemove={(id) => dispatch({ type: "remove-node", nodeId: id })}
                />
              </div>
            ) : null}

            {stage && run ? (
              <section aria-label="场景回放" className="is-player">
                <div className="is-player-row">
                  <div className="is-player-buttons">
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
                  <label className="is-case-picker">
                    演示场景
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
                      {replayCase ? <option value="replay">{replayName}</option> : null}
                    </select>
                  </label>
                  <span className="is-step-count">
                    第 {effectiveCursor} / {maxCursor} 步
                    {run.reason === "budget" ? " · 已超出事件预算" : ""}
                  </span>
                </div>

                <EventTimeline
                  cursor={effectiveCursor - 1}
                  onScrub={(step) => {
                    setClock("paused");
                    setCursor(step + 1);
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
                  disabled={submitting}
                  onClick={() => void onSubmit()}
                  type="button"
                >
                  {submitting ? "判定中…" : "提交判定"}
                </button>
                <span className="submit-note">
                  服务器会用带隐藏数据的场景判定——公开测试只是热身。
                </span>
              </div>
            ) : null}

            <IsTestPanel
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
