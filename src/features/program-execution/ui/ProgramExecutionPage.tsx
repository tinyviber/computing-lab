import { useEffect, useMemo, useReducer } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import { getProgram, type ExecutionFrame, type MachineSnapshot, type ProgramId } from "../domain";
import { parseProgramExecutionScenario } from "../lesson/scenario";
import {
  createProgramExecutionLessonState,
  transitionProgramExecutionLesson,
} from "../lesson/state";
import "./program-execution.css";

const fixtureOptions: readonly { value: ProgramId; label: string; description: string }[] = [
  {
    value: "sum-1-to-3",
    label: "Sum 1 to 3",
    description: "Three loop passes and a final false check.",
  },
  {
    value: "zero-iterations",
    label: "Zero iterations",
    description: "The first condition is already false.",
  },
  {
    value: "off-by-one",
    label: "Off-by-one boundary",
    description: "Compare < with the loop boundary.",
  },
];

function valueText(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

function frameOutcome(frame: ExecutionFrame): string {
  if (frame.condition) {
    return `${frame.condition.leftValue} ${frame.condition.operator} ${frame.condition.rightValue} → ${
      frame.condition.result ? "true" : "false"
    }`;
  }
  if (frame.assignment) return `${frame.assignment.variable} becomes ${frame.assignment.value}`;
  if (frame.print) return `output ${frame.print.value}`;
  if (frame.runtimeError) return frame.runtimeError.message;
  return frame.terminal?.message ?? frame.explanation;
}

function frameAccessibleName(frame: ExecutionFrame): string {
  return `Frame ${frame.index + 1}, line ${frame.sourceLine}, ${frame.eventKind}: ${frameOutcome(frame)}`;
}

function EnvironmentTable({
  variables,
  snapshot,
  caption,
}: {
  variables: readonly string[];
  snapshot: MachineSnapshot;
  caption: string;
}) {
  return (
    <table className="program-environment-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Variable</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {variables.map((variable) => (
          <tr key={variable}>
            <th scope="row">{variable}</th>
            <td>{valueText(snapshot.environment[variable])}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BeforeAfterTable({
  variables,
  frame,
}: {
  variables: readonly string[];
  frame: ExecutionFrame;
}) {
  return (
    <table className="program-environment-table program-before-after-table">
      <caption>Variables before and after frame {frame.index + 1}</caption>
      <thead>
        <tr>
          <th scope="col">Variable</th>
          <th scope="col">Before</th>
          <th scope="col">After</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {variables.map((variable) => {
          const before = frame.before.environment[variable];
          const after = frame.after.environment[variable];
          return (
            <tr key={variable}>
              <th scope="row">{variable}</th>
              <td>{valueText(before)}</td>
              <td>{valueText(after)}</td>
              <td>
                {before === after ? "unchanged" : `${valueText(before)} → ${valueText(after)}`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ProgramSource({
  lines,
  activeLine,
}: {
  lines: readonly { line: number; text: string }[];
  activeLine?: number;
}) {
  return (
    <section className="program-card" aria-label="Program source">
      <div className="program-card-heading">
        <div>
          <p className="eyebrow">LAB PSEUDO-CODE</p>
          <h3>One statement or condition per step</h3>
        </div>
        <span className="program-source-note">No free-form editor</span>
      </div>
      <ol aria-label="Program source" className="program-source-list">
        {lines.map((sourceLine) => (
          <li className={sourceLine.line === activeLine ? "is-active" : ""} key={sourceLine.line}>
            <span className="program-line-number">{sourceLine.line}</span>
            <code>{sourceLine.text}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ExecutionTrace({
  frames,
  selectedFrameIndex,
  onSelect,
}: {
  frames: readonly ExecutionFrame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="program-card program-trace-card" aria-label="Execution trace">
      <div className="program-card-heading">
        <div>
          <p className="eyebrow">IMMUTABLE LOCAL TRACE</p>
          <h3>Inspect each causal event</h3>
        </div>
        <span className="program-trace-count">{frames.length} frames</span>
      </div>
      {frames.length === 0 ? (
        <p className="program-empty-trace">Press Step to create the first assignment frame.</p>
      ) : (
        <ol className="program-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={frameAccessibleName(frame)}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <span className="program-trace-index">{frame.index + 1}</span>
                <span className="program-trace-copy">
                  <strong>
                    line {frame.sourceLine} · {frame.eventKind}
                  </strong>
                  <span>{frameOutcome(frame)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function FrameEvidence({
  frame,
  variables,
}: {
  frame?: ExecutionFrame;
  variables: readonly string[];
}) {
  if (!frame) {
    return (
      <section className="program-card" aria-label="Selected frame evidence">
        <p className="eyebrow">EVIDENCE</p>
        <h3>Step once to inspect before and after state</h3>
        <p>
          A selected frame will show the statement, variable changes, condition values, output, and
          the reason the loop continues or stops.
        </p>
      </section>
    );
  }

  return (
    <section className="program-card program-evidence-card" aria-label="Selected frame evidence">
      <div className="program-card-heading">
        <div>
          <p className="eyebrow">SELECTED EVIDENCE</p>
          <h3>
            Frame {frame.index + 1}, line {frame.sourceLine}
          </h3>
        </div>
        <span className="program-event-chip">{frame.eventKind}</span>
      </div>
      <p className="program-explanation">{frame.explanation}</p>
      {frame.condition ? (
        <div className="program-condition-evidence" role="note">
          <strong>Condition evidence</strong>
          <span>
            {frame.condition.leftValue} {frame.condition.operator} {frame.condition.rightValue} →{" "}
            {frame.condition.result ? "true" : "false"}
          </span>
          <small>
            {frame.condition.enteredBody
              ? "The next frame enters the loop body."
              : "The loop body is skipped at this check."}
          </small>
        </div>
      ) : null}
      {frame.assignment ? (
        <div className="program-assignment-evidence" role="note">
          <strong>Assignment evidence</strong>
          <span>
            {frame.assignment.variable}: {valueText(frame.assignment.previousValue)} →{" "}
            {frame.assignment.value}
          </span>
          <small>
            {frame.assignment.variable} = {frame.assignment.expressionText}
          </small>
        </div>
      ) : null}
      {frame.print ? (
        <div className="program-output-evidence" role="note">
          <strong>Output evidence</strong>
          <span>
            {frame.print.expressionText} emitted {frame.print.value}
          </span>
        </div>
      ) : null}
      {frame.loopExit ? <p className="program-loop-exit">{frame.loopExit.message}</p> : null}
      {frame.runtimeError ? (
        <p className="program-runtime-error">{frame.runtimeError.message}</p>
      ) : null}
      <BeforeAfterTable frame={frame} variables={variables} />
    </section>
  );
}

function ProgramExecutionContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseProgramExecutionScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionProgramExecutionLesson,
    scenario,
    createProgramExecutionLessonState,
  );
  const program = getProgram(lesson.fixture);
  const selectedFrame =
    lesson.selectedFrameIndex === undefined ? undefined : lesson.frames[lesson.selectedFrameIndex];
  const displaySnapshot = selectedFrame?.after ?? lesson.machine;
  const variableChangeAvailable = lesson.frames.some(
    (frame) => frame.eventKind === "assignment" && frame.before.control.kind === "loop-body",
  );
  const loopStopAvailable = lesson.frames.some(
    (frame) => frame.eventKind === "while-condition" && frame.condition?.result === false,
  );

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [scenario.fixture]);

  const terminal = lesson.machine.terminal;
  const observedOutput = lesson.machine.output[0];

  return (
    <LabShell eyebrow="PROGRAMMING / 01" subtitle="Loop and variable tracing" title="程序执行">
      <div className="program-course">
        <header className="program-intro">
          <p className="eyebrow">REFERENCE COURSE</p>
          <h2>为什么这个循环最终会输出这个值？</h2>
          <p>
            这是一段受限的实验伪代码。每一步只执行一条赋值、一次 while
            条件检查或一次输出；你可以观察 变量如何改变，以及最后一次 false 条件为什么跳过循环体。
          </p>
        </header>

        <div className="program-layout">
          <aside className="program-controls" aria-label="Program controls">
            <section className="program-card">
              <p className="eyebrow">FIXTURE</p>
              <h3>Choose a small program</h3>
              <div className="program-fixture-list" role="group" aria-label="Program fixture">
                {fixtureOptions.map((option) => (
                  <button
                    aria-pressed={lesson.fixture === option.value}
                    className={lesson.fixture === option.value ? "is-active" : ""}
                    key={option.value}
                    onClick={() => dispatch({ type: "set-fixture", fixture: option.value })}
                    type="button"
                  >
                    <strong>{option.label}</strong>
                    <span>{option.description}</span>
                  </button>
                ))}
              </div>
              <button
                className="program-reset-button"
                onClick={() => dispatch({ type: "reset" })}
                type="button"
              >
                Reset to URL scenario
              </button>
            </section>

            <section className="program-card">
              <p className="eyebrow">PREDICT</p>
              <h3>What will be printed?</h3>
              <label className="program-field-label" htmlFor="program-prediction">
                Predicted output value
              </label>
              <div className="program-prediction-row">
                <input
                  id="program-prediction"
                  inputMode="numeric"
                  type="number"
                  onChange={(event) =>
                    dispatch({ type: "set-prediction-draft", value: event.target.value })
                  }
                  value={lesson.predictionDraft}
                />
                <button onClick={() => dispatch({ type: "record-prediction" })} type="button">
                  Record prediction
                </button>
              </div>
              <p className="program-help-text">
                Prediction is optional and never blocks Step or Run.
              </p>
              {lesson.predictionMessage ? (
                <p aria-live="polite" className="program-prediction-message">
                  {lesson.predictionMessage}
                </p>
              ) : null}
            </section>

            <section className="program-card">
              <p className="eyebrow">INTERVENE</p>
              <h3>Advance the machine</h3>
              <div className="program-action-row">
                <button onClick={() => dispatch({ type: "step" })} type="button">
                  Step
                </button>
                <button onClick={() => dispatch({ type: "run-all" })} type="button">
                  Run to end
                </button>
              </div>
              <p className="program-help-text">
                Step and Run use the same local pure transition. Selecting a frame is read-only.
              </p>
              <div className="program-guided-actions">
                <button
                  aria-describedby="program-guided-help"
                  disabled={!variableChangeAvailable}
                  onClick={() => dispatch({ type: "inspect-focus", focus: "variable-change" })}
                  type="button"
                >
                  Inspect variable change
                </button>
                <button
                  aria-describedby="program-guided-help"
                  disabled={!loopStopAvailable}
                  onClick={() => dispatch({ type: "inspect-focus", focus: "loop-stop" })}
                  type="button"
                >
                  Inspect loop stop
                </button>
              </div>
              <p className="program-help-text" id="program-guided-help">
                Guided inspection becomes available after its evidence frame exists.
              </p>
            </section>
          </aside>

          <div className="program-main" aria-label="Program execution workspace" role="region">
            <ProgramSource activeLine={selectedFrame?.sourceLine} lines={program.sourceLines} />

            <section className="program-observation-grid" aria-label="Current machine observation">
              <div className="program-card">
                <div className="program-card-heading">
                  <div>
                    <p className="eyebrow">CURRENT ENVIRONMENT</p>
                    <h3>After the selected frame</h3>
                  </div>
                  <span className="program-control-chip">
                    {displaySnapshot.status === "running" ? "running" : displaySnapshot.status}
                  </span>
                </div>
                <EnvironmentTable
                  caption={
                    selectedFrame
                      ? `Variables after frame ${selectedFrame.index + 1}`
                      : "Initial variables"
                  }
                  snapshot={displaySnapshot}
                  variables={program.variables}
                />
                <dl className="program-summary-list">
                  <div>
                    <dt>condition checks</dt>
                    <dd>{displaySnapshot.conditionChecks}</dd>
                  </div>
                  <div>
                    <dt>loop body entries</dt>
                    <dd>{displaySnapshot.iterationCount}</dd>
                  </div>
                  <div>
                    <dt>steps</dt>
                    <dd>{displaySnapshot.stepCount}</dd>
                  </div>
                </dl>
              </div>

              <div className="program-card program-output-card">
                <p className="eyebrow">FINAL PROGRAM RESULT</p>
                <h3>Final program output and status</h3>
                <output aria-label="Program output">
                  {lesson.machine.output.length === 0 ? "—" : lesson.machine.output.join(", ")}
                </output>
                {terminal?.reason === "program-complete" ? (
                  <p className="program-complete-message">{terminal.message}</p>
                ) : terminal ? (
                  <p className="program-terminal-message">{terminal.message}</p>
                ) : (
                  <p className="program-help-text">The program is still running.</p>
                )}
                {lesson.prediction !== undefined && lesson.machine.status === "completed" ? (
                  <p className="program-prediction-result">
                    Prediction: {lesson.prediction}; observed: {observedOutput}.{" "}
                    {lesson.prediction === observedOutput
                      ? "Your prediction matches."
                      : "Compare the selected evidence to find the first divergence."}
                  </p>
                ) : null}
              </div>
            </section>

            <ExecutionTrace
              frames={lesson.frames}
              onSelect={(index) => dispatch({ type: "select-frame", index })}
              selectedFrameIndex={lesson.selectedFrameIndex}
            />
            <FrameEvidence frame={selectedFrame} variables={program.variables} />
          </div>
        </div>
      </div>
    </LabShell>
  );
}

export function ProgramExecutionPage() {
  const search = useSearch({ from: "/labs/program-execution" }) as Record<string, unknown>;
  return <ProgramExecutionContent search={search} />;
}
