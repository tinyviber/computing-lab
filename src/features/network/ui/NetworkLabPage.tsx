/**
 * Network lab page: stage rail, light canvas (undirected wiring +
 * inspector), and a packet-trace preview — pick a public probe (or
 * replay a hidden counterexample) and the send's hops step across the
 * topology, scrubbed row by row like the cpu lab's per-cycle view.
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
  NetCounterexample,
  NetDraft,
  NetJudgeResult,
  NetProjectPayload,
} from "../domain/protocol.ts";
import type { NetCase } from "../domain/scenario.ts";
import { runNetCase } from "../domain/scenario.ts";
import { DROP_TEXT, type MacTables, type SimRun } from "../domain/simulate.ts";
import { isNetStageUnlocked, type NetStageDef } from "../domain/stages.ts";
import {
  contractIssuesOf,
  createNetLessonState,
  draftOf,
  seedOf,
  stageOf,
  topologyOf,
  transitionNetLesson,
  type NetLessonAction,
} from "../lesson/state.ts";
import { publicNetCases } from "../lesson/publicCases.ts";
import { planFor } from "../domain/plan.ts";
import { NetworkCanvas } from "./NetworkCanvas.tsx";
import { NetworkInspector } from "./NetworkInspector.tsx";
import { NetStageRail } from "./NetStageRail.tsx";
import { NetTestPanel } from "./NetTestPanel.tsx";
import { PacketTrace } from "./PacketTrace.tsx";
import "./network.css";

/** The selected switch's MAC table "after `cursor` processed hops". */
function macTableAt(
  run: SimRun,
  initialTables: MacTables,
  nodeId: string,
  cursor: number,
): Record<string, string> | null {
  let table = initialTables[nodeId] ?? null;
  for (const row of run.trace) {
    if (row.step >= cursor) break;
    if (row.node === nodeId && row.after?.macTable) table = row.after.macTable;
  }
  return table;
}

function StageBrief({ stage }: { stage: NetStageDef }) {
  return (
    <section className="stage-brief">
      <p>{stage.description}</p>
      <p className="net-task">
        <strong>任务：</strong>
        {stage.task}
      </p>
      <p className="submit-note">判题方式：{stage.judgeNote}</p>
      <HintDisclosure hint={stage.hint} />
    </section>
  );
}

export function NetworkLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/network" });
  const { status, role, session } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionNetLesson, undefined, () =>
    createNetLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // The preview view: which public probe feeds the trace, and how far
  // through it the canvas sits. Derived data — never persisted.
  const [caseIndex, setCaseIndex] = useState(0);
  const [replayCase, setReplayCase] = useState<NetCase | null>(null);
  const [replayName, setReplayName] = useState("");
  const [cursor, setCursor] = useState(0);
  const [clock, setClock] = useState<"idle" | "running" | "paused">("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const stage = stageOf(state);
  const draft = draftOf(state);
  const topology = useMemo(() => topologyOf(state), [state.drafts, state.stageIndex]);
  const contractIssues = useMemo(() => contractIssuesOf(state), [state.drafts, state.stageIndex]);

  const userId = session?.user.id ?? "";

  const { loadError } = useLabProject<NetDraft, Record<string, never>, NetLessonAction>({
    classId,
    labId: "network",
    ready: status === "authenticated",
    toAction: (project: NetProjectPayload) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      userId,
    }),
    dispatch,
  });

  useAutosaveDraft<NetDraft>({
    classId,
    labId: "network",
    saveStatus: state.saveStatus,
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

  const plan = useMemo(
    () => (stage ? planFor(stage.index, seedOf(state, stage.index)).plan : null),
    [stage, state.userId],
  );
  const publicCases = useMemo(
    () => (stage && plan ? publicNetCases(stage.index, plan) : []),
    [stage, plan],
  );
  const previewCase =
    replayCase ?? publicCases[Math.min(caseIndex, Math.max(0, publicCases.length - 1))] ?? null;
  const preview = useMemo(
    () => (stage && previewCase ? runNetCase(topology, previewCase, stage.maxEvents) : null),
    [stage, previewCase, topology],
  );
  const run = preview?.run ?? null;
  const initialMacTables = useMemo(
    () => preview?.warmups[preview.warmups.length - 1]?.macTables ?? {},
    [preview],
  );
  const maxCursor = run ? run.trace.length + run.drops.length : 0;
  const effectiveCursor = Math.min(cursor, maxCursor);
  const outcome = run?.outcome ?? null;

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

  const onReplayCounterexample = useCallback((c: NetCounterexample) => {
    setReplayCase({ ...c.scenario, name: `隐藏反例 · ${c.name}` });
    setReplayName(`隐藏反例 · ${c.name}`);
    setCursor(0);
    setClock("idle");
  }, []);

  // ~2 Hz clock: each tick advances one processed row; canvas edits lock
  // while it runs so the topology can't change under a playing trace.
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
      const outcome = await api.post<NetJudgeResult>(`/api/classes/${classId}/labs/network/judge`, {
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
  const inspectorView = useMemo(
    () => ({
      macTable:
        selected && run ? macTableAt(run, initialMacTables, selected.id, effectiveCursor) : null,
    }),
    [selected, run, initialMacTables, effectiveCursor],
  );

  const wireEditable = stage?.editable.includes("wire") === true;

  return (
    <LabAccessGate
      classId={classId}
      hidden={catalog?.get("network")?.hidden === true}
      labName="网络寻径"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="net-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "网络寻径",
        }}
      >
        <div className="page-content net-layout">
          <NetStageRail
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            unlocked={(s) => isNetStageUnlocked(state.passedStages, s.index)}
          />

          <main aria-label="网络实验区" className="net-workspace">
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

            {contractIssues.length > 0 ? (
              <div className="net-issues" role="alert">
                结构问题：
                <ul>
                  {contractIssues.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {stage ? (
              <div className="net-edit-grid">
                <NetworkCanvas
                  cursor={effectiveCursor}
                  disabled={!editing}
                  onAddLink={(a, b) => dispatch({ type: "add-link", a, b })}
                  onRemoveLink={(link) => dispatch({ type: "remove-link", link })}
                  onSelect={setSelectedId}
                  run={run}
                  selectedId={selectedId}
                  stage={stage}
                  topology={topology}
                  wireEditable={wireEditable}
                />
                <NetworkInspector
                  disabled={!editing}
                  editable={stage.editable}
                  node={selected}
                  onAddRoute={(id) => dispatch({ type: "add-route", nodeId: id })}
                  onAddress={(id, iface, addr) =>
                    dispatch({ type: "set-address", nodeId: id, iface, address: addr })
                  }
                  onGateway={(id, gateway) =>
                    dispatch({ type: "set-gateway", nodeId: id, gateway })
                  }
                  onLabel={(id, label) => dispatch({ type: "set-node-label", nodeId: id, label })}
                  onRemoveRoute={(id, index) =>
                    dispatch({ type: "remove-route", nodeId: id, index })
                  }
                  onUpdateRoute={(id, index, patch) =>
                    dispatch({ type: "update-route", nodeId: id, index, patch })
                  }
                  view={inspectorView}
                />
              </div>
            ) : null}

            {stage && run ? (
              <section aria-label="探针回放" className="net-player">
                <div className="net-player-row">
                  <div className="net-player-buttons">
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
                  <label className="net-case-picker">
                    演示探针
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
                          {testCase.warmup?.length ? "（含预热）" : ""}
                        </option>
                      ))}
                      {replayCase ? <option value="replay">{replayName}</option> : null}
                    </select>
                  </label>
                  <span className="net-step-count">
                    第 {effectiveCursor} / {maxCursor} 步
                    {run.reason === "budget" ? " · 已超出事件预算" : ""}
                  </span>
                  {outcome ? (
                    <span
                      className={`net-outcome ${outcome.kind === "delivered" ? "is-ok" : "is-bad"}`}
                    >
                      {outcome.kind === "delivered"
                        ? `送达 ${outcome.path.join(" → ")}`
                        : `丢弃于 ${outcome.node}（${DROP_TEXT[outcome.reason]}）`}
                    </span>
                  ) : null}
                </div>

                <PacketTrace
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
                  className="button button-ghost"
                  onClick={() => dispatch({ type: "reset-draft" })}
                  type="button"
                >
                  重置本关
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
                  服务器会用带隐藏数据的探针判定——公开测试只是热身。
                </span>
              </div>
            ) : null}

            <NetTestPanel
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
