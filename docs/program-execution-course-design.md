# Program Execution / Loop & Variable Tracing: course design

**Status:** implementation-ready after independent evaluation rework; no shared learning primitive is proposed.

## Research purpose

This course is the next architectural experiment after Audio Encoding, Home Network, Image Encoding, and Two's Complement. It is intentionally feature-local so that the course can falsify, rather than consume, proposed contracts for immutable traces, trace selection, pure discrete steps, prediction/evidence, and variable-table inspection.

The learner question is:

> What exactly changes after each statement and loop-condition check, and why does this program eventually produce this result?

The course is not a source editor, parser exercise, general-purpose interpreter, calculator, or submit/check workflow.

## Smallest language subset and validation

The first implementation uses instructor-authored structured programs with source lines. There is no free-form parser and no arbitrary code input.

The local domain representation is deliberately closed:

```text
Expression = literal(integer) | variable(identifier) | add(Expression, Expression)
           | subtract(Expression, Expression)
Condition  = compare(Expression, "<" | "<=", Expression)
Statement  = assignment(identifier, Expression)
           | while(Condition, non-empty Assignment[])
           | print(Expression)
Program    = { id, title, sourceLines, initialEnvironment, statements }
```

Programs are flat at the top level, contain at least one statement, use unique positive source-line numbers in ascending order, and have a non-empty loop body of assignments. Loops are not nested. Every assignment, while condition, and print statement stores its own `line` field; `sourceLines` is a readonly array of `{ line: number; text: string }` containing those executable lines plus the display-only `end` line. The statement `line` is the canonical mapping, so nested body statements do not depend on a positional flattening convention. Identifiers are lowercase ASCII names matching `[a-z][a-z0-9_]*`. Fixtures are constructed directly as typed data, so whitespace and syntax errors are not learner concepts. `assertProgram(program)` validates these invariants and throws a feature-local `Error` for invalid author data; URL input cannot construct arbitrary programs.

Arithmetic is mathematical integer arithmetic within JavaScript's safe-integer range. If an expression result is not a safe integer, the local domain reports a runtime error rather than silently rounding. Undefined variables are runtime errors. `end` is a display-only source line and produces no execution event. `print` emits exactly one integer.

Excluded: functions, scope, arrays, strings, input, nested loops, arbitrary syntax, randomness, time, and browser execution.

## Fixtures

### `sum-1-to-3` (default)

```text
1  total = 0
2  i = 1
3  while i <= 3
4    total = total + i
5    i = i + 1
6  end
7  print total
```

Expected output `[6]`, body iterations `3`, condition results `[true, true, true, false]`, and final environment `{ total: 6, i: 4 }`.

### `zero-iterations`

The same body with `total = 10`, `i = 4`, and `while i <= 3`. The first condition is false, the body executes zero times, and output is `[10]`.

### `off-by-one`

```text
1  count = 0
2  i = 0
3  while i < 3
4    count = count + 1
5    i = i + 1
6  end
7  print count
```

Expected output `[3]`, three body iterations, and final `{ count: 3, i: 3 }`. The fixture makes condition boundaries observable without adding a conditional statement.

Test-only adversarial programs are constructed directly in domain tests: a structurally valid program with an undefined runtime read, a safe-number overflow program, and a non-progressing `while i < 3` body that never changes `i`.

## Local execution semantics

The feature owns its local `Program`, expressions, statements, `ExecutionMachine`, `ExecutionFrame`, and `StepResult` types. These names are deliberately not exported to shared code. `initialEnvironment` may contain only variables referenced by the program, with safe-integer values only; assignment targets may be absent until their first assignment, and first writes therefore have no `previousValue`. A variable read while absent is a runtime error, so `assertProgram` validates structure and extra-key safety but does not reject a missing read value. The shipped fixtures have empty initial environments because their reads follow earlier assignments. The non-progressing test program is valid author data and is intentionally allowed to reach `step-limit`; it is not rejected as malformed.

### Machine

```text
ExecutionMachine = {
  environment: Record<Identifier, number>,
  output: number[],
  control: { kind: "top"; index: number }
          | { kind: "loop-condition"; index: number }
          | { kind: "loop-body"; index: number; bodyIndex: number }
          | { kind: "halted" },
  conditionChecks: number,
  iterationCount: number,
  stepCount: number,
  status: "running" | "completed" | "step-limit" | "runtime-error",
  terminal?: TerminalEvidence,
}
```

`MAX_EXECUTION_STEPS` is a feature-local constant of `64`. It counts semantic event transitions, including a runtime-error transition, but not the synthetic limit frame. Once a running machine has made 64 semantic transitions, the next `stepProgram` call returns a deterministic `step-limit` frame at the current source location; the machine remains at the same control/environment/output with `status: "step-limit"`. The limit check happens before evaluating the current statement, so a step-limit takes precedence over an error that would have occurred on that next statement. This is a safety cutoff, not successful termination.

An empty program is outside the curated course contract; `createMachine` calls `assertProgram` and throws a feature-local `Error` for it. Because JavaScript `number` cannot preserve an out-of-range literal lexeme, curated literals are required to be safe integers; domain tests use a safe literal plus an addition that exceeds `Number.MAX_SAFE_INTEGER` to exercise unsafe arithmetic. Evaluation is left-to-right: for `add`/`subtract`, the left expression is evaluated first, then the right expression; the first undefined variable or unsafe result determines the runtime-error evidence.

### One explicit step

```text
StepResult = {
  machine: ExecutionMachine,
  frame?: ExecutionFrame,
  done: boolean,
}
```

`done` is exactly `machine.status !== "running"`. A running machine always produces one frame: either one semantic event frame, or the explicit preflight safety-cutoff frame when `stepCount` is already 64. A terminal machine returns the same machine, no frame, and `done: true`. The step-limit frame is intentionally classified as a control-safety event rather than a semantic program event.

A pure `stepProgram(machine, program)` never mutates the input machine or program. For any running transition, it returns a fresh machine; for an already-terminal machine, the documented no-op returns the same machine object by identity, with no frame, so lesson and domain tests can assert idempotence without implying a mutable runtime. For a running machine, the semantic frame index equals the machine's pre-step `stepCount`; after producing that frame, `stepCount` increases by one. Therefore a runtime-error frame at pre-step count 12 has index 12 and leaves a terminal machine with `stepCount: 13`; a synthetic step-limit frame has index 64, leaves `stepCount: 64`, and is the only frame that does not increment the counter. All environment objects, output arrays, control objects, and nested evidence objects in any fresh result are newly allocated and share no mutable references with the input.

- top-level assignment: evaluate the expression against the before environment, update one variable, and advance to the next top-level statement;
- top-level while condition: evaluate left and right against the before environment; if both operands succeed, increment `conditionChecks`; when true, increment `iterationCount` and enter body index 0; when false, record loop-exit evidence and advance past the loop. If operand evaluation fails, `conditionChecks` and `iterationCount` remain unchanged, the error frame's before/after counters are equal, and the machine becomes `runtime-error`;
- loop-body assignment: evaluate and update one variable; advance to the next body assignment or return to the loop condition;
- top-level print: evaluate and append one value; advance to the next top-level statement;
- moving past the final top-level statement changes control to `halted`, status to `completed`, and attaches `program-complete` terminal evidence to the final event frame;
- an undefined variable or unsafe arithmetic result increments `stepCount`, emits a `runtime-error` frame, changes status to `runtime-error`, and leaves the prior valid environment/output/control unchanged;
- after a terminal status, `stepProgram` is a no-op with no new frame.

A false while check is an ordinary selectable `while-condition` frame. It is a **loop-exit frame**, not necessarily whole-program termination: in the default fixture, the false `4 <= 3` frame has loop-exit evidence but the machine stays running so the next print can occur. If a false condition is the last operation in a program, the same frame also carries `program-complete` evidence. Control indices and `bodyIndex` values are zero-based, and frame indices are zero-based; source-line numbers are the explicit positive numbers in `sourceLines`. The canonical mapping is structural: `top/index` addresses `program.statements[index]`, `loop-condition/index` addresses the `WhileStatement` at that top index, and `loop-body/index/bodyIndex` addresses that while statement's body assignment. `halted` has no source line. `iterationCount` increments when a true condition enters the first body assignment, even if a later body assignment then fails.

### Evidence schemas

```text
RuntimeErrorEvidence = {
  kind: "undefined-variable" | "unsafe-number",
  variable?: Identifier,
  message: string,
}

AssignmentEvidence = {
  variable: Identifier,
  expressionText: string,
  value: number,
  previousValue?: number,
}

ConditionEvidence = {
  leftValue: number,
  operator: "<" | "<=",
  rightValue: number,
  result: boolean,
  enteredBody: boolean,
}

PrintEvidence = { expressionText: string; value: number }

TerminalEvidence =
  | { reason: "program-complete"; sourceLine: number; message: string }
  | { reason: "step-limit"; sourceLine: number; limit: 64; message: string }
  | { reason: "runtime-error"; sourceLine: number; variable?: string; message: string }

LoopExitEvidence = {
  condition: { leftValue: number; operator: "<" | "<="; rightValue: number; result: false },
  message: string,
}
```

A true condition has `enteredBody: true`; a false condition has `enteredBody: false` and a `LoopExitEvidence` message. An assignment records `previousValue` only when the variable was already present; a first assignment visibly changes `undefined`/`—` to the new value. Expression text is a feature-local formatter used for evidence, not a parser contract.

Normal completion, safety cutoff, and runtime error are distinct. The UI must say, in text, whether the whole program completed normally, the safety limit was reached, or a runtime error occurred. The selected false-condition frame must separately explain that the loop body was skipped because the condition was false.

### Frames and local trace

`ExecutionFrame` contains:

- contiguous frame index;
- source line and event kind (`assignment`, `while-condition`, `print`, `step-limit`, or `runtime-error`);
- before/after control locations;
- before/after environment snapshots;
- before/after output snapshots;
- before/after condition-check and iteration counts;
- assignment, condition, print, or loop-exit evidence when relevant;
- terminal evidence when relevant;
- a plain-language explanation.

A `runProgram` fold calls `stepProgram` until `done`, so a default trace includes the false loop-exit frame followed by the final print/program-complete frame. The synthetic step-limit frame is the 65th frame after 64 semantic transitions; it does not increment `stepCount`. Runtime-error frames count as semantic transitions and are terminal. On a final assignment or print, `afterControl` is `halted` and `machine.terminal.reason` is `program-complete`; on a final false condition, the same is true while retaining loop-exit evidence; on runtime error, `afterControl` equals the before control and normal assignment/condition/print evidence is absent; on step limit, `afterControl` equals the before control and the terminal evidence names the current source line. `machine.terminal` persists for every terminal machine and is copied into the frame's after snapshot. These rules are tested with hand-authored expectations.

`ExecutionTrace` is a feature-local immutable-by-value array of frames. It is an evidence projection, not an execution engine. The lesson's selected frame index cannot mutate it. A selected frame can explain its own transition without hidden React state: what was true before, what changed, why the branch was chosen, and what is true after.

This feature does not claim that the local frame contract matches Network events or Two's Complement ripple columns.

## Lesson state and scenario

The feature-owned scenario is `?fixture=sum-1-to-3|zero-iterations|off-by-one`. Parsing uses `URLSearchParams.get("fixture")`, therefore the first repeated query value wins; URL decoding is handled by `URLSearchParams`; an absent, empty, malformed, or unknown first value falls back to `sum-1-to-3`; extra query keys are ignored. Serialization emits only `fixture=<canonical-id>`, with no pipe-delimited multi-value syntax. Selected frame, prediction, and execution history are transient.

Lesson state owns the immutable initial scenario, selected fixture/program, current machine, local frames, selected frame index, prediction draft, optional numeric prediction, and a local prediction-input message. Actions are `load-scenario`, `set-fixture`, `set-prediction-draft`, `record-prediction`, `step`, `run-all`, `select-frame`, `inspect-focus`, and `reset`.

- `set-fixture` selects a new fixture and clears frames, selection, prediction, and machine history;
- `reset` returns to the original URL scenario captured by `load-scenario`, even after a fixture switch;
- recording a blank, non-integer, or unsafe prediction leaves execution unchanged and exposes a feature-local text message;
- prediction is optional and non-blocking: Step and Run remain available without it;
- selecting an invalid frame leaves state unchanged;
- `inspect-focus("variable-change")` selects the first loop-body assignment frame; `inspect-focus("loop-stop")` selects the first false condition frame. If the requested target does not exist (before execution, in a zero-iteration trace, or after an error), the action is a no-op and preserves the current selection. These two guided controls are a small feature-specific causal checkpoint, not a generic inspector or submit workflow;
- Step after any terminal state is idempotent and adds no frame/output;
- Run folds until a terminal state and cannot duplicate output on repeat.

No global status, phase, score, submit gate, or completion workflow is introduced.

## Learner trajectory

1. Read the fixed program and record an optional numeric output prediction.
2. Use Step through initialization, the first true loop condition, and both body assignments. The two adjacent body-assignment frames make `total: 0 → 1` and then `i: 1 → 2` explicit; **Inspect variable change** is enabled once those frames exist and selects the first of the pair.
3. Run to the end, then use **Inspect loop stop** to select the false condition and read `4 <= 3 → false`; the body is skipped because the next check uses the updated `i`.
4. Observe output `[6]` and normal program completion after the final print.
5. Reconcile the prediction with the actual output and final environment.
6. Switch to zero-iteration or off-by-one and compare the causal evidence.

The endpoint is understanding mutation and stopping cause, not merely seeing output.

## Accessibility evidence

- source is an actual semantic `<ol>`/`<li>` list with visible line numbers and a named source region;
- every trace frame is a keyboard-focusable button with an accessible name containing frame index, source line, and event kind;
- exactly the selected frame has `aria-current="true"`; unselected frames omit it;
- Enter and Space select the focused frame without moving focus unexpectedly;
- variable evidence is a named real table with `<thead>` column headers and row headers;
- condition values are written as substituted arithmetic and `true`/`false`;
- output is a labeled `<output>`;
- changed values are expressed as text (`total: 1 → 3`), not color alone;
- terminal reason and loop-exit explanation are text and remain available without animation;
- prediction validation uses a named text message, while the feature remains non-blocking;
- guided focus controls are disabled before their target frame exists and expose an accessible explanation; once enabled, they select the local target frame without manufacturing evidence;
- the selected-frame environment table is explicitly labeled as the state after that frame, while the separate final-result card is explicitly labeled as final program output/status, so selecting an earlier frame cannot create an ambiguous mixed observation.

## Independent test oracle and review gate

Domain tests use hand-authored expected event sequences for all three learner fixtures, including source lines, event kinds, conditions, body count, output, final environment, frame boundaries, loop-exit evidence, and program-complete evidence. They separately hand-author expected invalid/error and exact-limit cases. A tiny separately authored reference evaluator checks the default fixture's final values and condition sequence; production `runProgram` and `stepProgram` are not used to derive those expectations. Replay tests are additional consistency checks, not the independent oracle. `runProgram(program)` is the only complete-run API and returns `{ machine, frames }`; it repeatedly calls the same `stepProgram(machine, program)` used by lesson Step. There is no fast-path evaluator.

Required tests include:

### Domain

- each fixture's output, condition sequence, body count, final environment, frame boundary sequence, loop-exit frame, and program-complete evidence;
- zero-iteration and off-by-one boundaries;
- assignment reads the before environment;
- expression evaluation, undefined-variable errors, unsafe literal/result errors;
- exact 64-transition safety cutoff and explicit limit precedence;
- before/after control, environment, output, counters, loop-exit evidence, and terminal evidence are internally consistent;
- no mutation of prior machine/frame snapshots;
- deterministic repeatability and post-terminal no-op behavior.

### Lesson

- scenario parsing/canonicalization, first-value fallback, fixture switching, and reset-to-URL-baseline;
- fixture switching clears transient prediction/selection/history;
- prediction remains separate from model results and invalid prediction does not mutate execution;
- `inspect-focus` selects the feature-local increment and stopping frames;
- step/run/select/reset transitions are pure and idempotent at boundaries;
- stepping after completion, step-limit, or runtime error does not append frames or output;
- repeated Run does not duplicate output.

### UI

- semantic source, named trace, accessible frame buttons, `aria-current`, variable table headers, condition evidence, output, terminal reason, guided focus controls, and prediction controls;
- Tab navigation plus Enter/Space frame selection;
- one learner trajectory from prediction through variable-change and loop-stop evidence;
- zero-iteration and off-by-one evidence paths;
- reset and fixture-switch transient-state clearing;
- no second computation oracle in React, enforced by a feature source test that rejects expression evaluation, condition comparison, iteration counting, or output computation in the page component;
- no legacy shared lesson primitive imports, source editor, arbitrary code input, score, or submit/check workflow.

The independent evaluation gate returned `PASS` after the above revisions. Implementation proceeds only as this local course experiment; no primitive extraction is authorized by this document.
