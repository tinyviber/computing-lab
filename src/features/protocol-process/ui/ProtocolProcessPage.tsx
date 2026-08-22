import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  PROTOCOL_SCENARIO_SUMMARIES,
  type ProtocolEventEvidence,
  type ProtocolFrame,
  type ProtocolScenarioId,
  type ProtocolSnapshot,
} from "../domain";
import { parseProtocolScenario } from "../lesson/scenario";
import {
  createProtocolLessonState,
  transitionProtocolLesson,
  type ProtocolLessonState,
} from "../lesson/state";
import "./protocol-process.css";

const scenarioOptions: readonly {
  value: ProtocolScenarioId;
  label: string;
  description: string;
}[] = [
  {
    value: "ack-loss",
    label: "情境 A",
    description: "确认丢失后重试。",
  },
  {
    value: "no-loss",
    label: "情境 B",
    description: "请求和确认均送达。",
  },
  {
    value: "request-loss",
    label: "情境 C",
    description: "请求丢失后重试。",
  },
  {
    value: "receiver-silent",
    label: "情境 D",
    description: "接收方不响应，直到耗尽重试。",
  },
];

const MESSAGE_LABEL = "M42 · MEET AT 3";

const EVENT_KIND_LABELS: Record<ProtocolEventEvidence["kind"], string> = {
  "send-request": "发送请求",
  "deliver-request": "送达请求",
  "send-ack": "发送确认",
  "deliver-ack": "送达确认",
  timeout: "超时",
};

const EVENT_OUTCOME_LABELS: Record<ProtocolEventEvidence["outcome"], string> = {
  queued: "已排队",
  accepted: "已接受",
  "duplicate-suppressed": "重复请求被抑制",
  "receiver-unavailable": "接收方不可用",
  dropped: "已丢失",
  "retry-scheduled": "已安排重试",
  completed: "已完成",
  failed: "已失败",
};

function eventKindLabel(kind: ProtocolEventEvidence["kind"]): string {
  return EVENT_KIND_LABELS[kind];
}

function eventOutcomeLabel(outcome: ProtocolEventEvidence["outcome"]): string {
  return EVENT_OUTCOME_LABELS[outcome];
}

function eventExplanation(event: ProtocolEventEvidence): string {
  if (event.kind === "send-request") {
    return event.outcome === "dropped"
      ? `第 ${event.attempt} 次请求在送达前丢失。`
      : `发送方把第 ${event.attempt} 次请求放入通道队列。`;
  }
  if (event.kind === "deliver-request") {
    if (event.outcome === "receiver-unavailable") {
      return `接收方不可用，第 ${event.attempt} 次请求没有产生确认。`;
    }
    return event.outcome === "duplicate-suppressed"
      ? `接收方已经接受过 ${MESSAGE_LABEL}；第 ${event.attempt} 次重复请求没有再次生效。`
      : `接收方接受了来自第 ${event.attempt} 次尝试的 ${MESSAGE_LABEL}。`;
  }
  if (event.kind === "send-ack") {
    return `接收方发送了第 ${event.attempt} 个确认，确认对象是 ${MESSAGE_LABEL}。`;
  }
  if (event.kind === "deliver-ack") {
    return event.outcome === "dropped"
      ? `第 ${event.attempt} 个确认在发送方观察到之前丢失。`
      : `发送方观察到 ${MESSAGE_LABEL} 的第 ${event.attempt} 个确认。`;
  }
  return event.outcome === "retry-scheduled"
    ? `确认没有到达；系统安排第 ${event.attempt + 1} 次请求重试。`
    : "达到最大尝试次数后仍没有确认。";
}

function outcomeText(event: ProtocolEventEvidence): string {
  return `${eventOutcomeLabel(event.outcome)} · ${eventExplanation(event)}`;
}

function TraceList({
  frames,
  selectedFrameIndex,
  onSelect,
}: {
  frames: readonly ProtocolFrame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="protocol-card protocol-trace-card" aria-label="协议事件记录">
      <div className="protocol-card-heading">
        <div>
          <p className="eyebrow">事件队列记录</p>
          <h3>逐个检查已安排的事件</h3>
        </div>
        <span className="protocol-trace-count">{frames.length} 个事件</span>
      </div>
      {frames.length === 0 ? (
        <p className="protocol-empty-trace">点击“执行一步”，处理第一个请求事件。</p>
      ) : (
        <ol className="protocol-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`第 ${frame.index + 1} 步，时刻 ${frame.event.at}，${eventKindLabel(frame.event.kind)}：${outcomeText(frame.event)}`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <span className="protocol-trace-index">{frame.index + 1}</span>
                <span className="protocol-trace-copy">
                  <strong>
                    时刻 {frame.event.at} · {eventKindLabel(frame.event.kind)} · 第{" "}
                    {frame.event.attempt} 次尝试
                  </strong>
                  <span>{eventOutcomeLabel(frame.event.outcome)}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function QueueTable({ snapshot, caption }: { snapshot: ProtocolSnapshot; caption: string }) {
  return (
    <table className="protocol-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">到达时刻</th>
          <th scope="col">事件</th>
          <th scope="col">尝试次数</th>
          <th scope="col">序号</th>
        </tr>
      </thead>
      <tbody>
        {snapshot.queue.length === 0 ? (
          <tr>
            <th scope="row">队列</th>
            <td colSpan={3}>空</td>
          </tr>
        ) : (
          snapshot.queue.map((event) => (
            <tr key={`${event.sequence}-${event.kind}`}>
              <th scope="row">{event.dueAt}</th>
              <td>{eventKindLabel(event.kind)}</td>
              <td>{event.attempt}</td>
              <td>{event.sequence}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function CounterTable({ snapshot }: { snapshot: ProtocolSnapshot }) {
  return (
    <table className="protocol-table">
      <caption>选中事件后的协议计数</caption>
      <thead>
        <tr>
          <th scope="col">指标</th>
          <th scope="col">数值</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">当前模拟时间</th>
          <td>第 {snapshot.now} 个时间单位</td>
        </tr>
        <tr>
          <th scope="row">已发送请求次数</th>
          <td>{snapshot.attemptsSent}</td>
        </tr>
        <tr>
          <th scope="row">接收方接受次数</th>
          <td>{snapshot.acceptedCount}</td>
        </tr>
        <tr>
          <th scope="row">被抑制的重复请求</th>
          <td>{snapshot.duplicateCount}</td>
        </tr>
        <tr>
          <th scope="row">已发送确认数</th>
          <td>{snapshot.acknowledgmentsSent}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ScenarioComparisonTable({ current }: { current: ProtocolScenarioId }) {
  return (
    <table className="protocol-table">
      <caption>情境比较</caption>
      <thead>
        <tr>
          <th scope="col">情境</th>
          <th scope="col">结果</th>
          <th scope="col">尝试次数</th>
          <th scope="col">接受次数</th>
          <th scope="col">重复次数</th>
          <th scope="col">发送确认数</th>
          <th scope="col">结束时刻</th>
        </tr>
      </thead>
      <tbody>
        {scenarioOptions.map((option) => {
          const summary = PROTOCOL_SCENARIO_SUMMARIES[option.value];
          return (
            <tr key={option.value} data-current={current === option.value ? "true" : undefined}>
              <th scope="row">{option.label}</th>
              <td>{summary.status === "delivered" ? "已送达" : "已失败"}</td>
              <td>{summary.attempts}</td>
              <td>{summary.accepted}</td>
              <td>{summary.duplicates}</td>
              <td>{summary.acknowledgments}</td>
              <td>{summary.finalTime}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SelectedEvidence({ frame }: { frame?: ProtocolFrame }) {
  if (!frame) {
    return (
      <section className="protocol-card" aria-label="选中事件结果">
        <p className="eyebrow">选中结果</p>
        <h3>执行一步，检查队列与时钟</h3>
        <p>每个事件显示时间、结果和前后队列。</p>
      </section>
    );
  }

  return (
    <section className="protocol-card protocol-evidence-card" aria-label="选中事件结果">
      <div className="protocol-card-heading">
        <div>
          <p className="eyebrow">选中结果</p>
          <h3>
            第 {frame.index + 1} 步 · 时刻 {frame.event.at}
          </h3>
        </div>
        <span className="protocol-event-chip">{eventKindLabel(frame.event.kind)}</span>
      </div>
      <p className="protocol-explanation">{eventExplanation(frame.event)}</p>
      <div className="protocol-event-evidence" role="note">
        <strong>事件结果</strong>
        <span>
          {eventOutcomeLabel(frame.event.outcome)} · 第 {frame.event.attempt} 次尝试 ·{" "}
          {MESSAGE_LABEL}
        </span>
      </div>
      <div className="protocol-snapshot-grid">
        <QueueTable snapshot={frame.before} caption={`第 ${frame.index + 1} 步之前的队列`} />
        <QueueTable snapshot={frame.after} caption={`第 ${frame.index + 1} 步之后的队列`} />
      </div>
      <CounterTable snapshot={frame.after} />
    </section>
  );
}

function ProtocolProcessPageContent({
  lesson,
  dispatch,
}: {
  lesson: ProtocolLessonState;
  dispatch: Dispatch<Parameters<typeof transitionProtocolLesson>[1]>;
}) {
  const selectedFrame = lesson.frames.find((frame) => frame.index === lesson.selectedFrameIndex);
  const hasFault = lesson.frames.some(
    (frame) => frame.event.outcome === "dropped" || frame.event.outcome === "receiver-unavailable",
  );
  const hasRetry = lesson.frames.some((frame) => frame.event.kind === "timeout");

  return (
    <div className="protocol-page">
      <header className="protocol-hero">
        <div>
          <p className="eyebrow">协议过程 · 可靠送达</p>
          <h2>确认迟到时的发送方状态</h2>
          <p>跟踪一条消息经历延迟、丢失、超时、重试、重复抑制与确认的过程。时钟是模拟的。</p>
        </div>
        <div className="protocol-message-card" aria-label="消息定义">
          <span>消息</span>
          <strong>{MESSAGE_LABEL}</strong>
          <small>A 通过一个抽象通道向 B 发送。</small>
        </div>
      </header>

      <div className="protocol-layout">
        <aside className="protocol-controls" aria-label="实验控制">
          <section className="protocol-card">
            <p className="eyebrow">预测</p>
            <h3>送达状态</h3>
            <label htmlFor="protocol-prediction">你的预测</label>
            <select
              aria-describedby="protocol-prediction-help"
              id="protocol-prediction"
              onChange={(event) =>
                dispatch({ type: "set-prediction-draft", value: event.target.value })
              }
              value={lesson.predictionDraft}
            >
              <option value="">请选择</option>
              <option value="delivered">会送达</option>
              <option value="failed">会失败</option>
            </select>
            <label htmlFor="protocol-prediction-attempts">请求次数</label>
            <select
              id="protocol-prediction-attempts"
              onChange={(event) =>
                dispatch({ type: "set-prediction-attempts-draft", value: event.target.value })
              }
              value={lesson.predictionAttemptsDraft}
            >
              <option value="">请选择</option>
              <option value="1">1 次</option>
              <option value="2">2 次</option>
            </select>
            <label htmlFor="protocol-timeout-conclusion">超时发生时，发送方能确定什么？</label>
            <select
              aria-describedby="protocol-prediction-help"
              id="protocol-timeout-conclusion"
              onChange={(event) =>
                dispatch({ type: "set-timeout-conclusion-draft", value: event.target.value })
              }
              value={lesson.timeoutConclusionDraft}
            >
              <option value="">请选择</option>
              <option value="status-unknown">送达状态仍未知</option>
              <option value="receiver-failed">接收方失败</option>
            </select>
            <p id="protocol-prediction-help">可先记录预测，再运行。</p>
            <button
              className="protocol-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              记录预测
            </button>
            {lesson.predictionMessage ? (
              <p role="status">预测已记录；事件记录仍可继续检查。</p>
            ) : null}
          </section>

          <section className="protocol-card">
            <p className="eyebrow">情境</p>
            <h3>选择情境</h3>
            <label htmlFor="protocol-scenario">消息情境</label>
            <select
              id="protocol-scenario"
              onChange={(event) =>
                dispatch({
                  type: "set-scenario",
                  scenario: event.target.value as ProtocolScenarioId,
                })
              }
              value={lesson.scenario}
            >
              {scenarioOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p>{scenarioOptions.find((option) => option.value === lesson.scenario)?.description}</p>
          </section>

          <section className="protocol-card protocol-action-card">
            <p className="eyebrow">推进</p>
            <h3>推进协议过程</h3>
            <div className="protocol-action-row">
              <button
                className="protocol-primary-button"
                disabled={lesson.machine.status !== "running"}
                onClick={() => dispatch({ type: "step" })}
                type="button"
              >
                执行一步
              </button>
              <button
                className="protocol-secondary-button"
                disabled={lesson.machine.status !== "running"}
                onClick={() => dispatch({ type: "run-all" })}
                type="button"
              >
                运行到结束
              </button>
            </div>
            <button
              className="protocol-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              恢复初始情境
            </button>
          </section>

          <section className="protocol-card protocol-guidance-card">
            <p className="eyebrow">引导检查</p>
            <h3>检查事件</h3>
            <button
              disabled={!hasFault}
              onClick={() => dispatch({ type: "inspect-first-fault" })}
              type="button"
            >
              检查第一个故障
            </button>
            <button
              aria-describedby="protocol-guided-help"
              disabled={!hasRetry}
              onClick={() => dispatch({ type: "inspect-retry" })}
              type="button"
            >
              检查重试
            </button>
          </section>
        </aside>

        <div className="protocol-main-column">
          <section className="protocol-card protocol-status-card" aria-label="协议状态">
            <div>
              <p className="eyebrow">当前状态</p>
              <strong>
                {lesson.machine.status === "running"
                  ? "运行中"
                  : lesson.machine.status === "delivered"
                    ? "已送达"
                    : "已失败"}
              </strong>
            </div>
            <dl>
              <div>
                <dt>当前模拟时间</dt>
                <dd>第 {lesson.machine.now} 个时间单位</dd>
              </div>
              <div>
                <dt>已处理事件</dt>
                <dd>{lesson.machine.processedEvents}</dd>
              </div>
              <div>
                <dt>队列条目</dt>
                <dd>{lesson.machine.queue.length}</dd>
              </div>
            </dl>
          </section>

          <TraceList
            frames={lesson.frames}
            onSelect={(index) => dispatch({ type: "select-frame", index })}
            selectedFrameIndex={lesson.selectedFrameIndex}
          />
          <SelectedEvidence frame={selectedFrame} />

          <section className="protocol-card protocol-final-card" aria-label="最终协议结果">
            <p className="eyebrow">最终协议结果</p>
            <h3>最终送达与重试结果</h3>
            <p>
              状态：
              <strong>
                {lesson.machine.status === "running"
                  ? "运行中"
                  : lesson.machine.status === "delivered"
                    ? "已送达"
                    : "已失败"}
              </strong>{" "}
              · 尝试次数：
              {lesson.machine.attemptsSent} · 接受次数：{lesson.machine.acceptedCount} · 重复抑制：
              {lesson.machine.duplicateCount} · 已发送确认： {lesson.machine.acknowledgmentsSent}
            </p>
            {lesson.machine.terminal ? (
              <p>
                {lesson.machine.terminal.reason === "delivered"
                  ? `在时刻 ${lesson.machine.terminal.at} 观察到确认，消息完成送达。`
                  : `在时刻 ${lesson.machine.terminal.at} 达到最大尝试次数，仍未观察到确认。`}
              </p>
            ) : (
              <p>运行消息交换后显示结束原因。</p>
            )}
            {lesson.prediction ? (
              <p role="status">
                预测：{lesson.prediction === "delivered" ? "会送达" : "会失败"}，预计{" "}
                {lesson.predictionAttempts} 次；实际结果：{" "}
                {lesson.machine.status === "delivered"
                  ? "已送达"
                  : lesson.machine.status === "failed"
                    ? "已失败"
                    : "运行中"}
                。{" "}
                {lesson.timeoutConclusion === "status-unknown"
                  ? "超时判断：状态未知。"
                  : "超时判断：接收方失败。"}
              </p>
            ) : null}
          </section>
          {lesson.frames.length > 0 ? (
            <section className="protocol-card" aria-label="情境比较">
              <p className="eyebrow">比较情境</p>
              <h3>同一条消息，为什么会有不同结果</h3>
              <p>超时后可能送达、抑制重复请求，或耗尽重试次数。</p>
              <ScenarioComparisonTable current={lesson.scenario} />
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ProtocolProcessPage() {
  const search = useSearch({ from: "/labs/protocol-process" }) as Record<string, unknown>;
  const scenario = useMemo(() => parseProtocolScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionProtocolLesson,
    scenario,
    createProtocolLessonState,
  );

  useEffect(() => {
    dispatch({ type: "set-scenario", scenario: scenario.scenario });
  }, [scenario.scenario]);

  return (
    <LabShell eyebrow="协议过程" title="可靠送达" subtitle="不确定条件下的消息传递">
      <ProtocolProcessPageContent dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
