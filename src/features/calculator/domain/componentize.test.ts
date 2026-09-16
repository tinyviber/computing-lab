import { describe, expect, it } from "vitest";
import {
  componentizeSelection,
  expandComponentNode,
  inspectComponentSelection,
} from "./componentize";
import { evaluateGraph } from "./evaluate";
import type { CircuitGraph } from "./graph";

function twoGateGraph(): CircuitGraph {
  return {
    nodes: [
      { id: "a", kind: "input", name: "A", value: 0, x: 40, y: 40 },
      { id: "b", kind: "input", name: "B", value: 0, x: 40, y: 86 },
      { id: "and", kind: "and", x: 200, y: 40 },
      { id: "xor", kind: "xor", x: 200, y: 120 },
      { id: "p", kind: "output", name: "P", x: 420, y: 40 },
      { id: "q", kind: "output", name: "Q", x: 420, y: 120 },
    ],
    edges: [
      { id: "a-and", from: { node: "a", port: "out" }, to: { node: "and", port: "in0" } },
      { id: "b-and", from: { node: "b", port: "out" }, to: { node: "and", port: "in1" } },
      { id: "a-xor", from: { node: "a", port: "out" }, to: { node: "xor", port: "in0" } },
      { id: "b-xor", from: { node: "b", port: "out" }, to: { node: "xor", port: "in1" } },
      { id: "and-p", from: { node: "and", port: "out" }, to: { node: "p", port: "in" } },
      { id: "xor-q", from: { node: "xor", port: "out" }, to: { node: "q", port: "in" } },
    ],
  };
}

describe("componentizeSelection", () => {
  it("derives dynamic ports and preserves shared external signals", () => {
    const graph = twoGateGraph();
    const selection = inspectComponentSelection(graph, ["and", "xor"]);

    expect(selection.error).toBeNull();
    expect(selection.inputPorts).toHaveLength(2);
    expect(selection.outputPorts).toHaveLength(2);
    expect(selection.inputPorts.map((port) => port.external.node)).toEqual(["a", "b"]);
    expect(selection.inputPorts[0].internal).toHaveLength(2);
    expect(selection.inputPorts[0].externalLabel).toBe("A 的 out");
    expect(selection.inputPorts[0].internalLabels).toEqual([
      "AND（and） 的 in0",
      "XOR（xor） 的 in0",
    ]);
    expect(selection.outputPorts[0].internalLabel).toBe("AND（and） 的 out");
    expect(selection.outputPorts[0].externalLabels).toEqual(["P 的 in"]);

    const result = componentizeSelection({
      graph,
      selectedIds: ["and", "xor"],
      name: "LogicPair",
      inputNames: ["A", "B"],
      outputNames: ["And", "Xor"],
      componentNodeId: "cmp",
      edgeIdPrefix: "cmp-edge",
    });

    if ("error" in result) throw new Error(result.error);
    expect(result.component.custom).toBe(true);
    expect(result.component.graph.nodes.filter((node) => node.kind === "input")).toHaveLength(2);
    expect(result.component.graph.nodes.filter((node) => node.kind === "output")).toHaveLength(2);
    expect(result.graph.nodes.map((node) => node.id)).toEqual(["a", "b", "p", "q", "cmp"]);

    const preview = evaluateGraph(
      result.graph,
      { A: 1, B: 0 },
      {
        LogicPair: result.component.graph,
      },
    );
    expect(preview.error).toBeNull();
    expect(preview.outputs).toEqual({ P: 0, Q: 1 });
  });

  it("rejects selecting a stage contract pin", () => {
    const selection = inspectComponentSelection(twoGateGraph(), ["a", "and"]);
    expect(selection.error).toContain("输入/输出引脚不能封装");
  });

  it("validates user-defined component and port names", () => {
    const result = componentizeSelection({
      graph: twoGateGraph(),
      selectedIds: ["and", "xor"],
      name: "bad name",
      inputNames: ["A", "B"],
      outputNames: ["And", "Xor"],
      componentNodeId: "cmp",
      edgeIdPrefix: "cmp-edge",
    });
    expect("error" in result ? result.error : null).toContain("组件名称");
  });

  it("expands a custom component and reconnects its boundary wires", () => {
    const result = componentizeSelection({
      graph: twoGateGraph(),
      selectedIds: ["and", "xor"],
      name: "LogicPair",
      inputNames: ["A", "B"],
      outputNames: ["And", "Xor"],
      componentNodeId: "cmp",
      edgeIdPrefix: "cmp-edge",
    });
    if ("error" in result) throw new Error(result.error);

    const expanded = expandComponentNode({
      graph: result.graph,
      componentNodeId: "cmp",
      component: result.component,
      edgeIdPrefix: "split-edge",
    });
    if ("error" in expanded) throw new Error(expanded.error);
    expect(expanded.graph.nodes.some((node) => node.kind === "component")).toBe(false);

    const preview = evaluateGraph(expanded.graph, { A: 1, B: 0 }, {});
    expect(preview.error).toBeNull();
    expect(preview.outputs).toEqual({ P: 0, Q: 1 });
  });
});
