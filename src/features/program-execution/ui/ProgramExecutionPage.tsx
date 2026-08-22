import { useEffect, useMemo, useReducer } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import { getProgram, type ExecutionFrame, type MachineSnapshot, type ProgramId } from "../domain";
import { parseProgramExecutionScenario } from "../lesson/scenario";
import {
  createProgramExecutionLessonState,
  transitionProgramExecutionLesson,
  type ProgramPrediction,
  type ProgramPredictionFeedback,
  type ProgramPredictionTarget,
} from "../lesson/state";
import "./program-execution.css";

const fixtureOptions: readonly { value: ProgramId; label: string; description: string }[] = [
  {
    value: "sum-1-to-3",
    label: "从 1 加到 3",
    description: "带有条件检查和输出的短程序。",
  },
  {
    value: "zero-iterations",
    label: "零次循环",
    description: "另一种初始状态下的执行记录。",
  },
  {
    value: "off-by-one",
    label: "边界比较",
    description: "循环条件与边界值的执行记录。",
  },
];

function valueText(value: number | undefined): string {
  return value === undefined ? "—" : String(value);
}

function frameOutcome(frame: ExecutionFrame): string {
  if (frame.condition) {
    return `${frame.condition.leftValue} ${frame.condition.operator} ${frame.condition.rightValue} → ${
      frame.condition.result ? "真" : "假"
    }`;
  }
  if (frame.assignment) return `${frame.assignment.variable} 变为 ${frame.assignment.value}`;
  if (frame.print) return `输出 ${frame.print.value}`;
  if (frame.runtimeError) return "执行时发生错误。";
  return frame.terminal ? "程序到达结束状态。" : "状态已更新。";
}

function eventKindLabel(kind: ExecutionFrame["eventKind"]): string {
  return {
    assignment: "赋值",
    "while-condition": "循环条件",
    print: "输出",
    terminal: "结束",
    "runtime-error": "运行错误",
  }[kind];
}

function frameExplanation(frame: ExecutionFrame): string {
  const terminalSuffix = frame.terminal ? ` ${frame.terminal.message}` : "";
  if (frame.condition) {
    return `${
      frame.condition.enteredBody
        ? "条件为真，下一步进入循环体。"
        : "条件为假，循环体在这次检查中被跳过。"
    }${terminalSuffix}`;
  }
  if (frame.assignment) {
    return `执行 ${frame.assignment.variable} = ${frame.assignment.expressionText}；变量已更新。${terminalSuffix}`;
  }
  if (frame.print) return `执行输出语句，产生 ${frame.print.value}。${terminalSuffix}`;
  return (
    frame.terminal?.message ??
    (frame.runtimeError ? "程序执行遇到运行错误。" : "程序到达结束状态。")
  );
}

function terminalMessage(reason: string): string {
  if (reason === "program-complete") return "程序已完成。";
  if (reason === "step-limit") return "已达到 64 步安全上限，无法证明程序终止。";
  return "程序因运行时错误停止。";
}

function statusLabel(status: string): string {
  if (status === "running") return "运行中";
  if (status === "completed") return "已完成";
  if (status === "step-limit") return "达到安全上限";
  return "运行错误";
}

function predictionTargetLabel(target: ProgramPredictionTarget | undefined): string {
  if (!target) return "程序已终止，没有下一条语句。";
  if (target.kind === "assignment")
    return `第 ${target.sourceLine} 行：预测 ${target.variable} 的新值`;
  if (target.kind === "condition") return `第 ${target.sourceLine} 行：预测循环条件的真假`;
  return `第 ${target.sourceLine} 行：预测输出值`;
}

function predictionValueText(prediction: ProgramPrediction): string {
  if (prediction.kind === "condition") return prediction.result ? "真" : "假";
  return String(prediction.value);
}

function predictionFeedbackText(feedback: ProgramPredictionFeedback): string {
  return `预测 ${predictionValueText(feedback.prediction)}；实际 ${predictionValueText(feedback.actual)}。${feedback.matches ? "一致。" : "不一致，请查看执行前 / 执行后证据。"}`;
}

function frameAccessibleName(frame: ExecutionFrame): string {
  return `第 ${frame.index + 1} 步，第 ${frame.sourceLine} 行，${eventKindLabel(frame.eventKind)}：${frameOutcome(frame)}`;
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
          <th scope="col">变量</th>
          <th scope="col">数值</th>
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
      <caption>第 {frame.index + 1} 步前后的变量</caption>
      <thead>
        <tr>
          <th scope="col">变量</th>
          <th scope="col">之前</th>
          <th scope="col">之后</th>
          <th scope="col">变化</th>
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
              <td>{before === after ? "未变化" : `${valueText(before)} → ${valueText(after)}`}</td>
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
    <section className="program-card" aria-label="程序步骤">
      <div className="program-card-heading">
        <div>
          <p className="eyebrow">程序步骤</p>
          <h3>执行步骤</h3>
        </div>
        <span className="program-source-note">按步骤查看</span>
      </div>
      <ol aria-label="程序步骤" className="program-source-list">
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
    <section className="program-card program-trace-card" aria-label="执行记录">
      <div className="program-card-heading">
        <div>
          <p className="eyebrow">执行记录</p>
          <h3>执行记录</h3>
        </div>
        <span className="program-trace-count">{frames.length} 步</span>
      </div>
      {frames.length === 0 ? (
        <p className="program-empty-trace">点击“执行一步”，创建第一个执行步骤。</p>
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
                    第 {frame.sourceLine} 行 · {eventKindLabel(frame.eventKind)}
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
      <section className="program-card" aria-label="选中步骤详情">
        <p className="eyebrow">步骤详情</p>
        <h3>执行一步，检查执行前后的状态</h3>
        <p>选中的步骤会显示语句、变量变化、条件值、输出，以及循环继续或停止的原因。</p>
      </section>
    );
  }

  return (
    <section className="program-card program-evidence-card" aria-label="选中步骤详情">
      <div className="program-card-heading">
        <div>
          <p className="eyebrow">选中结果</p>
          <h3>
            第 {frame.index + 1} 步，第 {frame.sourceLine} 行
          </h3>
        </div>
        <span className="program-event-chip">{eventKindLabel(frame.eventKind)}</span>
      </div>
      <p className="program-explanation">{frameExplanation(frame)}</p>
      {frame.condition ? (
        <div className="program-condition-evidence" role="note">
          <strong>条件结果</strong>
          <span>
            {frame.condition.leftValue} {frame.condition.operator} {frame.condition.rightValue} →{" "}
            {frame.condition.result ? "真" : "假"}
          </span>
          <small>
            {frame.condition.enteredBody ? "下一步进入循环体。" : "这次检查跳过循环体。"}
          </small>
        </div>
      ) : null}
      {frame.assignment ? (
        <div className="program-assignment-evidence" role="note">
          <strong>赋值结果</strong>
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
          <strong>输出结果</strong>
          <span>
            {frame.print.expressionText} 产生 {frame.print.value}
          </span>
        </div>
      ) : null}
      {frame.loopExit ? (
        <p className="program-loop-exit">
          {frame.loopExit.message} 这是循环退出，不一定是整个程序结束。
        </p>
      ) : null}
      {frame.terminal ? (
        <p
          className={
            frame.terminal.reason === "program-complete"
              ? "program-complete-message"
              : "program-runtime-error"
          }
        >
          {frame.terminal.message}
        </p>
      ) : frame.runtimeError ? (
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
  const predictionTarget = lesson.predictionTarget;
  const canExecute = lesson.machine.status === "running";

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [scenario.fixture]);

  const terminal = lesson.machine.terminal;
  return (
    <LabShell eyebrow="程序设计 / 01" subtitle="循环与变量追踪" title="程序执行">
      <div className="program-course">
        <header className="program-intro">
          <h2>预测下一状态，逐行执行</h2>
          <p>先预测当前赋值、循环条件或输出，再执行一步，对照执行前 / 执行后状态与循环结束原因。</p>
        </header>

        <div className="program-layout">
          <aside className="program-controls" aria-label="程序控制">
            <section className="program-card">
              <p className="eyebrow">样例</p>
              <h3>选择一段短程序</h3>
              <div className="program-fixture-list" role="group" aria-label="程序样例">
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
                恢复初始情境
              </button>
            </section>

            <section className="program-card">
              <p className="eyebrow">预测</p>
              <h3>预测下一条语句</h3>
              <p className="program-prediction-target">{predictionTargetLabel(predictionTarget)}</p>
              {predictionTarget?.kind === "condition" ? (
                <>
                  <span className="program-field-label">预测循环条件</span>
                  <div className="program-prediction-row">
                    <div
                      aria-label="预测循环条件"
                      className="program-prediction-choice"
                      role="group"
                    >
                      <button
                        aria-pressed={lesson.predictionDraft === "真"}
                        onClick={() => dispatch({ type: "set-prediction-draft", value: "真" })}
                        type="button"
                      >
                        真
                      </button>
                      <button
                        aria-pressed={lesson.predictionDraft === "假"}
                        onClick={() => dispatch({ type: "set-prediction-draft", value: "假" })}
                        type="button"
                      >
                        假
                      </button>
                    </div>
                    <button
                      disabled={!predictionTarget}
                      onClick={() => dispatch({ type: "record-prediction" })}
                      type="button"
                    >
                      记录预测
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <label className="program-field-label" htmlFor="program-prediction">
                    输入安全整数
                  </label>
                  <div className="program-prediction-row">
                    <input
                      disabled={!predictionTarget}
                      id="program-prediction"
                      inputMode="numeric"
                      type="number"
                      onChange={(event) =>
                        dispatch({ type: "set-prediction-draft", value: event.target.value })
                      }
                      value={lesson.predictionDraft}
                    />
                    <button
                      disabled={!predictionTarget}
                      onClick={() => dispatch({ type: "record-prediction" })}
                      type="button"
                    >
                      记录预测
                    </button>
                  </div>
                </>
              )}

              <p className="program-help-text">预测可选；两种执行方式都不会等待或阻塞预测。</p>
              {lesson.predictionMessage ? (
                <p aria-live="polite" className="program-prediction-message">
                  {lesson.predictionMessage}
                </p>
              ) : null}
            </section>

            <section className="program-card">
              <p className="eyebrow">推进</p>
              <h3>继续执行</h3>
              <div className="program-action-row">
                <button
                  disabled={!canExecute}
                  onClick={() => dispatch({ type: "step" })}
                  type="button"
                >
                  执行一步
                </button>
                <button
                  disabled={!canExecute}
                  onClick={() => dispatch({ type: "run-all" })}
                  type="button"
                >
                  运行到结束
                </button>
              </div>
              <p className="program-help-text">
                “执行一步”和“运行到结束”使用相同规则；点击已完成步骤只查看历史。
              </p>
              <div className="program-guided-actions">
                <button
                  aria-describedby="program-guided-help"
                  disabled={!variableChangeAvailable}
                  onClick={() => dispatch({ type: "inspect-focus", focus: "variable-change" })}
                  type="button"
                >
                  检查变量变化
                </button>
                <button
                  aria-describedby="program-guided-help"
                  disabled={!loopStopAvailable}
                  onClick={() => dispatch({ type: "inspect-focus", focus: "loop-stop" })}
                  type="button"
                >
                  检查循环停止
                </button>
              </div>
              <p className="program-help-text" id="program-guided-help">
                对应执行步骤出现后，才能使用引导检查。
              </p>
            </section>
          </aside>

          <div className="program-main" aria-label="程序执行记录" role="region">
            <ProgramSource activeLine={selectedFrame?.sourceLine} lines={program.sourceLines} />

            <section className="program-observation-grid" aria-label="当前执行情况">
              <div className="program-card">
                <div className="program-card-heading">
                  <div>
                    <p className="eyebrow">当前环境</p>
                    <h3>这一步之后的变量</h3>
                  </div>
                  <span className="program-control-chip">
                    {statusLabel(displaySnapshot.status)}
                  </span>
                </div>
                <EnvironmentTable
                  caption={
                    selectedFrame ? `第 ${selectedFrame.index + 1} 步之后的变量` : "初始变量"
                  }
                  snapshot={displaySnapshot}
                  variables={program.variables}
                />
                <dl className="program-summary-list">
                  <div>
                    <dt>条件检查次数</dt>
                    <dd>{displaySnapshot.conditionChecks}</dd>
                  </div>
                  <div>
                    <dt>进入循环体次数</dt>
                    <dd>{displaySnapshot.iterationCount}</dd>
                  </div>
                  <div>
                    <dt>步数</dt>
                    <dd>{displaySnapshot.stepCount}</dd>
                  </div>
                </dl>
              </div>

              <div className="program-card program-output-card">
                <p className="eyebrow">最终程序结果</p>
                <h3>最终输出与状态</h3>
                <output aria-label="程序输出">
                  {lesson.machine.output.length === 0 ? "—" : lesson.machine.output.join(", ")}
                </output>
                {terminal?.reason === "program-complete" ? (
                  <p className="program-complete-message">{terminalMessage(terminal.reason)}</p>
                ) : terminal ? (
                  <p className="program-terminal-message">{terminalMessage(terminal.reason)}</p>
                ) : (
                  <p className="program-help-text">程序仍在运行。</p>
                )}
                {lesson.predictionFeedback ? (
                  <p className="program-prediction-result">
                    {predictionFeedbackText(lesson.predictionFeedback)}
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
