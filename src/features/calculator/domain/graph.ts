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
      x: Math.round(n.x),
      y: Math.round(n.y),
    }));
  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = value.edges
    .filter(
      (e): e is CircuitEdge =>
        !!e &&
        typeof e === "object" &&
        typeof (e as CircuitEdge).id === "string" &&
        !!e.from &&
        !!e.to &&
        nodeIds.has(e.from.node) &&
        nodeIds.has(e.to.node),
    )
    .map((e) => ({
      id: e.id,
      from: { node: e.from.node, port: String(e.from.port) },
      to: { node: e.to.node, port: String(e.to.port) },
    }));
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
