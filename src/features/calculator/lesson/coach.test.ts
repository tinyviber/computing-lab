import { describe, expect, it } from "vitest";
import {
  coachStep,
  emptyCoachMachine,
  observeCoach,
  type CoachLessonView,
  type CoachMachine,
  type CoachView,
} from "./coach";
import { scaffoldGraph } from "./state";
import type { Bit, CircuitGraph, CircuitNode, NodeKind } from "../domain/graph";

function lesson(partial: Partial<CoachLessonView> = {}): CoachLessonView {
  return {
    stageIndex: 1,
    graph: scaffoldGraph(1),
    pendingWire: null,
    nodeMove: null,
    pins: {},
    runOutcome: null,
    judgeOutcome: null,
    passedStages: [],
    unlockedSubmodules: [],
    projectLoaded: true,
    ...partial,
  };
}

const node = (id: string, kind: NodeKind, extra: Partial<CircuitNode> = {}): CircuitNode => ({
  id,
  kind,
  x: 0,
  y: 0,
  ...extra,
});

const edge = (id: string, fromNode: string, toNode: string, toPort = "in0") => ({
  id,
  from: { node: fromNode, port: "out" },
  to: { node: toNode, port: toPort },
});

const withNodes = (graph: CircuitGraph, ...nodes: CircuitNode[]): CircuitGraph => ({
  ...graph,
  nodes: [...graph.nodes, ...nodes],
});

const withEdges = (graph: CircuitGraph, ...edges: CircuitGraph["edges"]): CircuitGraph => ({
  ...graph,
  edges: [...graph.edges, ...edges],
});

/** Drive successive lesson views through the observer and read the card. */
function makeTour(seen: string[] = []) {
  let machine: CoachMachine = { ...emptyCoachMachine(), seen: new Set(seen) };
  let prev: CoachLessonView | null = null;
  return {
    machine: () => machine,
    next(view: CoachLessonView) {
      machine = observeCoach(machine, prev, view);
      prev = view;
      return coachStep({ ...view, ...machine } as CoachView);
    },
    dismiss(...ids: string[]) {
      machine = { ...machine, seen: new Set([...machine.seen, ...ids]) };
    },
  };
}

describe("calculator coach", () => {
  it("waits for the project before showing anything", () => {
    const tour = makeTour();
    expect(tour.next(lesson({ projectLoaded: false }))).toBeNull();
  });

  it("walks the stage-1 sequence one gesture at a time", () => {
    const tour = makeTour();
    const scaffold = scaffoldGraph(1);
    const a = scaffold.nodes.find((n) => n.name === "A")!;
    const y = scaffold.nodes.find((n) => n.name === "Y")!;

    // Stage 1: signal, ports, the first wire, and submission.
    expect(tour.next(lesson())?.id).toBe("s1-signal");
    const toggled = {
      ...scaffold,
      nodes: scaffold.nodes.map((n) => (n.id === a.id ? { ...n, value: 1 as Bit } : n)),
    };
    expect(tour.next(lesson({ graph: toggled, pins: { A: 1 } }))?.id).toBe("s1-signal-2");

    tour.dismiss("s1-signal-2");
    expect(tour.next(lesson({ graph: toggled }))?.id).toBe("s1-ports");
    tour.dismiss("s1-ports");

    expect(tour.next(lesson({ graph: toggled }))?.id).toBe("s1-wire-start");
    expect(
      tour.next(lesson({ graph: toggled, pendingWire: { from: { node: a.id, port: "out" } } }))?.id,
    ).toBe("s1-wire-end");
    const wireGraph = withEdges(toggled, edge("e1", a.id, y.id, "in"));
    expect(tour.next(lesson({ graph: wireGraph }))?.id).toBe("s1-wire-play");
    expect(tour.machine().baselines.togglesAtWirePlay).toBe(1);
    const played = {
      ...wireGraph,
      nodes: wireGraph.nodes.map((n) => (n.id === a.id ? { ...n, value: 0 as Bit } : n)),
    };
    expect(tour.next(lesson({ graph: played, pins: { A: 0, Y: 0 } }))?.id).toBe("s1-wire-submit");

    const wireJudgeOutcome = {
      score: 1,
      total: 1,
      passed: true,
      categories: {},
      counterexample: null,
      passedStages: [1],
      error: null,
      unlockedComponent: null,
    };
    let step = tour.next(
      lesson({ stageIndex: 1, graph: played, judgeOutcome: wireJudgeOutcome, passedStages: [1] }),
    );
    expect(step?.id).toBe("wire-pass");
    expect(step?.nextStage).toBe(2);
    tour.dismiss("wire-pass");

    // Stage 2: continue with the original half-adder wiring and test tour.
    const halfAdder = scaffoldGraph(2);
    const stage2A = halfAdder.nodes.find((n) => n.name === "A")!;
    const stage2B = halfAdder.nodes.find((n) => n.name === "B")!;
    const xor = node("n1", "xor", { x: 340, y: 110 });
    let graph = withNodes(halfAdder, xor);
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-wire-b");
    graph = withEdges(graph, edge("e2", stage2A.id, xor.id));
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-wire-b");
    graph = withEdges(graph, edge("e3", stage2B.id, xor.id, "in1"));
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-wire-sum");
    const sum = halfAdder.nodes.find((n) => n.name === "Sum")!;
    graph = withEdges(graph, edge("e4", xor.id, sum.id, "in"));
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-explore");

    // Explore: the card records each observed combo, then reveals XOR.
    for (const [aBit, bBit, sum] of [
      [0, 0, 0],
      [0, 1, 1],
      [1, 0, 1],
    ] as const) {
      tour.next(lesson({ stageIndex: 2, graph, pins: { A: aBit, B: bBit, Sum: sum } }));
    }
    step = tour.next(lesson({ stageIndex: 2, graph, pins: { A: 1, B: 1, Sum: 0 } }));
    expect(step?.id).toBe("s1-explore");
    expect(step?.rows).toHaveLength(4);
    expect(step?.manualLabel).toBe("继续");
    expect(step?.body).toContain("XOR");
    tour.dismiss("s1-explore");

    // 9-11. Add AND, drag it, wire Carry yourself.
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-add-and");
    const and = node("n2", "and", { x: 100, y: 100 });
    graph = withNodes(graph, and);
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-drag");
    const dragged = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === and.id ? { ...n, x: 200, y: 200 } : n)),
    };
    tour.next(lesson({ stageIndex: 2, graph: dragged, nodeMove: { nodeId: and.id, graph } }));
    expect(tour.next(lesson({ stageIndex: 2, graph: dragged }))?.id).toBe("s1-carry");
    graph = dragged;
    const carry = halfAdder.nodes.find((n) => n.name === "Carry")!;
    graph = withEdges(
      graph,
      edge("e5", stage2A.id, and.id),
      edge("e6", stage2B.id, and.id, "in1"),
      edge("e7", and.id, carry.id, "in"),
    );
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-delete");

    // 12. Delete: waits for a removal followed by a restore.
    const fewer = { ...graph, edges: graph.edges.slice(0, -1) };
    expect(tour.next(lesson({ stageIndex: 2, graph: fewer }))?.id).toBe("s1-delete");
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-undo");
    tour.dismiss("s1-undo");

    // 13. Manual probing: two more input toggles.
    expect(tour.next(lesson({ stageIndex: 2, graph }))?.id).toBe("s1-manual-test");
    const a0 = {
      ...graph,
      nodes: graph.nodes.map((n) => (n.id === stage2A.id ? { ...n, value: 1 as Bit } : n)),
    };
    tour.next(lesson({ stageIndex: 2, graph: a0 }));
    const b1 = {
      ...a0,
      nodes: a0.nodes.map((n) => (n.id === stage2B.id ? { ...n, value: 1 as Bit } : n)),
    };
    expect(tour.next(lesson({ stageIndex: 2, graph: b1 }))?.id).toBe("s1-public-test");

    // 14-16. Public tests, read the results, submit.
    const runOutcome = {
      results: [
        {
          name: "0 + 0",
          category: "basic",
          passed: true,
          inputs: { A: 0 as Bit, B: 0 as Bit },
          expected: { Sum: 0 as Bit, Carry: 0 as Bit },
          actual: { Sum: 0 as Bit, Carry: 0 as Bit },
          error: null,
        },
      ],
      score: 1,
      total: 1,
    };
    expect(tour.next(lesson({ stageIndex: 2, graph: b1, runOutcome }))?.id).toBe("s1-read-results");
    tour.dismiss("s1-read-results");
    expect(tour.next(lesson({ stageIndex: 2, graph: b1, runOutcome }))?.id).toBe("s1-submit");

    // Passing closes the sequence and celebrates the new component.
    const judgeOutcome = {
      score: 4,
      total: 4,
      passed: true,
      categories: {},
      counterexample: null,
      passedStages: [1, 2],
      error: null,
      unlockedComponent: "FullAdder",
    };
    step = tour.next(lesson({ stageIndex: 2, graph: b1, judgeOutcome, passedStages: [1, 2] }));
    expect(step?.id).toBe("unlock-FullAdder");
    expect(step?.nextStage).toBe(3);
    expect(tour.machine().seen.has("s1")).toBe(true);
  });

  it("stays quiet for a returning student whose draft already has content", () => {
    const tour = makeTour();
    const built = withEdges(
      withNodes(scaffoldGraph(1), node("n1", "xor")),
      edge("e1", "in-A", "n1"),
    );
    expect(tour.next(lesson({ graph: built }))).toBeNull();
  });

  it("resumes an interrupted tour instead of restarting it", () => {
    const tour = makeTour([
      "s1-started",
      "s1-signal",
      "s1-signal-2",
      "s1-ports",
      "s1-wire-start",
      "s1-wire-end",
      "s1-wire-b",
    ]);
    const built = withEdges(
      withNodes(scaffoldGraph(2), node("n1", "xor")),
      edge("e1", "in-A", "n1"),
      edge("e2", "in-B", "n1", "in1"),
    );
    // Seen beats stay seen; the tour picks up at the first unsatisfied step.
    expect(tour.next(lesson({ stageIndex: 2, graph: built }))?.id).toBe("s1-wire-sum");
  });

  it("introduces the black box and the explore step on stage 2", () => {
    const tour = makeTour();
    const halfAdder = { name: "HalfAdder", graph: scaffoldGraph(2) };
    const stage2 = scaffoldGraph(3);
    expect(
      tour.next(lesson({ stageIndex: 3, graph: stage2, unlockedSubmodules: [halfAdder] }))?.id,
    ).toBe("s2-blackbox");
    const placed = withNodes(stage2, node("n1", "component", { name: "HalfAdder" }));
    const step = tour.next(
      lesson({ stageIndex: 3, graph: placed, unlockedSubmodules: [halfAdder] }),
    );
    expect(step?.id).toBe("s2-explore");
    expect(step?.explorer).toBe("full-adder");
  });

  it("teaches bit order and the constant-0 carry on stage 3", () => {
    const tour = makeTour();
    const stage3 = scaffoldGraph(4);
    expect(tour.next(lesson({ stageIndex: 4, graph: stage3 }))?.id).toBe("s3-bits");
    tour.dismiss("s3-bits");
    expect(tour.next(lesson({ stageIndex: 4, graph: stage3 }))?.id).toBe("s3-cin0");
    const grounded = withEdges(
      withNodes(
        stage3,
        node("n1", "const", { value: 0 }),
        node("n2", "component", { name: "FullAdder" }),
      ),
      edge("e1", "n1", "n2", "Cin"),
    );
    expect(tour.next(lesson({ stageIndex: 4, graph: grounded }))).toBeNull();
  });

  it.each([
    [5, "s4-negation", "按位取反"],
    [6, "s5-subtraction", "A − B"],
    [7, "s6-partial-products", "部分积"],
    [8, "s7-operation-select", "操作选择位"],
    [10, "s9-parity", "XOR 链"],
    [11, "s10-majority", "至少两个为 1"],
  ] as const)("adds a concept guide for stage %s", (stageIndex, id, phrase) => {
    const tour = makeTour(["s1"]);
    const step = tour.next(lesson({ stageIndex, graph: scaffoldGraph(stageIndex) }));

    expect(step?.id).toBe(id);
    expect(`${step?.title} ${step?.body}`).toContain(phrase);
  });

  it("explains the bitwise formula for the exact-case challenge", () => {
    const tour = makeTour(["s1"]);
    const step = tour.next(lesson({ stageIndex: 9, graph: scaffoldGraph(9) }));

    expect(step?.id).toBe("s8-bitwise");
    expect(step?.body).toContain("(~A) & B");
    expect(step?.rows).toHaveLength(4);
  });

  it("turns a first failure into a debugging tip", () => {
    const tour = makeTour(["s1"]);
    const runOutcome = {
      results: [
        {
          name: "1 + 1",
          category: "carry",
          passed: false,
          inputs: { A: 1 as Bit, B: 1 as Bit },
          expected: { Sum: 0 as Bit, Carry: 1 as Bit },
          actual: { Sum: 0 as Bit, Carry: 0 as Bit },
          error: null,
        },
      ],
      score: 0,
      total: 1,
    };
    const step = tour.next(lesson({ runOutcome }));
    expect(step?.id).toBe("tip-debug");
    expect(step?.manualLabel).toBe("知道了");
  });

  it("explains collapse the first time a custom component exists", () => {
    const tour = makeTour(["s1", "s6-partial-products", "s6-componentize"]);
    const custom = { name: "MyGate", graph: scaffoldGraph(1), custom: true };
    const step = tour.next(
      lesson({ stageIndex: 7, graph: scaffoldGraph(7), unlockedSubmodules: [custom] }),
    );
    expect(step?.id).toBe("tip-collapse");
  });

  it("does not leak the collapse tip into the full-adder stage", () => {
    const tour = makeTour(["s1", "s2-explore"]);
    const custom = { name: "MyGate", graph: scaffoldGraph(1), custom: true };

    expect(
      tour.next(
        lesson({
          stageIndex: 3,
          graph: scaffoldGraph(3),
          unlockedSubmodules: [custom],
        }),
      ),
    ).toBeNull();
  });

  it("goes silent once the guide is turned off", () => {
    const tour = makeTour(["coach-off"]);
    expect(tour.next(lesson())).toBeNull();
  });
});
