/**
 * Calculator lab lesson state: the canvas editor, per-stage drafts, run
 * results, and save status. Pure transitions only — no React, no network.
 */

import { runCases, type CaseResult } from "../domain/evaluate";
import {
  componentizeSelection,
  editComponentPorts,
  expandComponentNode,
  isValidComponentIdentifier,
} from "../domain/componentize";
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
import { getStage, nextMainlineStage, stagePrerequisites, type StageDef } from "../domain/stages";
import { publicCasesFor } from "./publicCases";

export type { SaveStatus } from "../../../shared/api/client";
import type { SaveStatus } from "../../../shared/api/client";

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
  /** Next mainline stage; optional side challenges never advance this value. */
  currentStage: number;
  /** Stages fully passed, ascending, deduplicated. */
  passedStages: number[];
  unlockedSubmodules: ComponentDef[];
  /** Draft graph per stage index. */
  drafts: Record<number, CircuitGraph>;
  /** Undo snapshots: the graph before each edit, tagged with its stage. */
  past: UndoSnapshot[];
  /** A node drag is kept out of history until the pointer is released. */
  nodeMove: { stageIndex: number; nodeId: string; graph: CircuitGraph } | null;
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
  | { type: "start-node-move"; id: string }
  | { type: "finish-node-move" }
  | { type: "add-node"; kind: NodeKind; name?: string; value?: Bit; x: number; y: number }
  | {
      type: "componentize-selection";
      selectedIds: string[];
      name: string;
      inputNames: string[];
      outputNames: string[];
      inputPortKeys?: string[];
      outputPortKeys?: string[];
    }
  | {
      type: "edit-custom-component";
      name: string;
      /** New component name; omitted or equal to `name` keeps the old name. */
      newName?: string;
      inputNames: string[];
      outputNames: string[];
      inputPortKeys?: string[];
      outputPortKeys?: string[];
    }
  | { type: "expand-component"; id: string }
  | { type: "toggle-collapse-node"; id: string }
  | { type: "delete-custom-component"; name: string }
  | { type: "move-node"; id: string; x: number; y: number }
  | { type: "select-node"; id: string | null }
  | { type: "delete-node"; id: string }
  | { type: "delete-nodes"; ids: string[] }
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
  return stagePrerequisites(stage).every((index) => state.passedStages.includes(index));
}

export function componentMap(state: CalculatorLessonState): Record<string, CircuitGraph> {
  return Object.fromEntries(state.unlockedSubmodules.map((s) => [s.name, s.graph]));
}

export type ComponentCatalog = Record<string, CircuitGraph | ComponentDef>;

/** Keep custom-component metadata available to the canvas for explicit port ordering. */
export function componentCatalog(state: CalculatorLessonState): Record<string, ComponentDef> {
  return Object.fromEntries(
    state.unlockedSubmodules.map((component) => [component.name, component]),
  );
}

type UndoSnapshot = {
  stageIndex: number;
  graph: CircuitGraph;
  unlockedSubmodules?: ComponentDef[];
  drafts?: Record<number, CircuitGraph>;
};

/**
 * Find component definitions that directly or indirectly depend on a named
 * component. A component definition is also a graph, so checking only stage
 * drafts would leave nested black boxes pointing at a deleted definition.
 */
function componentDependents(state: CalculatorLessonState, targetName: string): string[] {
  const reverseDependencies = new Map<string, Set<string>>();

  for (const component of state.unlockedSubmodules) {
    const componentKey = component.name.toLocaleLowerCase();
    for (const node of component.graph.nodes) {
      if (node.kind !== "component" || !node.name) continue;
      const dependencyKey = node.name.toLocaleLowerCase();
      const dependents = reverseDependencies.get(dependencyKey) ?? new Set<string>();
      dependents.add(componentKey);
      reverseDependencies.set(dependencyKey, dependents);
    }
  }

  const targetKey = targetName.toLocaleLowerCase();
  const dependentKeys = new Set<string>();
  const pending = [targetKey];
  while (pending.length > 0) {
    const dependencyKey = pending.shift();
    if (!dependencyKey) continue;
    for (const dependentKey of reverseDependencies.get(dependencyKey) ?? []) {
      if (dependentKey === targetKey || dependentKeys.has(dependentKey)) continue;
      dependentKeys.add(dependentKey);
      pending.push(dependentKey);
    }
  }

  return state.unlockedSubmodules
    .filter((component) => dependentKeys.has(component.name.toLocaleLowerCase()))
    .map((component) => component.name);
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
    nodeMove: null,
    selectedNodeId: null,
    pendingWire: null,
    saveStatus: "idle",
    runOutcome: null,
    judgeOutcome: null,
    message: null,
    nextId: 1,
  };
}

/**
 * Re-place contract pins that still sit on scaffold slots. Drafts saved before
 * a pin contract changed keep the old slot order (e.g. Op1 above Op0 in the
 * calculator stage); if every pin is still on a slot the learner never moved
 * them, so snapping to the current contract order is safe. Any pin dragged
 * off the column leaves all positions untouched.
 */
function realignScaffoldPins(graph: CircuitGraph, scaffold: CircuitGraph): CircuitGraph {
  const canonical = new Map(
    scaffold.nodes.map((node) => [`${node.kind}:${node.name ?? ""}`, node]),
  );
  const slots = new Map<string, Set<string>>();
  for (const node of scaffold.nodes) {
    const set = slots.get(node.kind) ?? new Set<string>();
    set.add(`${node.x},${node.y}`);
    slots.set(node.kind, set);
  }
  const pins = graph.nodes.filter((node) => node.kind === "input" || node.kind === "output");
  if (pins.length === 0) return graph;
  const untouched = pins.every(
    (node) =>
      canonical.has(`${node.kind}:${node.name ?? ""}`) &&
      slots.get(node.kind)?.has(`${node.x},${node.y}`),
  );
  if (!untouched) return graph;
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (node.kind !== "input" && node.kind !== "output") return node;
    const target = canonical.get(`${node.kind}:${node.name ?? ""}`);
    if (!target || (node.x === target.x && node.y === target.y)) return node;
    changed = true;
    return { ...node, x: target.x, y: target.y };
  });
  return changed ? { ...graph, nodes } : graph;
}

/** Ensure the stage's required pins exist even in a restored draft. */
function withScaffold(graph: CircuitGraph, stageIndex: number): CircuitGraph {
  const scaffold = scaffoldGraph(stageIndex);
  if (graph.nodes.length === 0) return scaffold;
  const names = new Set(
    graph.nodes.filter((n) => n.kind === "input" || n.kind === "output").map((n) => n.name),
  );
  const missing = scaffold.nodes.filter((n) => !names.has(n.name));
  const merged = missing.length === 0 ? graph : { ...graph, nodes: [...graph.nodes, ...missing] };
  return realignScaffoldPins(merged, scaffold);
}

function portsOf(node: CircuitNode, direction: "in" | "out"): string[] {
  return direction === "in" ? gateInputPorts(node) : gateOutputPorts(node);
}

function numericPortName(name: string): { prefix: string; index: number } | null {
  const match = /^(.*?)(\d+)$/.exec(name);
  return match ? { prefix: match[1], index: Number(match[2]) } : null;
}

/** Keep numbered component ports low-to-high while preserving named ports. */
function orderComponentPorts(names: string[]): string[] {
  return names
    .map((name, originalIndex) => ({ name, originalIndex, numeric: numericPortName(name) }))
    .sort((left, right) => {
      if (!left.numeric && !right.numeric) return left.originalIndex - right.originalIndex;
      if (!left.numeric) return 1;
      if (!right.numeric) return -1;
      if (left.numeric.prefix !== right.numeric.prefix) {
        return left.originalIndex - right.originalIndex;
      }
      return left.numeric.index - right.numeric.index;
    })
    .map(({ name }) => name);
}

/** A component instance's ports come from the referenced graph's pins. */
function componentPortsOf(
  node: CircuitNode,
  components: ComponentCatalog,
  direction: "in" | "out",
): string[] {
  const definition = components[node.name ?? ""];
  const graph = definition && "graph" in definition ? definition.graph : definition;
  if (!graph) return [];
  const kind = direction === "in" ? "input" : "output";
  const names = graph.nodes
    .filter((n) => n.kind === kind)
    .map((n) => n.name ?? "")
    .filter(Boolean);
  // Legacy built-ins may have been persisted in arbitrary node order. Custom
  // components use node order as the learner's explicit port order.
  return definition && "graph" in definition && definition.custom
    ? names
    : orderComponentPorts(names);
}

export function portsForNode(
  node: CircuitNode,
  components: ComponentCatalog,
  direction: "in" | "out",
): string[] {
  if (node.kind === "component") return componentPortsOf(node, components, direction);
  return portsOf(node, direction);
}

const MAX_UNDO = 50;

function appendPast(
  past: CalculatorLessonState["past"],
  snapshot: UndoSnapshot,
): CalculatorLessonState["past"] {
  const next = [...past, snapshot];
  if (next.length > MAX_UNDO) next.splice(0, next.length - MAX_UNDO);
  return next;
}

function updateGraph(
  state: CalculatorLessonState,
  update: (graph: CircuitGraph) => CircuitGraph,
  recordHistory = true,
): CalculatorLessonState {
  const before = graphOf(state);
  const next = update(before);
  if (next === before) return state;
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: next },
    past: recordHistory
      ? appendPast(state.past, {
          stageIndex: state.stageIndex,
          graph: before,
          unlockedSubmodules: state.unlockedSubmodules,
        })
      : state.past,
    saveStatus: "dirty",
    // Editing invalidates any previous verdict.
    runOutcome: null,
    judgeOutcome: null,
  };
}

function finishNodeMove(state: CalculatorLessonState): CalculatorLessonState {
  const move = state.nodeMove;
  if (!move) return state;
  if (move.stageIndex !== state.stageIndex) return { ...state, nodeMove: null };
  const current = graphOf(state);
  if (current === move.graph) return { ...state, nodeMove: null };
  return {
    ...state,
    nodeMove: null,
    past: appendPast(state.past, {
      stageIndex: state.stageIndex,
      graph: move.graph,
      unlockedSubmodules: state.unlockedSubmodules,
    }),
  };
}

function deleteNodes(state: CalculatorLessonState, ids: string[]): CalculatorLessonState {
  const requested = new Set(ids);
  const graph = graphOf(state);
  const removable = new Set(
    graph.nodes
      .filter((node) => requested.has(node.id) && node.kind !== "input" && node.kind !== "output")
      .map((node) => node.id),
  );
  if (removable.size === 0) return state;
  return {
    ...updateGraph(state, (current) => ({
      nodes: current.nodes.filter((node) => !removable.has(node.id)),
      edges: current.edges.filter(
        (edge) => !removable.has(edge.from.node) && !removable.has(edge.to.node),
      ),
    })),
    selectedNodeId:
      state.selectedNodeId && removable.has(state.selectedNodeId) ? null : state.selectedNodeId,
    nodeMove: null,
  };
}

/** Point every component instance that referenced `from` at the new name. */
function rewriteComponentNameReferences(
  graph: CircuitGraph,
  from: string,
  to: string,
): CircuitGraph {
  let changed = false;
  const nodes = graph.nodes.map((node) => {
    if (node.kind === "component" && node.name === from) {
      changed = true;
      return { ...node, name: to };
    }
    return node;
  });
  return changed ? { ...graph, nodes } : graph;
}

function rewriteComponentPortReferences(
  graph: CircuitGraph,
  componentName: string,
  inputPortRenames: Record<string, string>,
  outputPortRenames: Record<string, string>,
): CircuitGraph {
  let changed = false;
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges.map((edge) => {
    const fromNode = nodesById.get(edge.from.node);
    const toNode = nodesById.get(edge.to.node);
    const fromPort =
      fromNode?.kind === "component" && fromNode.name === componentName
        ? (outputPortRenames[edge.from.port] ?? edge.from.port)
        : edge.from.port;
    const toPort =
      toNode?.kind === "component" && toNode.name === componentName
        ? (inputPortRenames[edge.to.port] ?? edge.to.port)
        : edge.to.port;
    if (fromPort === edge.from.port && toPort === edge.to.port) return edge;
    changed = true;
    return {
      ...edge,
      from: { ...edge.from, port: fromPort },
      to: { ...edge.to, port: toPort },
    };
  });
  return changed ? { ...graph, edges } : graph;
}

function editCustomComponent(
  state: CalculatorLessonState,
  action: Extract<CalculatorLessonAction, { type: "edit-custom-component" }>,
): CalculatorLessonState {
  const component = state.unlockedSubmodules.find(
    (candidate) =>
      candidate.custom && candidate.name.toLocaleLowerCase() === action.name.toLocaleLowerCase(),
  );
  if (!component) return { ...state, message: "找不到要编辑的自定义组件。" };

  const nextName = (action.newName ?? component.name).trim();
  if (!isValidComponentIdentifier(nextName)) {
    return {
      ...state,
      message: "组件名称只能使用字母、数字、下划线或连字符，且需以字母或下划线开头。",
    };
  }
  const renamed = nextName !== component.name;
  if (
    renamed &&
    state.unlockedSubmodules.some(
      (candidate) =>
        candidate !== component &&
        candidate.name.toLocaleLowerCase() === nextName.toLocaleLowerCase(),
    )
  ) {
    return { ...state, message: `组件名称“${nextName}”已存在，请换一个名称。` };
  }

  const result = editComponentPorts({
    component,
    inputNames: action.inputNames,
    outputNames: action.outputNames,
    inputPortKeys: action.inputPortKeys,
    outputPortKeys: action.outputPortKeys,
  });
  if ("error" in result) return { ...state, message: result.error };

  const updateReferences = (graph: CircuitGraph) => {
    const portsRewritten = rewriteComponentPortReferences(
      graph,
      component.name,
      result.inputPortRenames,
      result.outputPortRenames,
    );
    return renamed
      ? rewriteComponentNameReferences(portsRewritten, component.name, nextName)
      : portsRewritten;
  };
  const editedComponent = {
    ...result.component,
    name: nextName,
    graph: updateReferences(result.component.graph),
  };
  const unlockedSubmodules = state.unlockedSubmodules.map((candidate) => {
    if (candidate === component) return editedComponent;
    const graph = updateReferences(candidate.graph);
    return graph === candidate.graph ? candidate : { ...candidate, graph };
  });
  const drafts = Object.fromEntries(
    Object.entries(state.drafts).map(([stage, graph]) => [stage, updateReferences(graph)]),
  );

  return {
    ...state,
    drafts,
    unlockedSubmodules,
    past: appendPast(state.past, {
      stageIndex: state.stageIndex,
      graph: graphOf(state),
      drafts: state.drafts,
      unlockedSubmodules: state.unlockedSubmodules,
    }),
    nodeMove: null,
    saveStatus: "dirty",
    runOutcome: null,
    judgeOutcome: null,
    message: `已更新自定义组件“${nextName}”。`,
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
        nodeMove: null,
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
        nodeMove: null,
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

    case "start-node-move": {
      if (!graphOf(state).nodes.some((node) => node.id === action.id)) return state;
      return {
        ...state,
        nodeMove: { stageIndex: state.stageIndex, nodeId: action.id, graph: graphOf(state) },
      };
    }

    case "finish-node-move":
      return finishNodeMove(state);

    case "toggle-collapse-node": {
      const node = graphOf(state).nodes.find((candidate) => candidate.id === action.id);
      if (!node || node.kind !== "component") return state;
      return updateGraph(state, (graph) => ({
        ...graph,
        nodes: graph.nodes.map((candidate) =>
          candidate.id === action.id
            ? { ...candidate, collapsed: !candidate.collapsed }
            : candidate,
        ),
      }));
    }

    case "componentize-selection": {
      const name = action.name.trim();
      if (
        state.unlockedSubmodules.some(
          (component) => component.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
        )
      ) {
        return { ...state, message: `组件名称“${name}”已存在，请换一个名称。` };
      }
      const componentNodeId = `n${state.nextId}`;
      const result = componentizeSelection({
        graph: graphOf(state),
        selectedIds: action.selectedIds,
        name,
        inputNames: action.inputNames,
        outputNames: action.outputNames,
        inputPortKeys: action.inputPortKeys,
        outputPortKeys: action.outputPortKeys,
        componentNodeId,
        edgeIdPrefix: `e${state.nextId}-component`,
      });
      if ("error" in result) return { ...state, message: result.error };
      const before = graphOf(state);
      return {
        ...state,
        drafts: { ...state.drafts, [state.stageIndex]: result.graph },
        past: appendPast(state.past, {
          stageIndex: state.stageIndex,
          graph: before,
          unlockedSubmodules: state.unlockedSubmodules,
        }),
        nodeMove: null,
        unlockedSubmodules: [...state.unlockedSubmodules, result.component],
        selectedNodeId: componentNodeId,
        pendingWire: null,
        saveStatus: "dirty",
        runOutcome: null,
        judgeOutcome: null,
        message: `已封装“${name}”，现在可以从“我的组件”中重复放置。`,
        nextId: state.nextId + 1,
      };
    }

    case "edit-custom-component":
      return editCustomComponent(state, action);

    case "expand-component": {
      const node = graphOf(state).nodes.find((candidate) => candidate.id === action.id);
      const component = state.unlockedSubmodules.find(
        (candidate) =>
          candidate.custom &&
          candidate.name.toLocaleLowerCase() === (node?.name ?? "").toLocaleLowerCase(),
      );
      if (!node || node.kind !== "component" || !component) {
        return { ...state, message: "请先选中画布中的自定义组件。" };
      }
      const result = expandComponentNode({
        graph: graphOf(state),
        componentNodeId: action.id,
        component,
        edgeIdPrefix: `e${state.nextId}-split`,
      });
      if ("error" in result) return { ...state, message: result.error };
      return {
        ...updateGraph(state, () => result.graph),
        selectedNodeId: null,
        pendingWire: null,
        message: `已拆分“${component.name}”，内部逻辑已恢复到画布。`,
        nextId: state.nextId + 1,
      };
    }

    case "delete-custom-component": {
      const name = action.name.trim();
      const component = state.unlockedSubmodules.find(
        (candidate) =>
          candidate.custom && candidate.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
      );
      if (!component) return state;
      const isUsed = Object.values(state.drafts).some((graph) =>
        graph.nodes.some(
          (node) =>
            node.kind === "component" &&
            node.name?.toLocaleLowerCase() === component.name.toLocaleLowerCase(),
        ),
      );
      const usedByComponents = componentDependents(state, component.name);
      if (isUsed || usedByComponents.length > 0) {
        const usageMessage = usedByComponents.length
          ? `仍被组件定义“${usedByComponents.join("、")}”使用，请先拆分或删除这些组件。`
          : "仍在画布中使用，请先拆分或删除画布中的实例。";
        return {
          ...state,
          message: `“${component.name}”${usageMessage}`,
        };
      }
      return {
        ...state,
        unlockedSubmodules: state.unlockedSubmodules.filter((candidate) => candidate !== component),
        saveStatus: "dirty",
        runOutcome: null,
        judgeOutcome: null,
        message: `已删除自定义组件“${component.name}”。`,
      };
    }

    case "move-node":
      return updateGraph(
        state,
        (graph) => {
          let changed = false;
          const nodes = graph.nodes.map((node) => {
            if (node.id !== action.id || (node.x === action.x && node.y === action.y)) return node;
            changed = true;
            return { ...node, x: action.x, y: action.y };
          });
          return changed ? { ...graph, nodes } : graph;
        },
        !state.nodeMove || state.nodeMove.nodeId !== action.id,
      );

    case "select-node":
      return { ...state, selectedNodeId: action.id };

    case "delete-node":
      return deleteNodes(state, [action.id]);

    case "delete-nodes":
      return deleteNodes(state, action.ids);

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
        nodeMove: null,
        selectedNodeId: null,
        pendingWire: null,
      };

    case "undo": {
      const settled = finishNodeMove(state);
      const top = settled.past[settled.past.length - 1];
      // Only restore a snapshot made on the stage currently on screen.
      if (!top || top.stageIndex !== settled.stageIndex) return settled;
      return {
        ...settled,
        drafts: top.drafts ?? { ...settled.drafts, [settled.stageIndex]: top.graph },
        unlockedSubmodules: top.unlockedSubmodules ?? settled.unlockedSubmodules,
        past: settled.past.slice(0, -1),
        nodeMove: null,
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
            ...state.unlockedSubmodules.filter(
              (s) => s.name.toLocaleLowerCase() !== unlocked.toLocaleLowerCase(),
            ),
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
        currentStage: nextMainlineStage(passedStages),
        unlockedSubmodules: submodules,
        message: action.outcome.passed
          ? unlocked
            ? `${getStage(state.stageIndex)?.title ?? "本关"}完成——组件 ${unlocked} 已加入「我的组件」，下一关可以直接使用。`
            : `${getStage(state.stageIndex)?.title ?? "本关"}完成——全部隐藏用例都正确。`
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
