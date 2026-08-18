import { describe, expect, it } from "vitest";
import { getProgram } from "./fixtures";
import {
  assertProgram,
  createMachine,
  MAX_EXECUTION_STEPS,
  runProgram,
  stepProgram,
  type Expression,
  type Program,
} from "./model";

const variable = (name: string): Expression => ({ kind: "variable", name });
const literal = (value: number): Expression => ({ kind: "literal", value });
const add = (left: Expression, right: Expression): Expression => ({
  kind: "binary",
  operator: "add",
  left,
  right,
});

function runtimeProgram(expression: Expression): Program {
  return {
    id: "sum-1-to-3",
    title: "Runtime test",
    sourceLines: [{ line: 1, text: "print expression" }],
    variables: ["missing", "value", "first", "second"],
    initialEnvironment: {},
    statements: [{ kind: "print", line: 1, expression }],
  };
}

function conditionRuntimeProgram(): Program {
  return {
    id: "sum-1-to-3",
    title: "Condition runtime test",
    sourceLines: [
      { line: 1, text: "while missing < 3" },
      { line: 2, text: "  missing = missing" },
      { line: 3, text: "end" },
    ],
    variables: ["missing"],
    initialEnvironment: {},
    statements: [
      {
        kind: "while",
        line: 1,
        condition: { left: variable("missing"), operator: "<", right: literal(3) },
        body: [
          { kind: "assignment", line: 2, variable: "missing", expression: variable("missing") },
        ],
      },
    ],
  };
}

function nonProgressingProgram(): Program {
  return {
    id: "sum-1-to-3",
    title: "Non-progressing loop",
    sourceLines: [
      { line: 1, text: "i = 0" },
      { line: 2, text: "while i < 3" },
      { line: 3, text: "  i = i" },
      { line: 4, text: "end" },
    ],
    variables: ["i"],
    initialEnvironment: {},
    statements: [
      { kind: "assignment", line: 1, variable: "i", expression: literal(0) },
      {
        kind: "while",
        line: 2,
        condition: { left: variable("i"), operator: "<", right: literal(3) },
        body: [{ kind: "assignment", line: 3, variable: "i", expression: variable("i") }],
      },
    ],
  };
}

function independentDefaultOracle() {
  let total = 0;
  let i = 1;
  const conditions: boolean[] = [];
  let iterations = 0;
  while (i <= 3) {
    conditions.push(true);
    iterations += 1;
    total += i;
    i += 1;
  }
  conditions.push(i <= 3);
  return { output: [total], environment: { total, i }, conditions, iterations };
}

describe("program execution domain", () => {
  it("matches an independently authored reference oracle for the default fixture", () => {
    const result = runProgram(getProgram("sum-1-to-3"));
    const reference = independentDefaultOracle();

    expect(result.machine.output).toEqual(reference.output);
    expect(result.machine.environment).toEqual(reference.environment);
    expect(
      result.frames.filter((frame) => frame.condition).map((frame) => frame.condition?.result),
    ).toEqual(reference.conditions);
    expect(result.machine.iterationCount).toBe(reference.iterations);
  });

  it("runs the default fixture with hand-authored event boundaries and terminal evidence", () => {
    const result = runProgram(getProgram("sum-1-to-3"));

    expect(result.frames.map((frame) => [frame.sourceLine, frame.eventKind])).toEqual([
      [1, "assignment"],
      [2, "assignment"],
      [3, "while-condition"],
      [4, "assignment"],
      [5, "assignment"],
      [3, "while-condition"],
      [4, "assignment"],
      [5, "assignment"],
      [3, "while-condition"],
      [4, "assignment"],
      [5, "assignment"],
      [3, "while-condition"],
      [7, "print"],
    ]);
    expect(result.machine.conditionChecks).toBe(4);
    expect(result.machine.status).toBe("completed");
    expect(result.machine.terminal?.reason).toBe("program-complete");
    expect(result.frames[11].loopExit?.message).toContain("4 <= 3 → false");
    expect(result.frames[12].terminal?.reason).toBe("program-complete");
  });

  it("keeps complete zero-iteration and off-by-one traces explicit", () => {
    const zero = runProgram(getProgram("zero-iterations"));
    const boundary = runProgram(getProgram("off-by-one"));

    expect(zero.frames.map((frame) => [frame.sourceLine, frame.eventKind])).toEqual([
      [1, "assignment"],
      [2, "assignment"],
      [3, "while-condition"],
      [7, "print"],
    ]);
    expect(zero.frames[2].condition).toMatchObject({ result: false, enteredBody: false });
    expect(zero.frames[2].loopExit?.message).toContain("4 <= 3 → false");
    expect(zero.frames[3].terminal?.reason).toBe("program-complete");
    expect(zero.machine.output).toEqual([10]);
    expect(zero.machine.environment).toEqual({ total: 10, i: 4 });
    expect(zero.machine.conditionChecks).toBe(1);
    expect(zero.machine.iterationCount).toBe(0);

    expect(boundary.frames.map((frame) => [frame.sourceLine, frame.eventKind])).toEqual([
      [1, "assignment"],
      [2, "assignment"],
      [3, "while-condition"],
      [4, "assignment"],
      [5, "assignment"],
      [3, "while-condition"],
      [4, "assignment"],
      [5, "assignment"],
      [3, "while-condition"],
      [4, "assignment"],
      [5, "assignment"],
      [3, "while-condition"],
      [7, "print"],
    ]);
    expect(
      boundary.frames.filter((frame) => frame.condition).map((frame) => frame.condition?.result),
    ).toEqual([true, true, true, false]);
    expect(boundary.frames[11].loopExit?.message).toContain("3 < 3 → false");
    expect(boundary.frames[12].terminal?.reason).toBe("program-complete");
    expect(boundary.machine.output).toEqual([3]);
    expect(boundary.machine.environment).toEqual({ count: 3, i: 3 });
    expect(boundary.machine.conditionChecks).toBe(4);
    expect(boundary.machine.iterationCount).toBe(3);
  });

  it("uses the before environment for assignments and exposes complete snapshots", () => {
    const result = runProgram(getProgram("sum-1-to-3"));
    const firstTotalUpdate = result.frames[3];
    const firstCounterUpdate = result.frames[4];

    expect(firstTotalUpdate.assignment).toMatchObject({
      variable: "total",
      previousValue: 0,
      value: 1,
    });
    expect(firstTotalUpdate.before.environment).toEqual({ total: 0, i: 1 });
    expect(firstTotalUpdate.after.environment).toEqual({ total: 1, i: 1 });
    expect(firstCounterUpdate.assignment).toMatchObject({
      variable: "i",
      previousValue: 1,
      value: 2,
    });
    expect(firstCounterUpdate.before.environment).toEqual({ total: 1, i: 1 });
    expect(firstCounterUpdate.after.environment).toEqual({ total: 1, i: 2 });
  });

  it("is pure and deterministic for repeated steps and runs", () => {
    const program = getProgram("sum-1-to-3");
    const machine = createMachine(program);
    const first = stepProgram(machine, program);
    const second = stepProgram(machine, program);

    expect(second).toEqual(first);
    expect(machine).toEqual(createMachine(program));
    expect(runProgram(program)).toEqual(runProgram(program));
  });

  it("does not alias nested machine or frame snapshots", () => {
    const program = getProgram("sum-1-to-3");
    const initial = createMachine(program);
    const first = stepProgram(initial, program);
    const second = stepProgram(first.machine, program);
    const firstMachineEnvironment = first.machine.environment as Record<string, number>;
    const firstFrameEnvironment = first.frame!.after.environment as Record<string, number>;
    const firstOutput = first.frame!.after.output as number[];

    firstMachineEnvironment.total = 99;
    firstFrameEnvironment.total = 77;
    firstOutput.push(42);

    expect(initial.environment).toEqual({});
    expect(second.frame?.before.environment).toEqual({ total: 0 });
    expect(second.frame?.before.output).toEqual([]);
    expect(first.frame?.after.environment).toEqual({ total: 77 });

    const completed = runProgram(program);
    const completedFrame = completed.frames.at(-1)!;
    const completedTerminal = completed.machine.terminal as { message: string };
    completedTerminal.message = "mutated machine terminal";
    expect(completedFrame.terminal?.message).toBe("Program completed normally.");
  });

  it("returns an identity-preserving no-op after normal completion", () => {
    const result = runProgram(getProgram("sum-1-to-3"));
    const after = stepProgram(result.machine, getProgram("sum-1-to-3"));

    expect(after.machine).toBe(result.machine);
    expect(after.frame).toBeUndefined();
    expect(after.done).toBe(true);
  });

  it("reports runtime errors with stable counters, snapshots, and post-error idempotence", () => {
    const undefinedResult = runProgram(runtimeProgram(variable("missing")));
    const unsafeResult = runProgram(
      runtimeProgram(add(literal(Number.MAX_SAFE_INTEGER), literal(1))),
    );
    const leftToRightResult = runProgram(
      runtimeProgram(add(variable("first"), variable("second"))),
    );

    expect(undefinedResult.machine.status).toBe("runtime-error");
    expect(undefinedResult.machine.stepCount).toBe(1);
    expect(undefinedResult.machine.environment).toEqual({});
    expect(undefinedResult.machine.output).toEqual([]);
    expect(undefinedResult.machine.conditionChecks).toBe(0);
    expect(undefinedResult.frames[0]).toMatchObject({
      index: 0,
      eventKind: "runtime-error",
      runtimeError: { kind: "undefined-variable", variable: "missing" },
    });
    expect(undefinedResult.frames[0].assignment).toBeUndefined();
    expect(undefinedResult.frames[0].condition).toBeUndefined();
    expect(undefinedResult.frames[0].print).toBeUndefined();
    expect(stepProgram(undefinedResult.machine, runtimeProgram(variable("missing"))).machine).toBe(
      undefinedResult.machine,
    );
    expect(unsafeResult.machine.terminal).toMatchObject({
      reason: "runtime-error",
      kind: "unsafe-number",
    });
    expect(leftToRightResult.machine.terminal).toMatchObject({
      reason: "runtime-error",
      kind: "undefined-variable",
      variable: "first",
    });
  });

  it("leaves condition counters unchanged when condition evaluation fails", () => {
    const result = runProgram(conditionRuntimeProgram());

    expect(result.machine.status).toBe("runtime-error");
    expect(result.machine.conditionChecks).toBe(0);
    expect(result.machine.iterationCount).toBe(0);
    expect(result.frames[0].before.conditionChecks).toBe(0);
    expect(result.frames[0].after.conditionChecks).toBe(0);
  });

  it("applies the exact safety cutoff without hanging", () => {
    const result = runProgram(nonProgressingProgram());

    expect(result.machine.status).toBe("step-limit");
    expect(result.machine.stepCount).toBe(MAX_EXECUTION_STEPS);
    expect(result.frames).toHaveLength(MAX_EXECUTION_STEPS + 1);
    expect(result.frames.at(-1)).toMatchObject({
      index: MAX_EXECUTION_STEPS,
      sourceLine: 3,
      eventKind: "step-limit",
    });
    expect(result.frames.at(-1)?.before).toMatchObject({ stepCount: 64, status: "running" });
    expect(result.frames.at(-1)?.after).toMatchObject({ stepCount: 64, status: "step-limit" });
    expect(result.frames.at(-1)?.terminal).toMatchObject({ reason: "step-limit", limit: 64 });
  });

  it("gives the safety limit precedence over a runtime error at the next statement", () => {
    const program = runtimeProgram(variable("missing"));
    const atLimit = { ...createMachine(program), stepCount: MAX_EXECUTION_STEPS };
    const result = stepProgram(atLimit, program);

    expect(result.machine.status).toBe("step-limit");
    expect(result.frame?.eventKind).toBe("step-limit");
    expect(result.frame?.runtimeError).toBeUndefined();
    expect(result.frame?.sourceLine).toBe(1);
  });

  it("rejects malformed source mappings and loop-end ordering", () => {
    const missingEnd = nonProgressingProgram();
    missingEnd.sourceLines = missingEnd.sourceLines.filter(
      (sourceLine) => sourceLine.text !== "end",
    );

    const duplicateStatementLine = nonProgressingProgram();
    duplicateStatementLine.statements = duplicateStatementLine.statements.map((statement, index) =>
      index === 1 ? { ...statement, line: 1 } : statement,
    );

    const invalidBinaryOperator = nonProgressingProgram();
    invalidBinaryOperator.statements = invalidBinaryOperator.statements.map((statement, index) =>
      index === 0 && statement.kind === "assignment"
        ? {
            ...statement,
            expression: {
              kind: "binary",
              operator: "multiply" as never,
              left: literal(1),
              right: literal(1),
            },
          }
        : statement,
    );

    const invalidOperator = nonProgressingProgram();
    invalidOperator.statements = invalidOperator.statements.map((statement) =>
      statement.kind === "while"
        ? { ...statement, condition: { ...statement.condition, operator: "!=" as never } }
        : statement,
    );

    const reversedTopLevel = nonProgressingProgram();
    reversedTopLevel.statements = reversedTopLevel.statements.map((statement, index) =>
      index === 1 ? { ...statement, line: 1 } : index === 0 ? { ...statement, line: 2 } : statement,
    );

    const endBeforeLoop = nonProgressingProgram();
    endBeforeLoop.sourceLines = [
      { line: 1, text: "end" },
      { line: 2, text: "i = 0" },
      { line: 3, text: "while i < 3" },
      { line: 4, text: "  i = i" },
    ];
    endBeforeLoop.statements = [
      { ...endBeforeLoop.statements[0], line: 2 },
      {
        ...endBeforeLoop.statements[1],
        line: 3,
        body: [{ ...endBeforeLoop.statements[1].body[0], line: 4 }],
      },
    ];

    expect(() => assertProgram(missingEnd)).toThrow(/end/i);
    expect(() => assertProgram(duplicateStatementLine)).toThrow(/ascending|unique/i);
    expect(() => assertProgram(invalidBinaryOperator)).toThrow(/operator/i);
    expect(() => assertProgram(invalidOperator)).toThrow(/operator/i);
    expect(() => assertProgram(reversedTopLevel)).toThrow(/ascending/i);
    expect(() => assertProgram(endBeforeLoop)).toThrow(/end/i);
  });
});
