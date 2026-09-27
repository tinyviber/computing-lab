/**
 * 网络模拟器 lab page: stage rail + topology canvas + device inspector +
 * probe console + packet trace + device tables + test panel. Students
 * never wire nodes in MVP — topology is fixed per stage; the editable
 * surface is addressing / gateway / route rows per the stage contract.
 */

import { useParams } from "@tanstack/react-router";
import { useCallback, useMemo, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useLabCatalog } from "../../../shared/lab/labs";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import { HintDisclosure } from "../../calculator/ui/HintDisclosure";
import type { NetCounterexample, NetJudgeResult, NetProjectPayload } from "../domain/protocol.ts";
import { seedFor } from "../domain/rng.ts";
import { runCase, runCases, type NetCaseResult } from "../domain/scenario.ts";
import type { SimStep } from "../domain/simulate.ts";
import { NET_LAB_ID } from "../domain/topology.ts";
import type { NetDraft } from "../domain/topology.ts";
import {
  draftOf,
  initialNetLesson,
  isNetStageUnlocked,
  stageOf,
  topologyOf,
  transitionNetLesson,
  type NetAction,
} from "../lesson/state.ts";
import { netRequiredMap, type NetStageDef } from "../domain/stages.ts";
import { publicNetCases } from "../lesson/publicCases.ts";
import { DeviceTables } from "./DeviceTables.tsx";
import { NetDeviceInspector } from "./DeviceInspector.tsx";
import { NetStageRail } from "./NetStageRail.tsx";
import { NetTestPanel } from "./NetTestPanel.tsx";
import { NetworkCanvas } from "./NetworkCanvas.tsx";
import { PacketTrace } from "./PacketTrace.tsx";
import { ProbeConsole } from "./ProbeConsole.tsx";
import "./network.css";

function StageBrief({ stage }: { stage: NetStageDef }) {
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

export function NetworkLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/network-sim" });
  const { status, role, session } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const userId = session?.user.id ?? "";
  const [state, dispatch] = useReducer(transitionNetLesson, userId, initialNetLesson);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const stage = stageOf(state);
  const topology = useMemo(() => topologyOf(state), [state.drafts, state.stageIndex]);
  const required = useMemo(
    () => netRequiredMap(stage, seedFor(userId, NET_LAB_ID, stage.index)),
    [stage, userId],
  );

  const { loadError } = useLabProject<NetDraft, Record<string, never>, NetAction>({
    classId,
    labId: NET_LAB_ID,
    ready: status === "authenticated",
    toAction: (project: NetProjectPayload) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: project.drafts ?? {},
    }),
    dispatch,
  });

  useAutosaveDraft<NetDraft>({
    classId,
    labId: NET_LAB_ID,
    saveStatus: state.saveStatus,
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

  const publicCases = useMemo(
    () => publicNetCases(stage.index, seedFor(userId, NET_LAB_ID, stage.index)),
    [stage, userId],
  );

  const onSendProbe = useCallback(
    (src: string, dst: string) => dispatch({ type: "send-probe", src, dst }),
    [],
  );

  const onRunPublic = useCallback(() => {
    const results = runCases(topology, publicCases);
    dispatch({ type: "run-public-tests", results });
  }, [topology, publicCases]);

  const onShowCase = useCallback((title: string, result: NetCaseResult) => {
    const steps = result.probes.flatMap((p) => p.trace);
    dispatch({ type: "show-case", title, steps });
  }, []);

  const onReplayCounterexample = useCallback(
    (c: NetCounterexample) => {
      const result = runCase(topology, c.netCase);
      const steps = result.probes.flatMap((p) => p.trace);
      dispatch({ type: "show-case", title: `隐藏反例 · ${c.name}`, steps });
    },
    [topology],
  );

  const onSubmit = useCallback(async () => {
    if (!classId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await api.post<NetJudgeResult>(
        `/api/classes/${classId}/labs/${NET_LAB_ID}/judge`,
        { stageIndex: stage.index, draft: topology },
      );
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, topology]);

  const selected = state.selectedNodeId
    ? (topology.nodes.find((n) => n.id === state.selectedNodeId) ?? null)
    : null;
  const hosts = topology.nodes.filter((n) => n.kind === "host");
  const macsAtCursor = useMemo(() => {
    if (!state.activeTrace) {
      const out: Record<string, Record<string, string>> = {};
      for (const [sw, table] of state.manualMacs.macs) out[sw] = Object.fromEntries(table);
      return out;
    }
    let out: Record<string, Record<string, string>> = {};
    for (const step of state.activeTrace.steps) {
      if (step.seq > state.cursor) break;
      if (step.macsAfter) out = step.macsAfter;
    }
    return out;
  }, [state.activeTrace, state.cursor, state.manualMacs]);

  const macCount = [...state.manualMacs.macs.values()].reduce((n, t) => n + t.size, 0);
  const traceSteps: SimStep[] = state.activeTrace?.steps ?? [];

  return (
    <LabAccessGate
      adminPreview
      classId={classId}
      hidden={catalog?.get(NET_LAB_ID)?.hidden === true}
      labName="网络模拟器"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="net-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage.englishTitle,
          title: `${String(stage.index).padStart(2, "0")} ${stage.title}`,
        }}
      >
        <div className="page-content net-layout">
          <NetStageRail
            onSelect={(index) => dispatch({ type: "select-stage", index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            unlocked={(index) => isNetStageUnlocked(state, index)}
          />

          <main aria-label="网络模拟实验区" className="net-workspace">
            <StageBrief stage={stage} />

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

            <div className="net-edit-grid">
              <NetworkCanvas
                cursor={state.cursor}
                net={topology}
                onSelect={(id) => dispatch({ type: "select-node", nodeId: id })}
                required={required}
                selectedId={state.selectedNodeId}
                trace={state.activeTrace?.steps ?? null}
              />
              <NetDeviceInspector
                edit={stage.edit}
                node={selected}
                onAddRoute={(id) => dispatch({ type: "add-route", nodeId: id })}
                onGateway={(id, v) => dispatch({ type: "set-gateway", nodeId: id, value: v })}
                onPort={(id, pid, field, v) =>
                  dispatch({ type: "set-port", nodeId: id, portId: pid, field, value: v })
                }
                onRemoveRoute={(id, row) => dispatch({ type: "remove-route", nodeId: id, row })}
                onSetRoute={(id, row, field, v) =>
                  dispatch({ type: "set-route", nodeId: id, row, field, value: v })
                }
                required={required}
              />
            </div>

            <ProbeConsole
              hosts={hosts}
              log={state.probeLog}
              macCount={macCount}
              onResetMacs={() => dispatch({ type: "reset-macs" })}
              onSend={onSendProbe}
            />

            <PacketTrace
              cursor={state.cursor}
              onCursor={(seq) => dispatch({ type: "set-cursor", seq })}
              onPlaying={(playing) => dispatch({ type: "set-playing", playing })}
              playing={state.playing}
              steps={traceSteps}
              title={state.activeTrace?.title ?? null}
            />

            <DeviceTables macsAtCursor={macsAtCursor} net={topology} selected={selected} />

            <div className="net-submit-row">
              <button className="button button-ghost" onClick={onRunPublic} type="button">
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
            </div>

            <NetTestPanel
              judgeOutcome={state.judgeOutcome}
              onReplayCounterexample={onReplayCounterexample}
              onShowCase={onShowCase}
              runOutcome={state.runOutcome}
            />
          </main>
        </div>
      </AppPageLayout>
    </LabAccessGate>
  );
}
