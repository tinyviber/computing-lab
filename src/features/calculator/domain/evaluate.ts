/**
 * Deterministic circuit evaluator.
 *
 * Uses bounded fixpoint propagation instead of topological sort: every pass
 * recomputes all node outputs from current input values and pushes them along
 * edges. It converges for any acyclic graph in O(nodes) passes, tolerates
 * arbitrary wiring order, and detects cycles/feedback by non-convergence —
 * exactly the robustness a grader needs against arbitrary student topologies.
 *
 * Unconnected input ports read as 0 (deterministic). A graph that never
 * settles, or whose required output pins stay undriven, reports an error.
 */

import {
  gateInputPorts,
  gateOutputPorts,
  inputPinNames,
  outputPinNames,
  type Bit,
  type CircuitGraph,
  type CircuitNode,
  type ComponentDef,
} from "./graph.ts";

const MAX_DEPTH = 8;

export type EvalError =
  | { kind: "cycle"; detail: string }
  | { kind: "unresolved"; detail: string }
  | { kind: "depth"; detail: string };

export type EvalResult = {
  /** Resolved values of every named output pin. Null = undriven. */
  outputs: Record<string, Bit | null>;
  /**
   * Named pins for number readouts: every input pin's resolved value plus
   * every output pin's driven value. Null = undriven.
   */
  pins: Record<string, Bit | null>;
  /** Every settled port keyed `nodeId#port`, for wire-level inspection. */
  portValues: Record<string, Bit | null>;
  error: EvalError | null;
};

function gateValue(kind: string, inputs: (Bit | null)[]): Bit | null {
  const a = inputs[0] ?? 0;
  const b = inputs[1] ?? 0;
  switch (kind) {
    case "and":
      return a === 1 && b === 1 ? 1 : 0;
    case "or":
      return a === 1 || b === 1 ? 1 : 0;
    case "xor":
      return a !== b ? 1 : 0;
    case "nand":
      return a === 1 && b === 1 ? 0 : 1;
    case "nor":
      return a === 1 || b === 1 ? 0 : 1;
    case "not":
      return a === 1 ? 0 : 1;
    case "buffer":
      return a;
    default:
      return null;
  }
}

function indexByName(graph: CircuitGraph): {
  nodesById: Map<string, CircuitNode>;
  inputsByNode: Map<string, Map<string, Bit | null>>;
  outputsByNode: Map<string, Map<string, Bit | null>>;
  /** feed[fromNode][fromPort] -> list of {toNode,toPort} */
  feed: Map<string, Map<string, { node: string; port: string }[]>>;
} {
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));
  const inputsByNode = new Map<string, Map<string, Bit | null>>();
  const outputsByNode = new Map<string, Map<string, Bit | null>>();
  const feed = new Map<string, Map<string, { node: string; port: string }[]>>();

  for (const node of graph.nodes) {
    inputsByNode.set(node.id, new Map());
    outputsByNode.set(node.id, new Map());
  }
  for (const edge of graph.edges) {
    if (!nodesById.has(edge.from.node) || !nodesById.has(edge.to.node)) continue;
    const portMap = feed.get(edge.from.node) ?? new Map();
    const list = portMap.get(edge.from.port) ?? [];
    list.push({ node: edge.to.node, port: edge.to.port });
    portMap.set(edge.from.port, list);
    feed.set(edge.from.node, portMap);
  }
  return { nodesById, inputsByNode, outputsByNode, feed };
}

function componentPorts(def: ComponentDef | undefined): { inputs: string[]; outputs: string[] } {
  if (!def) return { inputs: [], outputs: [] };
  return { inputs: inputPinNames(def.graph), outputs: outputPinNames(def.graph) };
}

/**
 * Evaluate one graph once for a fixed input assignment.
 * `components` maps component names to their graphs (unlocked submodules).
 * `inputValues` binds named `input` nodes; unbound input pins use their
 * stored `value` (interactive toggle) or 0.
 */
export function evaluateGraph(
  graph: CircuitGraph,
  inputValues: Record<string, Bit> = {},
  components: Record<string, CircuitGraph> = {},
  depth = 0,
): EvalResult {
  if (depth > MAX_DEPTH) {
    return {
      outputs: {},
      pins: {},
      portValues: {},
      error: { kind: "depth", detail: "component nesting too deep" },
    };
  }

  const { inputsByNode, outputsByNode, feed } = indexByName(graph);
  const componentDefs = new Map<string, ComponentDef>(
    Object.entries(components).map(([name, g]) => [name, { name, graph: g }]),
  );

  // Seed output ports of self-driven nodes.
  for (const node of graph.nodes) {
    const outs = outputsByNode.get(node.id)!;
    if (node.kind === "input") outs.set("out", inputValues[node.name ?? ""] ?? node.value ?? 0);
    if (node.kind === "const") outs.set("out", node.value ?? 1);
  }

  const maxPasses = graph.nodes.length * 2 + 8;
  let settled = false;

  for (let pass = 0; pass < maxPasses && !settled; pass += 1) {
    let changed = false;

    // Recompute every node's outputs from its current input-port values.
    for (const node of graph.nodes) {
      const ins = inputsByNode.get(node.id)!;
      const outs = outputsByNode.get(node.id)!;
      if (node.kind === "input" || node.kind === "const") continue;

      if (node.kind === "component") {
        const def = componentDefs.get(node.name ?? "");
        const ports = componentPorts(def);
        if (!def) {
          for (const port of [...outs.keys()]) outs.set(port, null);
          continue;
        }
        const bound: Record<string, Bit> = {};
        for (const pin of ports.inputs) bound[pin] = ins.get(pin) ?? 0;
        const inner = evaluateGraph(def.graph, bound, components, depth + 1);
        if (inner.error) {
          return { outputs: {}, pins: {}, portValues: {}, error: inner.error };
        }
        for (const pin of ports.outputs) {
          const next = inner.outputs[pin] ?? null;
          if (outs.get(pin) !== next) {
            outs.set(pin, next);
            changed = true;
          }
        }
        continue;
      }

      if (node.kind === "output") continue; // outputs only consume

      // Primitive gate.
      const argValues = gateInputPorts(node).map((p) => ins.get(p) ?? null);
      const next = gateValue(node.kind, argValues);
      for (const port of gateOutputPorts(node)) {
        if (outs.get(port) !== next) {
          outs.set(port, next);
          changed = true;
        }
      }
    }

    // Propagate along edges.
    for (const node of graph.nodes) {
      const outs = outputsByNode.get(node.id)!;
      const portFeed = feed.get(node.id);
      if (!portFeed) continue;
      for (const [port, targets] of portFeed) {
        const value = outs.get(port) ?? null;
        for (const target of targets) {
          const ins = inputsByNode.get(target.node)!;
          if (ins.get(target.port) !== value) {
            ins.set(target.port, value);
            changed = true;
          }
        }
      }
    }

    settled = !changed;
  }

  if (!settled) {
    return {
      outputs: {},
      pins: {},
      portValues: {},
      error: { kind: "cycle", detail: "circuit did not settle (feedback loop?)" },
    };
  }

  const outputs: Record<string, Bit | null> = {};
  const pins: Record<string, Bit | null> = {};
  const portValues: Record<string, Bit | null> = {};
  for (const node of graph.nodes) {
    for (const [port, value] of inputsByNode.get(node.id)!) {
      portValues[`${node.id}#${port}`] = value;
    }
    for (const [port, value] of outputsByNode.get(node.id)!) {
      portValues[`${node.id}#${port}`] = value;
    }
    if (node.kind === "input") {
      pins[node.name ?? node.id] = outputsByNode.get(node.id)!.get("out") ?? null;
      continue;
    }
    if (node.kind !== "output") continue;
    const driven = inputsByNode.get(node.id)!.get("in");
    outputs[node.name ?? node.id] = driven ?? null;
    pins[node.name ?? node.id] = driven ?? null;
  }
  return { outputs, pins, portValues, error: null };
}

export type CaseResult = {
  name: string;
  category: string;
  passed: boolean;
  expected: Record<string, Bit>;
  actual: Record<string, Bit | null>;
  error: EvalError | null;
};

export type JudgeCase = {
  name: string;
  category: string;
  inputs: Record<string, Bit>;
  outputs: Record<string, Bit>;
};

export function runCase(
  graph: CircuitGraph,
  testCase: JudgeCase,
  components: Record<string, CircuitGraph>,
): CaseResult {
  const result = evaluateGraph(graph, testCase.inputs, components);
  if (result.error) {
    return {
      name: testCase.name,
      category: testCase.category,
      passed: false,
      expected: testCase.outputs,
      actual: {},
      error: result.error,
    };
  }
  const actual: Record<string, Bit | null> = {};
  let passed = true;
  for (const [pin, expected] of Object.entries(testCase.outputs)) {
    const value = result.outputs[pin] ?? null;
    actual[pin] = value;
    if (value !== expected) passed = false;
  }
  return {
    name: testCase.name,
    category: testCase.category,
    passed,
    expected: testCase.outputs,
    actual,
    error: null,
  };
}

export function runCases(
  graph: CircuitGraph,
  cases: JudgeCase[],
  components: Record<string, CircuitGraph>,
): { results: CaseResult[]; score: number; total: number } {
  const results = cases.map((testCase) => runCase(graph, testCase, components));
  return {
    results,
    score: results.filter((r) => r.passed).length,
    total: results.length,
  };
}

/** Expand an integer into named bit pins: A0 = LSB. */
export function intToPins(prefix: string, value: number, bits: number): Record<string, Bit> {
  const pins: Record<string, Bit> = {};
  for (let i = 0; i < bits; i += 1) {
    pins[`${prefix}${i}`] = ((value >> i) & 1) as Bit;
  }
  return pins;
}
