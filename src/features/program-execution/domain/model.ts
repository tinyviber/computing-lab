export type Identifier = string;
export type BinaryOperator = "add" | "subtract";
export type ComparisonOperator = "<" | "<=";

export type ProgramId = "sum-1-to-3" | "zero-iterations" | "off-by-one";

export type Expression =
  | { kind: "literal"; value: number }
  | { kind: "variable"; name: Identifier }
  | { kind: "binary"; operator: BinaryOperator; left: Expression; right: Expression };

export type Condition = {
  left: Expression;
  operator: ComparisonOperator;
  right: Expression;
};

export type AssignmentStatement = {
  kind: "assignment";
  line: number;
  variable: Identifier;
  expression: Expression;
};

export type WhileStatement = {
  kind: "while";
  line: number;
  condition: Condition;
  body: readonly AssignmentStatement[];
};

export type PrintStatement = {
  kind: "print";
  line: number;
  expression: Expression;
};

export type Statement = AssignmentStatement | WhileStatement | PrintStatement;

export type SourceLine = {
  line: number;
  text: string;
};

export type Program = {
  id: ProgramId;
  title: string;
  sourceLines: readonly SourceLine[];
  variables: readonly Identifier[];
  initialEnvironment: Readonly<Record<Identifier, number>>;
  statements: readonly Statement[];
};

export type ProgramControl =
  | { kind: "top"; index: number }
  | { kind: "loop-condition"; index: number }
  | { kind: "loop-body"; index: number; bodyIndex: number }
  | { kind: "halted" };

export type ExecutionStatus = "running" | "completed" | "step-limit" | "runtime-error";

export type TerminalEvidence =
  | { reason: "program-complete"; sourceLine: number; message: string }
  | { reason: "step-limit"; sourceLine: number; limit: number; message: string }
  | {
      reason: "runtime-error";
      sourceLine: number;
      kind: "undefined-variable" | "unsafe-number";
      variable?: Identifier;
      message: string;
    };

export type RuntimeErrorEvidence = {
  kind: "undefined-variable" | "unsafe-number";
  variable?: Identifier;
  message: string;
};

export type AssignmentEvidence = {
  variable: Identifier;
  expressionText: string;
  value: number;
  previousValue?: number;
};

export type ConditionEvidence = {
  leftValue: number;
  operator: ComparisonOperator;
  rightValue: number;
  result: boolean;
  enteredBody: boolean;
};

export type LoopExitEvidence = {
  condition: {
    leftValue: number;
    operator: ComparisonOperator;
    rightValue: number;
    result: false;
  };
  message: string;
};

export type PrintEvidence = {
  expressionText: string;
  value: number;
};

export type MachineSnapshot = {
  environment: Readonly<Record<Identifier, number>>;
  output: readonly number[];
  control: ProgramControl;
  conditionChecks: number;
  iterationCount: number;
  stepCount: number;
  status: ExecutionStatus;
  terminal?: TerminalEvidence;
};

export type ExecutionMachine = MachineSnapshot;

export type ExecutionEventKind =
  "assignment" | "while-condition" | "print" | "step-limit" | "runtime-error";

export type ExecutionFrame = {
  index: number;
  sourceLine: number;
  eventKind: ExecutionEventKind;
  before: MachineSnapshot;
  after: MachineSnapshot;
  assignment?: AssignmentEvidence;
  condition?: ConditionEvidence;
  loopExit?: LoopExitEvidence;
  print?: PrintEvidence;
  runtimeError?: RuntimeErrorEvidence;
  terminal?: TerminalEvidence;
  explanation: string;
};

export type StepResult = {
  machine: ExecutionMachine;
  frame?: ExecutionFrame;
  done: boolean;
};

export type RunResult = {
  machine: ExecutionMachine;
  frames: ExecutionFrame[];
};

export const MAX_EXECUTION_STEPS = 64;

const identifierPattern = /^[a-z][a-z0-9_]*$/;

function cloneControl(control: ProgramControl): ProgramControl {
  return { ...control };
}

function cloneTerminal(terminal: TerminalEvidence | undefined): TerminalEvidence | undefined {
  return terminal ? { ...terminal } : undefined;
}

function cloneEnvironment(
  environment: Readonly<Record<Identifier, number>>,
): Record<Identifier, number> {
  return { ...environment };
}

function cloneMachine(machine: ExecutionMachine): ExecutionMachine {
  return {
    environment: cloneEnvironment(machine.environment),
    output: [...machine.output],
    control: cloneControl(machine.control),
    conditionChecks: machine.conditionChecks,
    iterationCount: machine.iterationCount,
    stepCount: machine.stepCount,
    status: machine.status,
    terminal: cloneTerminal(machine.terminal),
  };
}

function snapshot(machine: ExecutionMachine): MachineSnapshot {
  return cloneMachine(machine);
}

function expressionVariables(expression: Expression): Identifier[] {
  if (expression.kind === "variable") return [expression.name];
  if (expression.kind === "literal") return [];
  return [...expressionVariables(expression.left), ...expressionVariables(expression.right)];
}

function allProgramNames(program: Program): Set<Identifier> {
  const names = new Set(program.variables);
  for (const statement of program.statements) {
    if (statement.kind === "assignment") {
      names.add(statement.variable);
      for (const name of expressionVariables(statement.expression)) names.add(name);
    } else if (statement.kind === "print") {
      for (const name of expressionVariables(statement.expression)) names.add(name);
    } else {
      for (const name of expressionVariables(statement.condition.left)) names.add(name);
      for (const name of expressionVariables(statement.condition.right)) names.add(name);
      for (const assignment of statement.body) {
        names.add(assignment.variable);
        for (const name of expressionVariables(assignment.expression)) names.add(name);
      }
    }
  }
  return names;
}

function validateExpression(expression: Expression, names: Set<Identifier>): void {
  if (expression.kind === "literal") {
    if (!Number.isSafeInteger(expression.value)) {
      throw new Error("Program literals must be safe integers.");
    }
    return;
  }
  if (expression.kind === "variable") {
    if (!identifierPattern.test(expression.name) || !names.has(expression.name)) {
      throw new Error(`Unknown program variable: ${expression.name}`);
    }
    return;
  }
  if (expression.operator !== "add" && expression.operator !== "subtract") {
    throw new Error(`Invalid binary operator: ${expression.operator}`);
  }
  validateExpression(expression.left, names);
  validateExpression(expression.right, names);
}

function validateStatement(
  statement: Statement,
  names: Set<Identifier>,
  sourceLines: Set<number>,
): void {
  if (!Number.isInteger(statement.line) || !sourceLines.has(statement.line)) {
    throw new Error(`Statement line ${statement.line} is missing from sourceLines.`);
  }
  if (statement.kind === "assignment") {
    validateExpression(statement.expression, names);
    return;
  }
  if (statement.kind === "print") {
    validateExpression(statement.expression, names);
    return;
  }
  if (statement.condition.operator !== "<" && statement.condition.operator !== "<=") {
    throw new Error(`Invalid comparison operator: ${statement.condition.operator}`);
  }
  validateExpression(statement.condition.left, names);
  validateExpression(statement.condition.right, names);
  if (statement.body.length === 0) throw new Error("While statements need a non-empty body.");
  for (const assignment of statement.body) {
    validateStatement(assignment, names, sourceLines);
  }
}

export function assertProgram(program: Program): void {
  if (program.statements.length === 0) throw new Error("Program needs at least one statement.");
  const sourceLineNumbers = program.sourceLines.map((sourceLine) => sourceLine.line);
  if (
    sourceLineNumbers.some((line) => !Number.isInteger(line) || line <= 0) ||
    new Set(sourceLineNumbers).size !== sourceLineNumbers.length ||
    sourceLineNumbers.some((line, index) => index > 0 && line <= sourceLineNumbers[index - 1])
  ) {
    throw new Error("Program source lines must be unique positive numbers in ascending order.");
  }
  const names = allProgramNames(program);
  for (const name of names) {
    if (!identifierPattern.test(name)) throw new Error(`Invalid program variable: ${name}`);
  }
  for (const variable of Object.keys(program.initialEnvironment)) {
    if (!names.has(variable))
      throw new Error(`Initial environment has an extra variable: ${variable}`);
    if (!Number.isSafeInteger(program.initialEnvironment[variable])) {
      throw new Error(`Initial value for ${variable} must be a safe integer.`);
    }
  }
  const sourceLines = new Set(sourceLineNumbers);
  for (const statement of program.statements) validateStatement(statement, names, sourceLines);

  if (
    program.statements.some(
      (statement, index) => index > 0 && statement.line <= program.statements[index - 1].line,
    )
  ) {
    throw new Error("Top-level statement source lines must be in ascending order.");
  }
  const executableLines = new Set<number>();
  const statementLines: number[] = [];
  const whileStatements: WhileStatement[] = [];
  for (const statement of program.statements) {
    statementLines.push(statement.line);
    executableLines.add(statement.line);
    if (statement.kind === "while") {
      whileStatements.push(statement);
      for (const assignment of statement.body) {
        statementLines.push(assignment.line);
        executableLines.add(assignment.line);
      }
    }
  }
  if (new Set(statementLines).size !== statementLines.length) {
    throw new Error("Executable statement source lines must be unique.");
  }
  const sourceTextByLine = new Map(
    program.sourceLines.map((sourceLine) => [sourceLine.line, sourceLine.text.trim()]),
  );
  for (const line of executableLines) {
    if (sourceTextByLine.get(line) === "end") {
      throw new Error("An executable statement cannot use the display-only end source line.");
    }
  }
  const endLines = program.sourceLines.filter((sourceLine) => sourceLine.text.trim() === "end");
  if (whileStatements.length > 0 && endLines.length !== whileStatements.length) {
    throw new Error("Each while statement needs one display-only end source line.");
  }
  if (whileStatements.length === 0 && endLines.length > 0) {
    throw new Error("A program without a while statement cannot contain an end source line.");
  }
  whileStatements.forEach((statement, index) => {
    const endLine = endLines[index]?.line;
    if (
      endLine === undefined ||
      endLine <= statement.line ||
      statement.body.some(
        (assignment) => assignment.line <= statement.line || assignment.line >= endLine,
      ) ||
      statement.body.some(
        (assignment, assignmentIndex) =>
          assignmentIndex > 0 && assignment.line <= statement.body[assignmentIndex - 1].line,
      )
    ) {
      throw new Error("Each display-only end line must follow its while body.");
    }
    const statementIndex = program.statements.indexOf(statement);
    const nextTopStatement = program.statements[statementIndex + 1];
    if (nextTopStatement && endLine >= nextTopStatement.line) {
      throw new Error("A display-only end line must precede the next top-level statement.");
    }
  });
  for (const sourceLine of program.sourceLines) {
    if (!executableLines.has(sourceLine.line) && sourceLine.text.trim() !== "end") {
      throw new Error(`Source line ${sourceLine.line} is not mapped to an executable statement.`);
    }
  }
}

export function formatExpression(expression: Expression): string {
  if (expression.kind === "literal") return String(expression.value);
  if (expression.kind === "variable") return expression.name;
  const operator = expression.operator === "add" ? "+" : "−";
  return `${formatExpression(expression.left)} ${operator} ${formatExpression(expression.right)}`;
}

class ExpressionEvaluationError extends Error {
  constructor(
    readonly evidence: RuntimeErrorEvidence,
    message: string,
  ) {
    super(message);
    this.name = "ExpressionEvaluationError";
  }
}

function safeResult(value: number, expressionText: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new ExpressionEvaluationError(
      { kind: "unsafe-number", message: `${expressionText} produced an unsafe integer.` },
      `${expressionText} produced an unsafe integer.`,
    );
  }
  return value;
}

export function evaluateExpression(
  expression: Expression,
  environment: Readonly<Record<Identifier, number>>,
): number {
  if (expression.kind === "literal") return expression.value;
  if (expression.kind === "variable") {
    if (!Object.prototype.hasOwnProperty.call(environment, expression.name)) {
      throw new ExpressionEvaluationError(
        {
          kind: "undefined-variable",
          variable: expression.name,
          message: `${expression.name} is undefined at this statement.`,
        },
        `${expression.name} is undefined at this statement.`,
      );
    }
    return environment[expression.name];
  }
  const left = evaluateExpression(expression.left, environment);
  const right = evaluateExpression(expression.right, environment);
  const value = expression.operator === "add" ? left + right : left - right;
  return safeResult(value, formatExpression(expression));
}

function sourceLineForControl(program: Program, control: ProgramControl): number {
  if (control.kind === "halted") return 0;
  if (control.kind === "top" || control.kind === "loop-condition") {
    return program.statements[control.index].line;
  }
  return program.statements[control.index].body[control.bodyIndex].line;
}

function currentStatement(
  program: Program,
  control: ProgramControl,
): Statement | AssignmentStatement {
  if (control.kind === "loop-body")
    return program.statements[control.index].body[control.bodyIndex];
  return program.statements[control.index];
}

function terminalMessage(reason: TerminalEvidence["reason"]): string {
  if (reason === "program-complete") return "Program completed normally.";
  if (reason === "step-limit")
    return "Execution stopped at the local safety limit; termination was not proven.";
  return "Execution stopped because the program encountered a runtime error.";
}

function completeTerminal(sourceLine: number): TerminalEvidence {
  return { reason: "program-complete", sourceLine, message: terminalMessage("program-complete") };
}

function makeFrame({
  index,
  sourceLine,
  eventKind,
  before,
  after,
  explanation,
  assignment,
  condition,
  loopExit,
  print,
  runtimeError,
  terminal,
}: {
  index: number;
  sourceLine: number;
  eventKind: ExecutionEventKind;
  before: MachineSnapshot;
  after: MachineSnapshot;
  explanation: string;
  assignment?: AssignmentEvidence;
  condition?: ConditionEvidence;
  loopExit?: LoopExitEvidence;
  print?: PrintEvidence;
  runtimeError?: RuntimeErrorEvidence;
  terminal?: TerminalEvidence;
}): ExecutionFrame {
  return {
    index,
    sourceLine,
    eventKind,
    before,
    after,
    ...(assignment ? { assignment } : {}),
    ...(condition ? { condition } : {}),
    ...(loopExit ? { loopExit } : {}),
    ...(print ? { print } : {}),
    ...(runtimeError ? { runtimeError: { ...runtimeError } } : {}),
    ...(terminal ? { terminal: cloneTerminal(terminal) } : {}),
    explanation,
  };
}

function runtimeErrorResult(
  machine: ExecutionMachine,
  sourceLine: number,
  error: ExpressionEvaluationError,
): StepResult {
  const before = snapshot(machine);
  const terminal: TerminalEvidence = {
    reason: "runtime-error",
    sourceLine,
    kind: error.evidence.kind,
    ...(error.evidence.variable ? { variable: error.evidence.variable } : {}),
    message: error.evidence.message,
  };
  const next: ExecutionMachine = {
    ...cloneMachine(machine),
    stepCount: machine.stepCount + 1,
    status: "runtime-error",
    terminal,
  };
  const after = snapshot(next);
  return {
    machine: next,
    frame: makeFrame({
      index: machine.stepCount,
      sourceLine,
      eventKind: "runtime-error",
      before,
      after,
      runtimeError: error.evidence,
      terminal,
      explanation: error.evidence.message,
    }),
    done: true,
  };
}

function stepLimitResult(machine: ExecutionMachine, program: Program): StepResult {
  const before = snapshot(machine);
  const sourceLine = sourceLineForControl(program, machine.control);
  const terminal: TerminalEvidence = {
    reason: "step-limit",
    sourceLine,
    limit: MAX_EXECUTION_STEPS,
    message: terminalMessage("step-limit"),
  };
  const next: ExecutionMachine = { ...cloneMachine(machine), status: "step-limit", terminal };
  const after = snapshot(next);
  return {
    machine: next,
    frame: makeFrame({
      index: machine.stepCount,
      sourceLine,
      eventKind: "step-limit",
      before,
      after,
      terminal,
      explanation: terminal.message,
    }),
    done: true,
  };
}

function afterTopStatement(
  machine: ExecutionMachine,
  program: Program,
  nextIndex: number,
  sourceLine: number,
): { machine: ExecutionMachine; terminal?: TerminalEvidence } {
  if (nextIndex >= program.statements.length) {
    const terminal = completeTerminal(sourceLine);
    return {
      machine: {
        ...machine,
        control: { kind: "halted" },
        status: "completed",
        terminal,
      },
      terminal,
    };
  }
  return { machine: { ...machine, control: { kind: "top", index: nextIndex } } };
}

export function createMachine(program: Program): ExecutionMachine {
  assertProgram(program);
  return {
    environment: cloneEnvironment(program.initialEnvironment),
    output: [],
    control: { kind: "top", index: 0 },
    conditionChecks: 0,
    iterationCount: 0,
    stepCount: 0,
    status: "running",
  };
}

export function stepProgram(machine: ExecutionMachine, program: Program): StepResult {
  assertProgram(program);
  if (machine.status !== "running") return { machine, done: true };
  if (machine.stepCount >= MAX_EXECUTION_STEPS) return stepLimitResult(machine, program);

  const before = snapshot(machine);
  const index = machine.stepCount;
  const sourceLine = sourceLineForControl(program, machine.control);
  const next = cloneMachine(machine);
  next.stepCount += 1;
  let assignment: AssignmentEvidence | undefined;
  let condition: ConditionEvidence | undefined;
  let loopExit: LoopExitEvidence | undefined;
  let print: PrintEvidence | undefined;
  let explanation = "";
  let eventKind: ExecutionEventKind;

  try {
    if (machine.control.kind === "top") {
      const statement = currentStatement(program, machine.control);
      if (statement.kind === "assignment") {
        eventKind = "assignment";
        const value = evaluateExpression(statement.expression, machine.environment);
        const previousValue = machine.environment[statement.variable];
        next.environment[statement.variable] = value;
        assignment = {
          variable: statement.variable,
          expressionText: formatExpression(statement.expression),
          value,
          ...(previousValue === undefined ? {} : { previousValue }),
        };
        const advanced = afterTopStatement(next, program, machine.control.index + 1, sourceLine);
        Object.assign(next, advanced.machine);
        if (advanced.terminal)
          explanation = `${statement.variable} becomes ${value}. ${advanced.terminal.message}`;
        else explanation = `${statement.variable} becomes ${value}.`;
      } else if (statement.kind === "while") {
        eventKind = "while-condition";
        const leftValue = evaluateExpression(statement.condition.left, machine.environment);
        const rightValue = evaluateExpression(statement.condition.right, machine.environment);
        next.conditionChecks += 1;
        const result =
          statement.condition.operator === "<" ? leftValue < rightValue : leftValue <= rightValue;
        condition = {
          leftValue,
          operator: statement.condition.operator,
          rightValue,
          result,
          enteredBody: result,
        };
        if (result) {
          next.iterationCount += 1;
          next.control = { kind: "loop-body", index: machine.control.index, bodyIndex: 0 };
          explanation = `${leftValue} ${statement.condition.operator} ${rightValue} → true; enter the loop body.`;
        } else {
          loopExit = {
            condition: {
              leftValue,
              operator: statement.condition.operator,
              rightValue,
              result: false,
            },
            message: `${leftValue} ${statement.condition.operator} ${rightValue} → false; skip the loop body.`,
          };
          const advanced = afterTopStatement(next, program, machine.control.index + 1, sourceLine);
          Object.assign(next, advanced.machine);
          explanation = loopExit.message;
          if (advanced.terminal) explanation = `${explanation} ${advanced.terminal.message}`;
        }
      } else {
        eventKind = "print";
        const value = evaluateExpression(statement.expression, machine.environment);
        next.output.push(value);
        print = { expressionText: formatExpression(statement.expression), value };
        const advanced = afterTopStatement(next, program, machine.control.index + 1, sourceLine);
        Object.assign(next, advanced.machine);
        explanation = `Output ${value}.`;
        if (advanced.terminal) explanation = `${explanation} ${advanced.terminal.message}`;
      }
    } else if (machine.control.kind === "loop-condition") {
      const statement = program.statements[machine.control.index];
      if (statement.kind !== "while") throw new Error("Invalid loop control.");
      eventKind = "while-condition";
      const leftValue = evaluateExpression(statement.condition.left, machine.environment);
      const rightValue = evaluateExpression(statement.condition.right, machine.environment);
      next.conditionChecks += 1;
      const result =
        statement.condition.operator === "<" ? leftValue < rightValue : leftValue <= rightValue;
      condition = {
        leftValue,
        operator: statement.condition.operator,
        rightValue,
        result,
        enteredBody: result,
      };
      if (result) {
        next.iterationCount += 1;
        next.control = { kind: "loop-body", index: machine.control.index, bodyIndex: 0 };
        explanation = `${leftValue} ${statement.condition.operator} ${rightValue} → true; enter the loop body.`;
      } else {
        loopExit = {
          condition: {
            leftValue,
            operator: statement.condition.operator,
            rightValue,
            result: false,
          },
          message: `${leftValue} ${statement.condition.operator} ${rightValue} → false; skip the loop body.`,
        };
        const advanced = afterTopStatement(next, program, machine.control.index + 1, sourceLine);
        Object.assign(next, advanced.machine);
        explanation = loopExit.message;
        if (advanced.terminal) explanation = `${explanation} ${advanced.terminal.message}`;
      }
    } else if (machine.control.kind === "loop-body") {
      const statement = currentStatement(program, machine.control);
      if (statement.kind !== "assignment") throw new Error("Invalid loop body control.");
      eventKind = "assignment";
      const value = evaluateExpression(statement.expression, machine.environment);
      const previousValue = machine.environment[statement.variable];
      next.environment[statement.variable] = value;
      assignment = {
        variable: statement.variable,
        expressionText: formatExpression(statement.expression),
        value,
        ...(previousValue === undefined ? {} : { previousValue }),
      };
      const whileStatement = program.statements[machine.control.index];
      if (whileStatement.kind !== "while") throw new Error("Invalid loop body statement.");
      next.control =
        machine.control.bodyIndex + 1 < whileStatement.body.length
          ? {
              kind: "loop-body",
              index: machine.control.index,
              bodyIndex: machine.control.bodyIndex + 1,
            }
          : { kind: "loop-condition", index: machine.control.index };
      explanation = `${statement.variable} becomes ${value}.`;
    } else {
      throw new Error("A halted program cannot be stepped.");
    }
  } catch (error) {
    if (error instanceof ExpressionEvaluationError)
      return runtimeErrorResult(machine, sourceLine, error);
    throw error;
  }

  const after = snapshot(next);
  return {
    machine: next,
    frame: makeFrame({
      index,
      sourceLine,
      eventKind,
      before,
      after,
      assignment,
      condition,
      loopExit,
      print,
      terminal: next.terminal,
      explanation,
    }),
    done: next.status !== "running",
  };
}

export function runProgram(program: Program): RunResult {
  let machine = createMachine(program);
  const frames: ExecutionFrame[] = [];
  while (machine.status === "running") {
    const result = stepProgram(machine, program);
    machine = result.machine;
    if (result.frame) frames.push(result.frame);
    if (result.done) break;
  }
  return { machine, frames };
}

export function sourceLineForMachine(
  program: Program,
  machine: ExecutionMachine,
): number | undefined {
  if (machine.control.kind === "halted") return undefined;
  return sourceLineForControl(program, machine.control);
}
