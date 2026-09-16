import { describe, expect, it } from "vitest";
import { openMemoryDb, newId } from "../db/client.ts";
import { getOrCreateProject, judgeSubmission, saveDraft } from "./run.ts";
import { hiddenTestsFor } from "./testcases.ts";
import { runCases } from "../../src/features/calculator/domain/evaluate.ts";
import {
  add4Graph,
  calculatorGraph,
  fullAdderGraph,
  fullAdderPrimitiveGraph,
  halfAdderGraph,
  mul4Graph,
  neg4Graph,
  sub4Graph,
} from "../../src/features/calculator/domain/fixtures.ts";
import {
  CALCULATOR_STAGES,
  challengeStages,
  coreStages,
} from "../../src/features/calculator/domain/stages.ts";
import type { CircuitGraph } from "../../src/features/calculator/domain/graph.ts";

/**
 * The reference solutions are correct by construction; every hidden vector
 * must accept them. A failure here means the judge (not the student) is wrong.
 */
describe("hidden tests accept the reference solutions", () => {
  const halfAdder = halfAdderGraph();
  const fullAdder = fullAdderGraph();
  const add4 = add4Graph();
  const neg4 = neg4Graph();
  const sub4 = sub4Graph();
  const mul4 = mul4Graph();

  // Components accumulate exactly like the unlock progression does.
  const afterStage1 = { HalfAdder: halfAdder };
  const afterStage2 = { ...afterStage1, FullAdder: fullAdder };
  const afterStage3 = { ...afterStage2, Add4: add4 };
  const afterStage4 = { ...afterStage3, Neg4: neg4 };
  const afterStage5 = { ...afterStage4, Sub4: sub4 };
  const afterStage6 = { ...afterStage5, Mul4: mul4 };

  it.each([
    [1, halfAdder, {}],
    [2, fullAdder, afterStage1],
    [2, fullAdderPrimitiveGraph(), {}],
    [3, add4, afterStage2],
    [4, neg4, afterStage3],
    [5, sub4, afterStage4],
    [6, mul4, afterStage5],
    [7, calculatorGraph(), afterStage6],
  ])(
    "stage %i reference solution passes every hidden case",
    (stageIndex, graph, components: Record<string, CircuitGraph>) => {
      const cases = hiddenTestsFor(stageIndex as number);
      expect(cases.length).toBeGreaterThan(0);
      const { results, score, total } = runCases(graph as CircuitGraph, cases, components);
      const failed = results.filter((r) => !r.passed);
      expect(
        failed.map(
          (r) =>
            `${r.name} expected=${JSON.stringify(r.expected)} actual=${JSON.stringify(r.actual)}`,
        ),
      ).toEqual([]);
      expect(score).toBe(total);
    },
    // Stage 7 evaluates a full multiplier per hidden case; leave headroom for
    // slow CI runners even though memoized component evaluation is much faster.
    20_000,
  );

  it("rejects a wrong half adder and classifies the failures", () => {
    // Carry wired to OR instead of AND: correct only when at most one input is 1.
    const broken: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 },
        { id: "b", kind: "input", name: "B", value: 0, x: 0, y: 40 },
        { id: "x", kind: "xor", x: 100, y: 0 },
        { id: "o", kind: "or", x: 100, y: 60 },
        { id: "s", kind: "output", name: "Sum", x: 200, y: 0 },
        { id: "c", kind: "output", name: "Carry", x: 200, y: 60 },
      ],
      edges: [
        { id: "1", from: { node: "a", port: "out" }, to: { node: "x", port: "in0" } },
        { id: "2", from: { node: "b", port: "out" }, to: { node: "x", port: "in1" } },
        { id: "3", from: { node: "a", port: "out" }, to: { node: "o", port: "in0" } },
        { id: "4", from: { node: "b", port: "out" }, to: { node: "o", port: "in1" } },
        { id: "5", from: { node: "x", port: "out" }, to: { node: "s", port: "in" } },
        { id: "6", from: { node: "o", port: "out" }, to: { node: "c", port: "in" } },
      ],
    };
    const { score, total } = runCases(broken, hiddenTestsFor(1), {});
    expect(score).toBeLessThan(total);
  });

  it("reports undriven outputs instead of silently passing", () => {
    const dangling: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 0, y: 0 },
        { id: "b", kind: "input", name: "B", value: 0, x: 0, y: 40 },
        { id: "s", kind: "output", name: "Sum", x: 200, y: 0 },
        { id: "c", kind: "output", name: "Carry", x: 200, y: 60 },
      ],
      edges: [],
    };
    const { results } = runCases(dangling, hiddenTestsFor(1), {});
    // 0+0 happens to expect Sum=0/Carry=0, but null must not equal 0.
    expect(results.every((r) => !r.passed)).toBe(true);
  });

  it("detects a feedback loop rather than hanging", () => {
    const looped: CircuitGraph = {
      nodes: [
        { id: "n1", kind: "not", x: 0, y: 0 },
        { id: "o", kind: "output", name: "Sum", x: 100, y: 0 },
      ],
      edges: [
        { id: "1", from: { node: "n1", port: "out" }, to: { node: "n1", port: "in" } },
        { id: "2", from: { node: "n1", port: "out" }, to: { node: "o", port: "in" } },
      ],
    };
    const { results } = runCases(looped, hiddenTestsFor(1), {});
    expect(results[0].error?.kind).toBe("cycle");
  });
});

describe("stage contracts", () => {
  it("declares unique ids and consecutive indices", () => {
    expect(CALCULATOR_STAGES.map((s) => s.index)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(new Set(CALCULATOR_STAGES.map((s) => s.id)).size).toBe(7);
    for (const stage of CALCULATOR_STAGES) {
      expect(stage.inputs.length).toBeGreaterThan(0);
      expect(stage.outputs.length).toBeGreaterThan(0);
    }
  });

  it("covers every declared output pin with hidden cases", () => {
    for (const stage of CALCULATOR_STAGES) {
      const cases = hiddenTestsFor(stage.index);
      const covered = new Set(cases.flatMap((c) => Object.keys(c.outputs)));
      expect([...covered].sort()).toEqual([...stage.outputs].sort());
      const bound = new Set(cases.flatMap((c) => Object.keys(c.inputs)));
      expect([...bound].sort()).toEqual([...stage.inputs].sort());
    }
  });

  it("declares non-empty buses whose pins match the stage contract", () => {
    for (const stage of CALCULATOR_STAGES) {
      expect(stage.buses.length).toBeGreaterThan(0);
      for (const bus of stage.buses) {
        const declared = bus.role === "input" ? stage.inputs : stage.outputs;
        for (const pin of bus.pins) {
          expect(declared, `${stage.id} bus "${bus.name}" pin ${pin}`).toContain(pin);
        }
      }
    }
  });

  it("splits stages into core 1-5 and challenge 6-7", () => {
    expect(coreStages().map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
    expect(challengeStages().map((s) => s.index)).toEqual([6, 7]);
  });
});

describe("judge persistence and unlocking", () => {
  function setup() {
    const db = openMemoryDb();
    const userId = newId();
    const classId = newId();
    db.prepare("INSERT INTO classes (id, name, invite_code) VALUES (?, ?, ?)").run(
      classId,
      "test-class",
      "TEST1",
    );
    db.prepare("INSERT INTO users (id, student_no, name, password_hash) VALUES (?, ?, ?, ?)").run(
      userId,
      "20260101",
      "张三",
      "scrypt:x:y",
    );
    db.prepare(
      "INSERT INTO class_members (id, class_id, user_id, role) VALUES (?, ?, ?, 'student')",
    ).run(newId(), classId, userId);
    return { db, userId, classId };
  }

  it("advances the stage and unlocks the component on a full pass", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject(db, userId, classId, "calculator");
    expect(project.currentStage).toBe(1);

    const outcome = judgeSubmission(db, project, 1, halfAdderGraph());
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(true);
    expect(outcome.score).toBe(outcome.total);
    expect(outcome.currentStage).toBe(2);
    expect(outcome.passedStages).toEqual([1]);
    expect(outcome.testSummary.counterexample).toBeNull();
    expect(outcome.unlockedComponent).toBe("HalfAdder");

    const reloaded = getOrCreateProject(db, userId, classId, "calculator");
    expect(reloaded.currentStage).toBe(2);
    expect(reloaded.passedStages).toEqual([1]);
    expect(reloaded.unlockedSubmodules.map((s) => s.name)).toEqual(["HalfAdder"]);

    // The unlocked component is usable by the next stage.
    const stage2 = judgeSubmission(db, reloaded, 2, fullAdderGraph());
    if ("error" in stage2) throw new Error(stage2.error);
    expect(stage2.passed).toBe(true);
    expect(stage2.currentStage).toBe(3);
  });

  it("judges with a learner-made component and persists it", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject(db, userId, classId, "calculator");
    const custom = { name: "PackedHalfAdder", graph: halfAdderGraph(), custom: true };
    const graph: CircuitGraph = {
      nodes: [
        { id: "a", kind: "input", name: "A", value: 0, x: 40, y: 40 },
        { id: "b", kind: "input", name: "B", value: 0, x: 40, y: 86 },
        { id: "component", kind: "component", name: custom.name, x: 220, y: 60 },
        { id: "sum", kind: "output", name: "Sum", x: 480, y: 40 },
        { id: "carry", kind: "output", name: "Carry", x: 480, y: 86 },
      ],
      edges: [
        {
          id: "a-component",
          from: { node: "a", port: "out" },
          to: { node: "component", port: "A" },
        },
        {
          id: "b-component",
          from: { node: "b", port: "out" },
          to: { node: "component", port: "B" },
        },
        {
          id: "component-sum",
          from: { node: "component", port: "Sum" },
          to: { node: "sum", port: "in" },
        },
        {
          id: "component-carry",
          from: { node: "component", port: "Carry" },
          to: { node: "carry", port: "in" },
        },
      ],
    };

    const outcome = judgeSubmission(db, project, 1, graph, [custom]);
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(true);
    const reloaded = getOrCreateProject(db, userId, classId, "calculator");
    expect(reloaded.unlockedSubmodules.map((component) => component.name)).toEqual([
      "PackedHalfAdder",
      "HalfAdder",
    ]);
    expect(reloaded.unlockedSubmodules[0].custom).toBe(true);
  });

  it("does not advance on a partial pass but records the score", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject(db, userId, classId, "calculator");
    const outcome = judgeSubmission(db, project, 1, { nodes: [], edges: [] });
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(false);
    expect(outcome.currentStage).toBe(1);
    expect(outcome.passedStages).toEqual([]);
    expect(outcome.unlockedComponent).toBeNull();
    expect(Object.keys(outcome.testSummary.categories).length).toBeGreaterThan(0);
    // A failed run exposes the first failing case as a minimal counterexample.
    const counterexample = outcome.testSummary.counterexample;
    expect(counterexample).not.toBeNull();
    expect(counterexample!.actual).not.toEqual(counterexample!.expected);

    const count = db
      .prepare("SELECT COUNT(*) AS n FROM submissions WHERE user_id = ?")
      .get(userId) as { n: number };
    expect(count.n).toBe(1);
  });

  it("refuses a challenge stage while any core stage is unpassed", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject(db, userId, classId, "calculator");
    const outcome = judgeSubmission(db, project, 6, mul4Graph());
    expect(outcome).toMatchObject({ error: "stage-locked", status: 409 });
  });

  it("accepts a core stage submission in any order", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject(db, userId, classId, "calculator");
    // neg4Graph needs the Add4 component, so it cannot pass yet — the point
    // is that judging stage 4 is allowed rather than stage-locked.
    const outcome = judgeSubmission(db, project, 4, neg4Graph());
    expect("error" in outcome ? outcome.error : null).not.toBe("stage-locked");
    if ("error" in outcome) throw new Error(outcome.error);
    expect(outcome.passed).toBe(false);
  });

  it("persists out-of-order passes in passed_stages", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject(db, userId, classId, "calculator");

    // Stage 2 first (the primitive-only full adder needs no components).
    const stage2 = judgeSubmission(db, project, 2, fullAdderPrimitiveGraph());
    if ("error" in stage2) throw new Error(stage2.error);
    expect(stage2.passed).toBe(true);
    expect(stage2.passedStages).toEqual([2]);
    expect(stage2.currentStage).toBe(3);
    expect(stage2.unlockedComponent).toBe("FullAdder");

    // Stage 1 afterwards still counts.
    const after2 = getOrCreateProject(db, userId, classId, "calculator");
    const stage1 = judgeSubmission(db, after2, 1, halfAdderGraph());
    if ("error" in stage1) throw new Error(stage1.error);
    expect(stage1.passed).toBe(true);
    expect(stage1.passedStages).toEqual([1, 2]);

    const reloaded = getOrCreateProject(db, userId, classId, "calculator");
    expect(reloaded.passedStages).toEqual([1, 2]);
    expect(reloaded.currentStage).toBe(3);
    expect(reloaded.unlockedSubmodules.map((s) => s.name)).toEqual(
      expect.arrayContaining(["HalfAdder", "FullAdder"]),
    );
  });

  it("keeps drafts per stage and sanitizes them", () => {
    const { db, userId, classId } = setup();
    const project = getOrCreateProject(db, userId, classId, "calculator");
    saveDraft(db, project, 1, halfAdderGraph());
    const withOne = getOrCreateProject(db, userId, classId, "calculator");
    expect(Object.keys(withOne.draftGraph)).toEqual(["1"]);

    saveDraft(db, withOne, 2, { nodes: "not-an-array", edges: [] });
    const withTwo = getOrCreateProject(db, userId, classId, "calculator");
    expect(withTwo.draftGraph["2"]).toEqual({ nodes: [], edges: [] });
    expect(withTwo.draftGraph["1"].nodes.length).toBeGreaterThan(0);
  });
});
