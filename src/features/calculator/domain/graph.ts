/**
 * Circuit graph model — the "code" of the Calculator Lab.
 * Pure data + validation. No React, no DOM.
 *
 * A graph is a set of typed nodes with named ports, connected by directed edges.
 * Primitive gates have fixed ports; `input`/`output` nodes expose the public
 * contract of the stage (their `name` is the pin name a judge binds to).
 * `component` nodes reference a previously unlocked black-box graph by `ref`.
 */

export type Bit = 0 | 1;

export type GateKind = "and" | "or" | "xor" | "nand" | "nor" | "not" | "buffer";

export type NodeKind = "input" | "output" | "const" | "component" | GateKind;

export type PortRef = { node: string; port: string };

export type CircuitNode = {
  id: string;
  kind: NodeKind;
  /** Pin name for input/output nodes; component name for component nodes. */
  name?: string;
  /** Manual value for input nodes and const nodes. */
  value?: Bit;
  /** Whether a component instance hides every wire connected to it on the canvas. */
  collapsed?: boolean;
  x: number;
  y: number;
};

export type CircuitEdge = { id: string; from: PortRef; to: PortRef };

export type CircuitGraph = { nodes: CircuitNode[]; edges: CircuitEdge[] };

/** A reusable black-box component, either unlocked by a stage or made by a learner. */
export type ComponentDef = { name: string; graph: CircuitGraph; custom?: boolean };

export const GATE_INPUT_PORTS: Record<GateKind, string[]> = {
  and: ["in0", "in1"],
  or: ["in0", "in1"],
  xor: ["in0", "in1"],
  nand: ["in0", "in1"],
  nor: ["in0", "in1"],
  not: ["in"],
  buffer: ["in"],
};

export const GATE_OUTPUT_PORTS: Record<GateKind, string[]> = {
  and: ["out"],
  or: ["out"],
  xor: ["out"],
  nand: ["out"],
  nor: ["out"],
  not: ["out"],
  buffer: ["out"],
};

export const GATE_LABEL: Record<GateKind, string> = {
  and: "AND",
  or: "OR",
  xor: "XOR",
  nand: "NAND",
  nor: "NOR",
  not: "NOT",
  buffer: "BUF",
};

export function gateInputPorts(node: CircuitNode): string[] {
  if (node.kind === "output") return ["in"];
  if (node.kind in GATE_INPUT_PORTS) return GATE_INPUT_PORTS[node.kind as GateKind];
  return [];
}

export function gateOutputPorts(node: CircuitNode): string[] {
  if (node.kind === "input" || node.kind === "const") return ["out"];
  if (node.kind in GATE_OUTPUT_PORTS) return GATE_OUTPUT_PORTS[node.kind as GateKind];
  return [];
}

export function emptyGraph(): CircuitGraph {
  return { nodes: [], edges: [] };
}

export function isGraph(value: unknown): value is CircuitGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as CircuitGraph;
  return Array.isArray(graph.nodes) && Array.isArray(graph.edges);
}

/** Port tables are closed for every kind except `component` (catalog-defined). */
function portExists(node: CircuitNode | undefined, ref: PortRef, direction: "in" | "out"): boolean {
  if (!node || node.kind === "component") return Boolean(node);
  const ports = direction === "in" ? gateInputPorts(node) : gateOutputPorts(node);
  return ports.includes(ref.port);
}

export function sanitizeGraph(value: unknown): CircuitGraph {
  if (!isGraph(value)) return emptyGraph();
  const nodes = value.nodes
    .filter(
      (n): n is CircuitNode =>
        !!n &&
        typeof n === "object" &&
        typeof (n as CircuitNode).id === "string" &&
        typeof (n as CircuitNode).kind === "string" &&
        Number.isFinite((n as CircuitNode).x) &&
        Number.isFinite((n as CircuitNode).y),
    )
    .map((n) => ({
      id: n.id,
      kind: n.kind,
      name: typeof n.name === "string" ? n.name : undefined,
      value: n.value === 1 ? (1 as Bit) : n.value === 0 ? (0 as Bit) : undefined,
      collapsed: n.collapsed === true ? true : undefined,
      x: Math.round(n.x),
      y: Math.round(n.y),
    }));
  const nodesById = new Map(nodes.map((n) => [n.id, n]));
  const edges: CircuitEdge[] = [];
  // One driver per input port, same rule the wiring reducer enforces: when a
  // stored or imported graph carries several edges into one `to` port, the
  // last edge wins and the rest are dropped. Edges pointing at a node or a
  // known-missing port are dangling and dropped too.
  const driven = new Set<string>();
  for (const raw of value.edges) {
    if (
      !raw ||
      typeof raw !== "object" ||
      typeof (raw as CircuitEdge).id !== "string" ||
      !(raw as CircuitEdge).from ||
      !(raw as CircuitEdge).to
    ) {
      continue;
    }
    const edge = raw as CircuitEdge;
    const fromNode = nodesById.get(edge.from.node);
    const toNode = nodesById.get(edge.to.node);
    const toPort = { node: edge.to.node, port: String(edge.to.port) };
    const fromPort = { node: edge.from.node, port: String(edge.from.port) };
    if (!fromNode || !toNode) continue;
    if (!portExists(fromNode, fromPort, "out") || !portExists(toNode, toPort, "in")) continue;
    const toKey = `${toPort.node}#${toPort.port}`;
    if (driven.has(toKey)) {
      const index = edges.findIndex(
        (candidate) => candidate.to.node === toPort.node && candidate.to.port === toPort.port,
      );
      if (index >= 0) edges.splice(index, 1);
    }
    driven.add(toKey);
    edges.push({ id: edge.id, from: fromPort, to: toPort });
  }
  return { nodes, edges };
}

/** Named pins of a graph, used as its black-box contract. */
export function inputPinNames(graph: CircuitGraph): string[] {
  return graph.nodes
    .filter((n) => n.kind === "input")
    .map((n) => n.name ?? "")
    .filter(Boolean);
}

export function outputPinNames(graph: CircuitGraph): string[] {
  return graph.nodes
    .filter((n) => n.kind === "output")
    .map((n) => n.name ?? "")
    .filter(Boolean);
}

/**
 * Structural contract check run before any truth-table judging. A graph that
 * fails here is judged as failed without running cases — the issue strings
 * are learner-facing diagnostics, not internals.
 *
 * Checks: no duplicated pin names, at most one driver per input port, every
 * required input pin exists and feeds something, and every required output
 * pin exists and is driven.
 */
export function findContractIssues(
  graph: CircuitGraph,
  requiredInputs: readonly string[],
  requiredOutputs: readonly string[],
): string[] {
  const issues: string[] = [];

  const duplicates = (kind: "input" | "output"): string[] => {
    const seen = new Set<string>();
    const dup = new Set<string>();
    for (const node of graph.nodes) {
      if (node.kind !== kind || !node.name) continue;
      if (seen.has(node.name)) dup.add(node.name);
      seen.add(node.name);
    }
    return [...dup];
  };
  for (const name of duplicates("input")) issues.push(`输入引脚 ${name} 重复了`);
  for (const name of duplicates("output")) issues.push(`输出引脚 ${name} 重复了`);

  const labelOf = (nodeId: string, port: string): string => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    const name = node?.name ?? nodeId;
    return `${name} 的 ${port} 口`;
  };
  const driven = new Set<string>();
  for (const edge of graph.edges) {
    const key = `${edge.to.node}#${edge.to.port}`;
    if (driven.has(key)) issues.push(`${labelOf(edge.to.node, edge.to.port)}接入了多根导线`);
    driven.add(key);
  }

  const inputsByName = new Map(
    graph.nodes.filter((n) => n.kind === "input" && n.name).map((n) => [n.name as string, n]),
  );
  const outputsByName = new Map(
    graph.nodes.filter((n) => n.kind === "output" && n.name).map((n) => [n.name as string, n]),
  );
  for (const pin of requiredInputs) {
    const node = inputsByName.get(pin);
    if (!node) {
      issues.push(`缺少输入引脚 ${pin}`);
      continue;
    }
    if (!graph.edges.some((edge) => edge.from.node === node.id)) {
      issues.push(`输入 ${pin} 没有接出导线`);
    }
  }
  for (const pin of requiredOutputs) {
    const node = outputsByName.get(pin);
    if (!node) {
      issues.push(`缺少输出引脚 ${pin}`);
      continue;
    }
    if (!graph.edges.some((edge) => edge.to.node === node.id && edge.to.port === "in")) {
      issues.push(`输出 ${pin} 没有被驱动`);
    }
  }
  return issues;
}
