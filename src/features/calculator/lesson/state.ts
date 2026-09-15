/**
 * Calculator lab lesson state: the canvas editor, per-stage drafts, run
 * results, and save status. Pure transitions only — no React, no network.
 */

import { runCases, type CaseResult } from "../domain/evaluate";
import {
  emptyGraph,
  gateInputPorts,
  gateOutputPorts,
  type Bit,
  type CircuitEdge,
  type CircuitGraph,
  type CircuitNode,
  type ComponentDef,
  type GateKind,
  type NodeKind,
  type PortRef,
} from "../domain/graph";
import { coreStages, getStage, stageCount, type StageDef } from "../domain/stages";
import { publicCasesFor } from "./publicCases";

export type SaveStatus = "idle" | "dirty" | "saving" | "saved" | "error";

/** First failing hidden case, echoed back by the judge for display. */
export type Counterexample = {
  name: string;
  category: string;
  inputs: Record<string, Bit>;
  expected: Record<string, Bit>;
  actual: Record<string, Bit | null>;
};

export type PendingWire = { from: PortRef } | null;

export type RunOutcome = {
  results: CaseResult[];
  score: number;
  total: number;
} | null;

export type JudgeOutcome = {
  score: number;
  total: number;
  passed: boolean;
  categories: Record<string, { passed: number; total: number }>;
  counterexample: Counterexample | null;
  passedStages: number[];
  error: string | null;
  unlockedComponent: string | null;
} | null;

export type CalculatorLessonState = {
  stageIndex: number;
  /** max(passedStages) + 1, capped at 7 — kept for the home progress bar. */
  currentStage: number;
  /** Stages fully passed, ascending, deduplicated. */
  passedStages: number[];
  unlockedSubmodules: ComponentDef[];
  /** Draft graph per stage index. */
  drafts: Record<number, CircuitGraph>;
  /** Undo snapshots: the graph before each edit, tagged with its stage. */
  past: { stageIndex: number; graph: CircuitGraph }[];
  selectedNodeId: string | null;
  pendingWire: PendingWire;
  saveStatus: SaveStatus;
  runOutcome: RunOutcome;
  judgeOutcome: JudgeOutcome;
  message: string | null;
  nextId: number;
};

export type CalculatorLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      unlockedSubmodules: ComponentDef[];
      drafts: Record<number, CircuitGraph>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "undo" }
  | { type: "add-node"; kind: NodeKind; name?: string; value?: Bit; x: number; y: number }
  | { type: "move-node"; id: string; x: number; y: number }
  | { type: "select-node"; id: string | null }
  | { type: "delete-node"; id: string }
  | { type: "toggle-input"; id: string }
  | { type: "start-wire"; from: PortRef }
  | { type: "complete-wire"; to: PortRef }
  | { type: "cancel-wire" }
  | { type: "delete-edge"; id: string }
  | { type: "reset-stage" }
  | { type: "run-public-tests" }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "judge-result"; outcome: NonNullable<JudgeOutcome> }
  | { type: "dismiss-message" };

export function graphOf(state: CalculatorLessonState, stageIndex = state.stageIndex): CircuitGraph {
  return state.drafts[stageIndex] ?? emptyGraph();
}

export function stageOf(state: CalculatorLessonState): StageDef | undefined {
  return getStage(state.stageIndex);
}

export function isStageUnlocked(state: CalculatorLessonState, stageIndex: number): boolean {
  const stage = getStage(stageIndex);
  if (!stage) return false;
  if (stage.track === "core") return true;
  return coreStages().every((s) => state.passedStages.includes(s.index));
}

/** First unpassed stage number — the "current" one for progress display. */
function nextCurrentStage(passedStages: number[]): number {
  return Math.min(passedStages.length === 0 ? 1 : Math.max(...passedStages) + 1, stageCount());
}

export function componentMap(state: CalculatorLessonState): Record<string, CircuitGraph> {
  return Object.fromEntries(state.unlockedSubmodules.map((s) => [s.name, s.graph]));
}

/**
 * A stage starts with its required pins already placed, so a student never has
 * to guess pin names — they wire between a fixed contract.
 */
export function scaffoldGraph(stageIndex: number): CircuitGraph {
  const stage = getStage(stageIndex);
  if (!stage) return emptyGraph();
  const nodes: CircuitNode[] = [];
  stage.inputs.forEach((name, index) => {
    nodes.push({ id: `in-${name}`, kind: "input", name, value: 0, x: 40, y: 40 + index * 46 });
  });
  stage.outputs.forEach((name, index) => {
    nodes.push({ id: `out-${name}`, kind: "output", name, x: 720, y: 40 + index * 46 });
  });
  return { nodes, edges: [] };
}

export function createCalculatorLessonState(stageIndex = 1): CalculatorLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    unlockedSubmodules: [],
    drafts: { [stageIndex]: scaffoldGraph(stageIndex) },
    past: [],
    selectedNodeId: null,
    pendingWire: null,
    saveStatus: "idle",
    runOutcome: null,
    judgeOutcome: null,
    message: null,
    nextId: 1,
  };
}

/** Ensure the stage's required pins exist even in a restored draft. */
function withScaffold(graph: CircuitGraph, stageIndex: number): CircuitGraph {
  const scaffold = scaffoldGraph(stageIndex);
  if (graph.nodes.length === 0) return scaffold;
  const names = new Set(
    graph.nodes.filter((n) => n.kind === "input" || n.kind === "output").map((n) => n.name),
  );
  const missing = scaffold.nodes.filter((n) => !names.has(n.name));
  return missing.length === 0 ? graph : { ...graph, nodes: [...graph.nodes, ...missing] };
}

function portsOf(node: CircuitNode, direction: "in" | "out"): string[] {
  return direction === "in" ? gateInputPorts(node) : gateOutputPorts(node);
}

/** A component instance's ports come from the referenced graph's pins. */
function componentPortsOf(
  node: CircuitNode,
  components: Record<string, CircuitGraph>,
  direction: "in" | "out",
): string[] {
  const graph = components[node.name ?? ""];
  if (!graph) return [];
  const kind = direction === "in" ? "input" : "output";
  return graph.nodes
    .filter((n) => n.kind === kind)
    .map((n) => n.name ?? "")
    .filter(Boolean);
}

export function portsForNode(
  node: CircuitNode,
  components: Record<string, CircuitGraph>,
  direction: "in" | "out",
): string[] {
  if (node.kind === "component") return componentPortsOf(node, components, direction);
  return portsOf(node, direction);
}

const MAX_UNDO = 50;

function updateGraph(
  state: CalculatorLessonState,
  update: (graph: CircuitGraph) => CircuitGraph,
): CalculatorLessonState {
  const before = graphOf(state);
  const next = update(before);
  const past = [...state.past, { stageIndex: state.stageIndex, graph: before }];
  if (past.length > MAX_UNDO) past.splice(0, past.length - MAX_UNDO);
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: next },
    past,
    saveStatus: "dirty",
    // Editing invalidates any previous verdict.
    runOutcome: null,
    judgeOutcome: null,
  };
}

export function transitionCalculatorLesson(
  state: CalculatorLessonState,
  action: CalculatorLessonAction,
): CalculatorLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, CircuitGraph> = {};
      for (const [key, graph] of Object.entries(action.drafts)) {
        drafts[Number(key)] = graph;
      }
      const stageIndex = Math.min(state.stageIndex, action.currentStage);
      drafts[stageIndex] = withScaffold(drafts[stageIndex] ?? emptyGraph(), stageIndex);
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        unlockedSubmodules: action.unlockedSubmodules,
        drafts,
        past: [],
        saveStatus: "idle",
        runOutcome: null,
        judgeOutcome: null,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      const existing = state.drafts[action.stageIndex];
      return {
        ...state,
        stageIndex: action.stageIndex,
        drafts: {
          ...state.drafts,
          [action.stageIndex]: withScaffold(existing ?? emptyGraph(), action.stageIndex),
        },
        selectedNodeId: null,
        pendingWire: null,
        runOutcome: null,
        judgeOutcome: null,
      };
    }

    case "add-node": {
      const id = `n${state.nextId}`;
      const node: CircuitNode = {
        id,
        kind: action.kind,
        name: action.name,
        value: action.value,
        x: action.x,
        y: action.y,
      };
      return {
        ...updateGraph(state, (graph) => ({ ...graph, nodes: [...graph.nodes, node] })),
        nextId: state.nextId + 1,
        selectedNodeId: id,
      };
    }

    case "move-node":
      return updateGraph(state, (graph) => ({
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === action.id ? { ...n, x: action.x, y: action.y } : n,
        ),
      }));

    case "select-node":
      return { ...state, selectedNodeId: action.id };

    case "delete-node": {
      const node = graphOf(state).nodes.find((n) => n.id === action.id);
      // The stage contract pins are permanent.
      if (!node || node.kind === "input" || node.kind === "output") return state;
      return {
        ...updateGraph(state, (graph) => ({
          nodes: graph.nodes.filter((n) => n.id !== action.id),
          edges: graph.edges.filter((e) => e.from.node !== action.id && e.to.node !== action.id),
        })),
        selectedNodeId: null,
      };
    }

    case "toggle-input":
      return updateGraph(state, (graph) => ({
        ...graph,
        nodes: graph.nodes.map((n) =>
          n.id === action.id && (n.kind === "input" || n.kind === "const")
            ? { ...n, value: n.value === 1 ? 0 : 1 }
            : n,
        ),
      }));

    case "start-wire":
      return { ...state, pendingWire: { from: action.from } };

    case "cancel-wire":
      return { ...state, pendingWire: null };

    case "complete-wire": {
      const pending = state.pendingWire;
      if (!pending) return state;
      if (pending.from.node === action.to.node) return { ...state, pendingWire: null };
      const edge: CircuitEdge = {
        id: `e${state.nextId}`,
        from: pending.from,
        to: action.to,
      };
      return {
        ...updateGraph(state, (graph) => ({
          ...graph,
          // One driver per input port: replace any existing edge into it.
          edges: [
            ...graph.edges.filter(
              (e) => !(e.to.node === action.to.node && e.to.port === action.to.port),
            ),
            edge,
          ],
        })),
        pendingWire: null,
        nextId: state.nextId + 1,
      };
    }

    case "delete-edge":
      return updateGraph(state, (graph) => ({
        ...graph,
        edges: graph.edges.filter((e) => e.id !== action.id),
      }));

    case "reset-stage":
      return {
        ...updateGraph(state, () => scaffoldGraph(state.stageIndex)),
        selectedNodeId: null,
        pendingWire: null,
      };

    case "undo": {
      const top = state.past[state.past.length - 1];
      // Only restore a snapshot made on the stage currently on screen.
      if (!top || top.stageIndex !== state.stageIndex) return state;
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: top.graph },
        past: state.past.slice(0, -1),
        saveStatus: "dirty",
        runOutcome: null,
        judgeOutcome: null,
      };
    }

    case "run-public-tests": {
      const outcome = runCases(
        graphOf(state),
        publicCasesFor(state.stageIndex),
        componentMap(state),
      );
      return { ...state, runOutcome: outcome };
    }

    case "mark-saving":
      return { ...state, saveStatus: "saving" };

    case "mark-saved":
      return { ...state, saveStatus: state.saveStatus === "saving" ? "saved" : state.saveStatus };

    case "mark-save-error":
      return { ...state, saveStatus: "error" };

    case "judge-result": {
      const unlocked = action.outcome.unlockedComponent;
      const submodules = unlocked
        ? [
            ...state.unlockedSubmodules.filter((s) => s.name !== unlocked),
            { name: unlocked, graph: graphOf(state) },
          ]
        : state.unlockedSubmodules;
      // Stages may now pass out of order; merge the judged stage into the
      // server-reported set and derive progress from it.
      const passedStages = action.outcome.passed
        ? [...new Set([...action.outcome.passedStages, state.stageIndex])].sort((a, b) => a - b)
        : state.passedStages;
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages,
        currentStage: nextCurrentStage(passedStages),
        unlockedSubmodules: submodules,
        message: action.outcome.passed
          ? unlocked
            ? `通过！已解锁组件 ${unlocked}，下一关可以直接使用。`
            : "通过！全部隐藏用例都正确。"
          : `得分 ${action.outcome.score} / ${action.outcome.total}，还没有全部通过。`,
      };
    }

    case "dismiss-message":
      return { ...state, message: null };
  }
}

/** Gate palette entries for the active stage. */
export function paletteGates(state: CalculatorLessonState): GateKind[] {
  return stageOf(state)?.primitives ?? [];
}
