import type {
  AssignmentStatement,
  Expression,
  Program,
  ProgramId,
  SourceLine,
  Statement,
  WhileStatement,
} from "./model";

const literal = (value: number): Expression => ({ kind: "literal", value });
const variable = (name: string): Expression => ({ kind: "variable", name });
const add = (left: Expression, right: Expression): Expression => ({
  kind: "binary",
  operator: "add",
  left,
  right,
});

function assignment(line: number, name: string, expression: Expression): AssignmentStatement {
  return { kind: "assignment", line, variable: name, expression };
}

function whileStatement(
  line: number,
  operator: "<" | "<=",
  right: number,
  body: readonly AssignmentStatement[],
): WhileStatement {
  return {
    kind: "while",
    line,
    condition: { left: variable("i"), operator, right: literal(right) },
    body,
  };
}

function sourceLines(lines: readonly string[]): SourceLine[] {
  return lines.map((text, index) => ({ line: index + 1, text }));
}

function createOffByOneProgram(): Program {
  const body = [
    assignment(4, "count", add(variable("count"), literal(1))),
    assignment(5, "i", add(variable("i"), literal(1))),
  ];
  return {
    id: "off-by-one",
    title: "Off-by-one boundary",
    sourceLines: sourceLines([
      "count = 0",
      "i = 0",
      "while i < 3",
      "  count = count + 1",
      "  i = i + 1",
      "end",
      "print count",
    ]),
    variables: ["count", "i"],
    initialEnvironment: {},
    statements: [
      assignment(1, "count", literal(0)),
      assignment(2, "i", literal(0)),
      whileStatement(3, "<", 3, body),
      { kind: "print", line: 7, expression: variable("count") },
    ],
  };
}

function createSumProgram({
  id,
  title,
  totalInitial,
  counterInitial,
  operator,
  bound,
}: {
  id: ProgramId;
  title: string;
  totalInitial: number;
  counterInitial: number;
  operator: "<" | "<=";
  bound: number;
}): Program {
  const body = [
    assignment(4, "total", add(variable("total"), variable("i"))),
    assignment(5, "i", add(variable("i"), literal(1))),
  ];
  const statements: Statement[] = [
    assignment(1, "total", literal(totalInitial)),
    assignment(2, "i", literal(counterInitial)),
    whileStatement(3, operator, bound, body),
    { kind: "print", line: 7, expression: variable("total") },
  ];
  return {
    id,
    title,
    sourceLines: sourceLines([
      `total = ${totalInitial}`,
      `i = ${counterInitial}`,
      `while i ${operator} ${bound}`,
      "  total = total + i",
      "  i = i + 1",
      "end",
      "print total",
    ]),
    variables: ["total", "i"],
    initialEnvironment: {},
    statements,
  };
}

export const PROGRAMS: Readonly<Record<ProgramId, Program>> = {
  "sum-1-to-3": createSumProgram({
    id: "sum-1-to-3",
    title: "Sum 1 to 3",
    totalInitial: 0,
    counterInitial: 1,
    operator: "<=",
    bound: 3,
  }),
  "zero-iterations": createSumProgram({
    id: "zero-iterations",
    title: "Zero iterations",
    totalInitial: 10,
    counterInitial: 4,
    operator: "<=",
    bound: 3,
  }),
  "off-by-one": createOffByOneProgram(),
};

export function getProgram(id: ProgramId): Program {
  return PROGRAMS[id];
}
