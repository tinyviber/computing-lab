/**
 * Greenhouse lab page: stage rail on the left; in the workspace the rule
 * table (or C1's setpoint slider), then the 试运行 preview — pick a public
 * case (or replay a hidden counterexample), run the day's ticks, scrub the
 * curve / actuator bands / event rows with one shared tick cursor.
 */

import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useLabCatalog } from "../../../shared/lab/labs";
import { StageRail } from "../../../shared/lab/StageRail";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
// Cross-feature reuse per issue #58 §6 — do not lift to shared until a third
// consumer appears. The hint annotator just renders plain text here.
import { HintDisclosure } from "../../calculator/ui/HintDisclosure";
import { SENSOR_IDS, SENSOR_LABEL, type SensorId } from "../domain/model.ts";
import {
  SETPOINT_DEFAULT,
  SETPOINT_MAX,
  SETPOINT_MIN,
  clampSetpoint,
  rowText,
  setpointRules,
} from "../domain/rules.ts";
import type {
  GhCase,
  GhCounterexample,
  GhDraft,
  GhJudgeResult,
  GhProjectPayload,
} from "../domain/protocol.ts";
import {
  GREENHOUSE_CORE_STAGES,
  greenhouseStageUnlocked,
  type GhStageDef,
} from "../domain/stages.ts";
import { createGhLabState, draftOf, stageOf, transitionGhLab } from "../lesson/state.ts";
import { rulesForStage } from "../lesson/scenario.ts";
import { publicCasesFor } from "../lesson/publicCases.ts";
import { ActuatorTimeline } from "./ActuatorTimeline.tsx";
import { EnvChart } from "./EnvChart.tsx";
import { EventTable } from "./EventTable.tsx";
import { GreenhouseTestPanel } from "./GreenhouseTestPanel.tsx";
import { LoopDiagram } from "./LoopDiagram.tsx";
import { RuleTableEditor } from "./RuleTableEditor.tsx";
import "./greenhouse.css";

function StageBrief({ stage }: { stage: GhStageDef }) {
  return (
    <section className="stage-brief">
      <p>{stage.description}</p>
      <p className="gh-task">
        <strong>任务：</strong>
        {stage.task}
      </p>
      <p className="submit-note">判题方式：{stage.judgeNote}</p>
      <HintDisclosure hint={stage.hint} />
      {stage.takeaway ? (
        <p className="gh-takeaway">
          <strong>这一关想让你带走：</strong>
          {stage.takeaway}
        </p>
      ) : null}
    </section>
  );
}

const SPEEDS = [
  { label: "慢速", ms: 500 },
  { label: "中速", ms: 200 },
  { label: "快速", ms: 80 },
];

export function GreenhouseLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/greenhouse" });
  const { status, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionGhLab, undefined, () => createGhLabState(1));
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Preview view state: which case feeds the sim and how far the shared
  // tick cursor has scrubbed. Derived data — never persisted.
  const [caseIndex, setCaseIndex] = useState(0);
  const [replayCase, setReplayCase] = useState<GhCase | null>(null);
  const [cursor, setCursor] = useState(0);
  const [clock, setClock] = useState<"idle" | "running" | "paused">("idle");
  const [speed, setSpeed] = useState(1);
  const [chartVar, setChartVar] = useState<SensorId>("airTemp");

  const stage = stageOf(state);
  const draft = draftOf(state);
  const rules = useMemo(() => (stage ? rulesForStage(draft, stage) : []), [stage, draft]);

  const { loadError } = useLabProject<
    GhDraft,
    Record<string, never>,
    Parameters<typeof dispatch>[0]
  >({
    classId,
    labId: "greenhouse",
    ready: status === "authenticated",
    toAction: (project: GhProjectPayload) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
    }),
    dispatch,
  });

  useAutosaveDraft<GhDraft>({
    classId,
    labId: "greenhouse",
    saveStatus: state.saveStatus,
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

  const publicCases = useMemo(() => (stage ? publicCasesFor(stage.index) : []), [stage]);
  const previewCase =
    replayCase ?? publicCases[Math.min(caseIndex, Math.max(0, publicCases.length - 1))] ?? null;

  const outcome = state.runOutcome;
  const run = outcome?.run ?? null;
  const maxCursor = Math.max(0, (run?.trace.length ?? 1) - 1);
  const effectiveCursor = Math.min(cursor, maxCursor);

  // A changed draft or a switched case greys the old curve until re-run.
  const draftDirty = outcome !== null && JSON.stringify(draft) !== outcome.draftJson;
  const caseDirty =
    outcome !== null && previewCase !== null && outcome.caseName !== previewCase.name;
  const stale = draftDirty || caseDirty;

  useEffect(() => {
    setCaseIndex(0);
    setReplayCase(null);
    setCursor(0);
    setClock("idle");
    setChartVar("airTemp");
  }, [state.stageIndex]);

  const onRunPreview = useCallback(
    (testCase: GhCase) => {
      dispatch({ type: "run-preview", testCase });
      setCursor(Math.max(0, testCase.ticks - 1));
      setClock("idle");
    },
    [dispatch],
  );

  const onReplayCounterexample = useCallback(
    (c: GhCounterexample) => {
      const scenario = { ...c.scenario, name: `隐藏反例 · ${c.name}` };
      setReplayCase(scenario);
      setCursor(c.firstViolation.tick);
      setClock("idle");
      onRunPreview(scenario);
    },
    [onRunPreview],
  );

  const canStep = run !== null && effectiveCursor < maxCursor;
  useEffect(() => {
    if (clock !== "running") return;
    if (!canStep) {
      setClock("idle");
      return;
    }
    const timer = setInterval(() => {
      setCursor((c) => Math.min(c + 1, maxCursor));
    }, SPEEDS[speed].ms);
    return () => clearInterval(timer);
  }, [clock, canStep, maxCursor, speed]);
  useEffect(() => {
    if (clock === "running" && effectiveCursor >= maxCursor) setClock("idle");
  }, [clock, effectiveCursor, maxCursor]);

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await api.post<GhJudgeResult>(
        `/api/classes/${classId}/labs/greenhouse/judge`,
        {
          stageIndex: stage.index,
          draft,
        },
      );
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, draft]);

  const previewRead = run
    ? (run.trace[effectiveCursor]?.read ?? run.initEnv)
    : previewCase
      ? {
          airTemp: previewCase.initEnv?.airTemp ?? 220,
          soilMoisture: previewCase.initEnv?.soilMoisture ?? 400,
          light: previewCase.initEnv?.light ?? 0,
        }
      : null;

  const chartVars = useMemo(() => {
    if (!run) return ["airTemp" as SensorId];
    return SENSOR_IDS.filter((v) => {
      const vals = run.trace.map((r) => r.env[v]);
      return (
        Math.min(...vals) !== Math.max(...vals) || run.trace.some((r) => r.amb[v] !== r.env[v])
      );
    });
  }, [run]);
  const activeChartVar = chartVars.includes(chartVar) ? chartVar : (chartVars[0] ?? "airTemp");
  const band = previewCase?.expect.inBand?.[activeChartVar] ?? null;

  return (
    <LabAccessGate
      adminPreview
      classId={classId}
      hidden={catalog?.get("greenhouse")?.hidden === true}
      labName="智慧大棚"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="gh-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "智慧大棚",
        }}
      >
        <div className="page-content gh-layout">
          <StageRail
            label="智慧大棚"
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            stages={GREENHOUSE_CORE_STAGES}
            unlocked={(s) => greenhouseStageUnlocked(state.passedStages, s.index)}
          />

          <main aria-label="智慧大棚实验区" className="gh-workspace">
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

            {stage?.control === "setpoint" ? (
              <section aria-label="设定值" className="gh-panel">
                <label className="gh-setpoint">
                  目标温度
                  <input
                    max={SETPOINT_MAX}
                    min={SETPOINT_MIN}
                    onChange={(e) =>
                      dispatch({ type: "set-setpoint", setpoint: Number(e.target.value) })
                    }
                    step={1}
                    type="range"
                    value={clampSetpoint(draft.setpoint ?? SETPOINT_DEFAULT)}
                  />
                  <strong>{clampSetpoint(draft.setpoint ?? SETPOINT_DEFAULT)}°C</strong>
                </label>
                <div className="gh-builtin">
                  <p className="gh-panel-note">内置控制器（只读，下一关换你写）：</p>
                  <ul className="gh-rule-echo">
                    {setpointRules(clampSetpoint(draft.setpoint ?? SETPOINT_DEFAULT)).map(
                      (r, i) => (
                        <li key={i}>
                          {i + 1}. {rowText(r)}
                        </li>
                      ),
                    )}
                    <li className="gh-rule-fallthrough">否则：执行器保持原状</li>
                  </ul>
                </div>
              </section>
            ) : stage ? (
              <section aria-label="规则表" className="gh-panel">
                <RuleTableEditor
                  actuators={stage.actuators}
                  maxRules={stage.maxRules}
                  onChange={(r) => dispatch({ type: "set-rules", rules: r })}
                  previewRead={previewRead}
                  rules={draft.rules ?? []}
                  sensors={stage.sensors}
                />
                <button
                  className="button button-ghost gh-reset"
                  onClick={() => dispatch({ type: "reset-draft" })}
                  type="button"
                >
                  重置草稿
                </button>
              </section>
            ) : null}

            {stage ? (
              <section aria-label="场景回放" className={`gh-player${stale ? " is-stale" : ""}`}>
                <div className="gh-player-row">
                  <label className="gh-case-picker">
                    演示场景
                    <select
                      onChange={(e) => {
                        if (e.target.value === "replay") return;
                        setReplayCase(null);
                        setCaseIndex(Number(e.target.value));
                      }}
                      value={
                        replayCase
                          ? "replay"
                          : Math.min(caseIndex, Math.max(0, publicCases.length - 1))
                      }
                    >
                      {publicCases.map((c, i) => (
                        <option key={c.name} value={i}>
                          {c.name}
                        </option>
                      ))}
                      {replayCase ? <option value="replay">{replayCase.name}</option> : null}
                    </select>
                  </label>
                  <button
                    className="button button-secondary"
                    disabled={!previewCase}
                    onClick={() => previewCase && onRunPreview(previewCase)}
                    type="button"
                  >
                    试运行（本地不判分）
                  </button>
                  <div className="gh-player-buttons">
                    <button
                      className="button button-secondary"
                      disabled={!run || effectiveCursor <= 0}
                      onClick={() => {
                        setClock("paused");
                        setCursor((c) => Math.max(0, c - 1));
                      }}
                      type="button"
                    >
                      ◀ 上一拍
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={!canStep}
                      onClick={() => {
                        setClock("paused");
                        setCursor((c) => Math.min(c + 1, maxCursor));
                      }}
                      type="button"
                    >
                      下一拍 ▶
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
                      disabled={!run}
                      onClick={() => {
                        setClock("idle");
                        setCursor(0);
                      }}
                      type="button"
                    >
                      复位
                    </button>
                  </div>
                  <label className="gh-speed">
                    速度
                    <select onChange={(e) => setSpeed(Number(e.target.value))} value={speed}>
                      {SPEEDS.map((s, i) => (
                        <option key={s.label} value={i}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="gh-step-count">
                    {run ? `第 ${effectiveCursor} / ${maxCursor} 拍` : "先点「试运行」生成曲线"}
                  </span>
                </div>
                {stale ? (
                  <p className="gh-stale-note" role="status">
                    {draftDirty ? "参数已改需重跑" : "场景已切换需重跑"}
                    ——旧曲线变灰，不代表当前规则。
                  </p>
                ) : null}

                {run ? (
                  <div className="gh-viz">
                    <LoopDiagram cursor={effectiveCursor} rules={rules} run={run} />
                    <div className="gh-chart-tabs" role="tablist">
                      {chartVars.map((v) => (
                        <button
                          aria-selected={v === activeChartVar}
                          className={v === activeChartVar ? "is-active" : ""}
                          key={v}
                          onClick={() => setChartVar(v)}
                          role="tab"
                          type="button"
                        >
                          {SENSOR_LABEL[v]}
                        </button>
                      ))}
                    </div>
                    <EnvChart
                      band={band}
                      cursor={effectiveCursor}
                      onScrub={(t) => {
                        setClock("paused");
                        setCursor(t);
                      }}
                      run={run}
                      sensor={activeChartVar}
                    />
                    <ActuatorTimeline
                      actuators={stage.actuators}
                      cursor={effectiveCursor}
                      onScrub={(t) => {
                        setClock("paused");
                        setCursor(t);
                      }}
                      run={run}
                    />
                    <EventTable
                      cursor={effectiveCursor}
                      onSeek={(t) => {
                        setClock("paused");
                        setCursor(t);
                      }}
                      rules={rules}
                      run={run}
                      sensors={stage.sensors}
                    />
                  </div>
                ) : null}
              </section>
            ) : null}

            {stage ? (
              <div className="submit-row">
                <button
                  className="button button-primary"
                  disabled={submitting}
                  onClick={() => void onSubmit()}
                  type="button"
                >
                  {submitting ? "判定中…" : "提交判分（服务端复核）"}
                </button>
                <span className="submit-note">
                  服务端用带隐藏天气的场景复核——试运行只是本地热身。
                </span>
              </div>
            ) : null}

            <GreenhouseTestPanel
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
