/**
 * Reducer for the network lab page. Beyond the usual draft/save/judge
 * bookkeeping it keeps two lab-specific pieces of state:
 *
 *   - `manualMacs`: MAC tables accumulated across the student's manual
 *     probes, so "send the same ping twice" really shows flood→unicast.
 *     Any draft edit resets them — the addresses the table learned may
 *     no longer be the ones on the wire.
 *   - `activeTrace`: the probe trace currently displayed in the packet
 *     table, either from a manual send or a replayed public/hidden case.
 */

import type { SaveStatus } from "../../../shared/api/client.ts";
import type { NetJudgeResult } from "../domain/protocol.ts";
import { runCase, type NetCaseResult } from "../domain/scenario.ts";
import {
  freshSimState,
  runProbe,
  type ProbeResult,
  type SimState,
  type SimStep,
} from "../domain/simulate.ts";
import { getNetStage, netPrefill, netStageUnlocked, type NetStageDef } from "../domain/stages.ts";
import { seedFor } from "../domain/rng.ts";
import { NET_LAB_ID, sanitizeTopology, type NetTopology } from "../domain/topology.ts";

export type NetProbeLogEntry = {
  id: number;
  src: string;
  dst: string;
  summary: string;
  ok: boolean;
};

export type NetLessonState = {
  userId: string;
  stageIndex: number;
  drafts: Record<number, NetTopology>;
  currentStage: number;
  passedStages: number[];
  selectedNodeId: string | null;
  runOutcome: { score: number; total: number; results: NetCaseResult[] } | null;
  judgeOutcome: NetJudgeResult | null;
  activeTrace: { title: string; steps: SimStep[] } | null;
  manualMacs: SimState;
  probeLog: NetProbeLogEntry[];
  cursor: number;
  playing: boolean;
  saveStatus: SaveStatus;
  dirty: boolean;
  message: string | null;
};

export type NetAction =
  | {
      type: "load-project";
      drafts: Record<number, NetTopology>;
      currentStage: number;
      passedStages: number[];
    }
  | { type: "select-stage"; index: number }
  | { type: "select-node"; nodeId: string | null }
  | { type: "set-port"; nodeId: string; portId: string; field: "ip" | "mask"; value: string }
  | { type: "set-gateway"; nodeId: string; value: string }
  | { type: "add-route"; nodeId: string }
  | { type: "set-route"; nodeId: string; row: number; field: "prefix" | "nextHop"; value: string }
  | { type: "remove-route"; nodeId: string; row: number }
  | { type: "reset-draft" }
  | { type: "send-probe"; src: string; dst: string }
  | { type: "reset-macs" }
  | { type: "set-cursor"; seq: number }
  | { type: "set-playing"; playing: boolean }
  | { type: "run-public-tests"; results: NetCaseResult[] }
  | { type: "show-case"; title: string; steps: SimStep[] }
  | { type: "judge-result"; outcome: NetJudgeResult }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "message"; text: string }
  | { type: "dismiss-message" };

function cloneMacs(macs: SimState["macs"]): SimState["macs"] {
  return new Map([...macs.entries()].map(([k, v]) => [k, new Map(v)]));
}

export function initialNetLesson(userId: string): NetLessonState {
  const seed = seedFor(userId, NET_LAB_ID, 1);
  return {
    userId,
    stageIndex: 1,
    drafts: { 1: netPrefill(getNetStage(1)!, seed) },
    currentStage: 1,
    passedStages: [],
    selectedNodeId: null,
    runOutcome: null,
    judgeOutcome: null,
    activeTrace: null,
    manualMacs: { macs: new Map() },
    probeLog: [],
    cursor: 0,
    playing: false,
    saveStatus: "idle",
    dirty: false,
    message: null,
  };
}

export function stageOf(state: NetLessonState): NetStageDef {
  return getNetStage(state.stageIndex) ?? getNetStage(1)!;
}

export function seedForStage(state: NetLessonState, index: number): number {
  return seedFor(state.userId, NET_LAB_ID, index);
}

export function draftOf(state: NetLessonState, index: number): NetTopology {
  const existing = state.drafts[index];
  if (existing) return existing;
  return netPrefill(getNetStage(index)!, seedForStage(state, index));
}

export function topologyOf(state: NetLessonState): NetTopology {
  return draftOf(state, state.stageIndex);
}

export function isNetStageUnlocked(state: NetLessonState, index: number): boolean {
  const stage = getNetStage(index);
  if (!stage) return false;
  return netStageUnlocked(stage, state.passedStages);
}

/** Draft edits reset the learned MAC tables — the wires may now lie about old entries. */
function withDraft(state: NetLessonState, index: number, draft: NetTopology): NetLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [index]: draft },
    dirty: true,
    saveStatus: "dirty",
    runOutcome: null,
    judgeOutcome: null,
    manualMacs: freshSimState(draft),
    activeTrace: null,
    probeLog: [],
    cursor: 0,
    playing: false,
  };
}

function probeSummary(result: ProbeResult): { summary: string; ok: boolean } {
  const req = result.request;
  if (req.delivered) {
    const hops = req.path.length - 1;
    const reply = result.reply;
    if (reply && !reply.delivered) {
      return { summary: `去程 ${hops} 跳送达，回程在 ${reply.droppedAt || "?"} 被丢`, ok: false };
    }
    return { summary: `${req.path.join("→")}，${hops} 跳送达`, ok: true };
  }
  return { summary: `在 ${req.droppedAt || "链路"} 被丢弃`, ok: false };
}

export function transitionNetLesson(state: NetLessonState, action: NetAction): NetLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, NetTopology> = {};
      for (const [k, v] of Object.entries(action.drafts)) {
        const idx = Number(k);
        if (getNetStage(idx)) drafts[idx] = sanitizeTopology(v);
      }
      const probe = { ...state, passedStages: action.passedStages };
      const stageIndex = isNetStageUnlocked(probe, action.currentStage) ? action.currentStage : 1;
      const next: NetLessonState = {
        ...state,
        drafts,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        stageIndex,
      };
      if (!drafts[stageIndex]) {
        next.drafts[stageIndex] = netPrefill(
          getNetStage(stageIndex)!,
          seedForStage(next, stageIndex),
        );
      }
      return { ...next, manualMacs: freshSimState(topologyOf(next)) };
    }
    case "select-stage": {
      if (!isNetStageUnlocked(state, action.index)) return state;
      const drafts = { ...state.drafts };
      if (!drafts[action.index]) {
        drafts[action.index] = netPrefill(
          getNetStage(action.index)!,
          seedForStage(state, action.index),
        );
      }
      const next: NetLessonState = {
        ...state,
        stageIndex: action.index,
        drafts,
        selectedNodeId: null,
        runOutcome: null,
        judgeOutcome: null,
        activeTrace: null,
        probeLog: [],
        cursor: 0,
        playing: false,
        message: null,
      };
      return { ...next, manualMacs: freshSimState(topologyOf(next)) };
    }
    case "select-node":
      return { ...state, selectedNodeId: action.nodeId };
    case "set-port": {
      const stage = stageOf(state);
      if (!stage.edit.address) return state;
      const topo = topologyOf(state);
      const nodes = topo.nodes.map((n) => {
        if (n.id !== action.nodeId) return n;
        return {
          ...n,
          ports: n.ports.map((p) => {
            if (p.id !== action.portId) return p;
            const next = { ...p };
            if (action.value.trim() === "") delete next[action.field];
            else next[action.field] = action.value;
            return next;
          }),
        };
      });
      return withDraft(state, state.stageIndex, { nodes, links: topo.links });
    }
    case "set-gateway": {
      const stage = stageOf(state);
      if (!stage.edit.gateway) return state;
      const topo = topologyOf(state);
      const nodes = topo.nodes.map((n) => {
        if (n.id !== action.nodeId) return n;
        const next = { ...n };
        if (action.value.trim() === "") delete next.gateway;
        else next.gateway = action.value;
        return next;
      });
      return withDraft(state, state.stageIndex, { nodes, links: topo.links });
    }
    case "add-route": {
      const stage = stageOf(state);
      if (!stage.edit.routes) return state;
      const topo = topologyOf(state);
      const nodes = topo.nodes.map((n) => {
        if (n.id !== action.nodeId || n.kind !== "router") return n;
        const routes = [...(n.routes ?? []), { prefix: "", nextHop: "" }];
        return { ...n, routes };
      });
      return withDraft(state, state.stageIndex, { nodes, links: topo.links });
    }
    case "set-route": {
      const stage = stageOf(state);
      if (!stage.edit.routes) return state;
      const topo = topologyOf(state);
      const nodes = topo.nodes.map((n) => {
        if (n.id !== action.nodeId || !n.routes) return n;
        const routes = n.routes.map((r, i) =>
          i === action.row ? { ...r, [action.field]: action.value } : r,
        );
        return { ...n, routes };
      });
      return withDraft(state, state.stageIndex, { nodes, links: topo.links });
    }
    case "remove-route": {
      const stage = stageOf(state);
      if (!stage.edit.routes) return state;
      const topo = topologyOf(state);
      const nodes = topo.nodes.map((n) => {
        if (n.id !== action.nodeId || !n.routes) return n;
        return { ...n, routes: n.routes.filter((_, i) => i !== action.row) };
      });
      return withDraft(state, state.stageIndex, { nodes, links: topo.links });
    }
    case "reset-draft": {
      const draft = netPrefill(stageOf(state), seedForStage(state, state.stageIndex));
      return withDraft(state, state.stageIndex, draft);
    }
    case "send-probe": {
      const topo = topologyOf(state);
      const macs = cloneMacs(state.manualMacs.macs);
      const simState: SimState = { macs };
      const result = runProbe(topo, simState, action.src, action.dst);
      const { summary, ok } = probeSummary(result);
      const id = (state.probeLog[state.probeLog.length - 1]?.id ?? 0) + 1;
      return {
        ...state,
        manualMacs: simState,
        activeTrace: {
          title: `探针 ${action.src.toUpperCase()} → ${action.dst}`,
          steps: result.trace,
        },
        probeLog: [...state.probeLog, { id, src: action.src, dst: action.dst, summary, ok }].slice(
          -20,
        ),
        cursor: 0,
        playing: false,
      };
    }
    case "reset-macs":
      return { ...state, manualMacs: freshSimState(topologyOf(state)), message: "MAC 表已清空" };
    case "set-cursor":
      return { ...state, cursor: action.seq };
    case "set-playing":
      return { ...state, playing: action.playing };
    case "run-public-tests":
      return {
        ...state,
        runOutcome: {
          score: action.results.filter((r) => r.passed).length,
          total: action.results.length,
          results: action.results,
        },
      };
    case "show-case":
      return {
        ...state,
        activeTrace: { title: action.title, steps: action.steps },
        cursor: 0,
        playing: false,
      };
    case "judge-result":
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: action.outcome.currentStage,
      };
    case "mark-saving":
      return { ...state, saveStatus: "saving" };
    case "mark-saved":
      return { ...state, saveStatus: "saved", dirty: false };
    case "mark-save-error":
      return { ...state, saveStatus: "error" };
    case "message":
      return { ...state, message: action.text };
    case "dismiss-message":
      return { ...state, message: null };
    default:
      return state;
  }
}

/** Run a hidden counterexample back through the current topology for replay. */
export function replayCase(
  state: NetLessonState,
  netCase: import("../domain/scenario.ts").NetCase,
): NetCaseResult {
  return runCase(topologyOf(state), netCase);
}
