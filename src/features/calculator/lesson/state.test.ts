import { describe, expect, it } from "vitest";
import {
  createCalculatorLessonState,
  graphOf,
  isStageUnlocked,
  scaffoldGraph,
  transitionCalculatorLesson,
  type CalculatorLessonAction,
  type CalculatorLessonState,
} from "./state";
import { halfAdderGraph } from "../domain/fixtures";
import { CALCULATOR_STAGES } from "../domain/stages";

function apply(
  state: CalculatorLessonState,
  ...actions: CalculatorLessonAction[]
): CalculatorLessonState {
  return actions.reduce(transitionCalculatorLesson, state);
}

describe("calculator lesson state", () => {
  it("scaffolds every stage with its declared contract pins", () => {
    for (const stage of CALCULATOR_STAGES) {
      const graph = scaffoldGraph(stage.index);
      expect(graph.nodes.filter((n) => n.kind === "input").map((n) => n.name)).toEqual(
        stage.inputs,
      );
      expect(graph.nodes.filter((n) => n.kind === "output").map((n) => n.name)).toEqual(
        stage.outputs,
      );
      expect(graph.edges).toEqual([]);
    }
  });

  it("keeps every core stage selectable and gates challenge stages on core passes", () => {
    const state = createCalculatorLessonState();
    for (const index of [1, 2, 3, 4, 5]) expect(isStageUnlocked(state, index)).toBe(true);
    expect(isStageUnlocked(state, 6)).toBe(false);
    expect(isStageUnlocked(state, 7)).toBe(false);
    // Selecting a core stage works even with no passes yet.
    expect(apply(state, { type: "select-stage", stageIndex: 4 }).stageIndex).toBe(4);
    // Selecting a locked challenge stage is a no-op.
    expect(apply(state, { type: "select-stage", stageIndex: 6 }).stageIndex).toBe(1);
  });

  it("unlocks challenge stages once every core stage is passed", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 6,
      passedStages: [1, 2, 3, 4, 5],
      unlockedSubmodules: [],
      drafts: {},
    });
    expect(isStageUnlocked(loaded, 6)).toBe(true);
    expect(isStageUnlocked(loaded, 7)).toBe(true);
    expect(apply(loaded, { type: "select-stage", stageIndex: 6 }).stageIndex).toBe(6);

    const partial = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 5,
      passedStages: [1, 2, 3, 5],
      unlockedSubmodules: [],
      drafts: {},
    });
    expect(isStageUnlocked(partial, 6)).toBe(false);
  });

  it("wires a gate and marks the draft dirty", () => {
    const start = createCalculatorLessonState();
    const withGate = apply(start, { type: "add-node", kind: "xor", x: 300, y: 60 });
    const gateId = withGate.selectedNodeId!;
    expect(gateId).toBeTruthy();

    const wired = apply(
      withGate,
      { type: "start-wire", from: { node: "in-A", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
    );
    expect(wired.pendingWire).toBeNull();
    expect(graphOf(wired).edges).toHaveLength(1);
    expect(wired.saveStatus).toBe("dirty");
  });

  it("keeps a single driver per input port", () => {
    const state = apply(
      createCalculatorLessonState(),
      { type: "add-node", kind: "xor", x: 300, y: 60 },
      { type: "start-wire", from: { node: "in-A", port: "out" } },
    );
    const gateId = state.selectedNodeId!;
    const first = apply(state, { type: "complete-wire", to: { node: gateId, port: "in0" } });
    const second = apply(
      first,
      { type: "start-wire", from: { node: "in-B", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
    );
    const intoPort = graphOf(second).edges.filter(
      (e) => e.to.node === gateId && e.to.port === "in0",
    );
    expect(intoPort).toHaveLength(1);
    expect(intoPort[0].from.node).toBe("in-B");
  });

  it("refuses to delete stage contract pins but deletes gates with their wires", () => {
    const withGate = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "and",
      x: 200,
      y: 100,
    });
    const gateId = withGate.selectedNodeId!;
    const wired = apply(
      withGate,
      { type: "start-wire", from: { node: "in-A", port: "out" } },
      { type: "complete-wire", to: { node: gateId, port: "in0" } },
    );

    const keptPin = apply(wired, { type: "delete-node", id: "in-A" });
    expect(graphOf(keptPin).nodes.some((n) => n.id === "in-A")).toBe(true);

    const removed = apply(wired, { type: "delete-node", id: gateId });
    expect(graphOf(removed).nodes.some((n) => n.id === gateId)).toBe(false);
    expect(graphOf(removed).edges).toHaveLength(0);
  });

  it("runs public tests locally and passes a correct half adder", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: { 1: halfAdderGraph() },
    });
    const run = apply(loaded, { type: "run-public-tests" });
    expect(run.runOutcome).not.toBeNull();
    expect(run.runOutcome!.score).toBe(run.runOutcome!.total);
    expect(run.runOutcome!.total).toBeGreaterThan(0);
  });

  it("fails public tests on an empty canvas", () => {
    const run = apply(createCalculatorLessonState(), { type: "run-public-tests" });
    expect(run.runOutcome!.score).toBe(0);
  });

  it("clears a stale verdict as soon as the circuit changes", () => {
    const run = apply(
      apply(createCalculatorLessonState(), {
        type: "load-project",
        currentStage: 1,
        passedStages: [],
        unlockedSubmodules: [],
        drafts: { 1: halfAdderGraph() },
      }),
      { type: "run-public-tests" },
    );
    expect(run.runOutcome).not.toBeNull();
    const edited = apply(run, { type: "add-node", kind: "or", x: 10, y: 10 });
    expect(edited.runOutcome).toBeNull();
    expect(edited.judgeOutcome).toBeNull();
  });

  it("records an unlocked component and advances on a passing verdict", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: { 1: halfAdderGraph() },
    });
    const judged = apply(loaded, {
      type: "judge-result",
      outcome: {
        score: 4,
        total: 4,
        passed: true,
        categories: { basic: { passed: 3, total: 3 }, carry: { passed: 1, total: 1 } },
        counterexample: null,
        passedStages: [1],
        error: null,
        unlockedComponent: "HalfAdder",
      },
    });
    expect(judged.currentStage).toBe(2);
    expect(judged.passedStages).toEqual([1]);
    expect(judged.unlockedSubmodules.map((s) => s.name)).toEqual(["HalfAdder"]);
    expect(judged.message).toContain("HalfAdder");
    expect(isStageUnlocked(judged, 2)).toBe(true);

    // The unlocked stage keeps its own draft, scaffolded on first visit.
    const stage2 = apply(judged, { type: "select-stage", stageIndex: 2 });
    expect(graphOf(stage2).nodes.map((n) => n.name)).toContain("Cin");
    expect(graphOf(stage2, 1).nodes.length).toBeGreaterThan(0);
  });

  it("restores missing contract pins when loading an older draft", () => {
    const loaded = apply(createCalculatorLessonState(), {
      type: "load-project",
      currentStage: 1,
      passedStages: [],
      unlockedSubmodules: [],
      drafts: { 1: { nodes: [{ id: "x", kind: "xor", x: 0, y: 0 }], edges: [] } },
    });
    const names = graphOf(loaded)
      .nodes.filter((n) => n.kind === "input" || n.kind === "output")
      .map((n) => n.name);
    expect(names).toEqual(expect.arrayContaining(["A", "B", "Sum", "Carry"]));
  });

  it("resets a stage back to its scaffold", () => {
    const dirty = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "nand",
      x: 5,
      y: 5,
    });
    const reset = apply(dirty, { type: "reset-stage" });
    expect(graphOf(reset)).toEqual(scaffoldGraph(1));
  });

  it("tracks the autosave lifecycle", () => {
    const dirty = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "or",
      x: 1,
      y: 1,
    });
    expect(dirty.saveStatus).toBe("dirty");
    const saving = apply(dirty, { type: "mark-saving" });
    expect(saving.saveStatus).toBe("saving");
    expect(apply(saving, { type: "mark-saved" }).saveStatus).toBe("saved");
    // A save that lands after a new edit must not claim "saved".
    const editedWhileSaving = apply(saving, { type: "add-node", kind: "and", x: 2, y: 2 });
    expect(apply(editedWhileSaving, { type: "mark-saved" }).saveStatus).toBe("dirty");
  });

  it("undoes the most recent graph edit on the current stage", () => {
    const base = createCalculatorLessonState();
    const edited = apply(base, { type: "add-node", kind: "xor", x: 10, y: 10 });
    expect(graphOf(edited).nodes.length).toBe(graphOf(base).nodes.length + 1);

    const undone = apply(edited, { type: "undo" });
    expect(graphOf(undone)).toEqual(graphOf(base));
    expect(undone.past).toHaveLength(0);
    expect(undone.saveStatus).toBe("dirty");
  });

  it("undoes a reset back to the working draft", () => {
    const dirty = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "nand",
      x: 5,
      y: 5,
    });
    const reset = apply(dirty, { type: "reset-stage" });
    const undone = apply(reset, { type: "undo" });
    expect(graphOf(undone)).toEqual(graphOf(dirty));
  });

  it("never restores a snapshot that belongs to another stage", () => {
    const edited = apply(createCalculatorLessonState(), {
      type: "add-node",
      kind: "xor",
      x: 10,
      y: 10,
    });
    const stage2 = apply(edited, { type: "select-stage", stageIndex: 2 });
    const undone = apply(stage2, { type: "undo" });
    expect(undone).toBe(stage2);

    // Back on stage 1 the snapshot is still there and restores correctly.
    const back = apply(undone, { type: "select-stage", stageIndex: 1 });
    const restored = apply(back, { type: "undo" });
    expect(graphOf(restored, 1).nodes.some((n) => n.kind === "xor")).toBe(false);
  });

  it("caps the undo stack at 50 snapshots, dropping the oldest", () => {
    let state = createCalculatorLessonState();
    for (let i = 0; i < 55; i += 1) {
      state = apply(state, { type: "add-node", kind: "or", x: i, y: i });
    }
    expect(state.past).toHaveLength(50);
    for (let i = 0; i < 50; i += 1) {
      state = apply(state, { type: "undo" });
    }
    expect(state.past).toHaveLength(0);
    // The five oldest snapshots were dropped: five added nodes remain.
    expect(graphOf(state).nodes.length).toBe(scaffoldGraph(1).nodes.length + 5);
    expect(apply(state, { type: "undo" }).past).toHaveLength(0);
  });
});
