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
    label: "First acknowledgment lost",
    description: "Receiver accepts once, then suppresses the retry duplicate.",
  },
  {
    value: "no-loss",
    label: "No loss baseline",
    description: "One request and one acknowledgment complete normally.",
  },
  {
    value: "request-loss",
    label: "First request lost",
    description: "The sender retries because the receiver never saw attempt one.",
  },
  {
    value: "receiver-silent",
    label: "Receiver unavailable",
    description: "Both requests arrive at an unavailable receiver and attempts are exhausted.",
  },
];

function outcomeText(event: ProtocolEventEvidence): string {
  return `${event.outcome} · ${event.explanation}`;
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
    <section className="protocol-card protocol-trace-card" aria-label="Protocol event trace">
      <div className="protocol-card-heading">
        <div>
          <p className="eyebrow">EVENT QUEUE TRACE</p>
          <h3>Inspect one scheduled event at a time</h3>
        </div>
        <span className="protocol-trace-count">{frames.length} events</span>
      </div>
      {frames.length === 0 ? (
        <p className="protocol-empty-trace">Press Step to process the first request event.</p>
      ) : (
        <ol className="protocol-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`Frame ${frame.index + 1}, tick ${frame.event.at}, ${frame.event.kind}: ${outcomeText(frame.event)}`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <span className="protocol-trace-index">{frame.index + 1}</span>
                <span className="protocol-trace-copy">
                  <strong>
                    tick {frame.event.at} · {frame.event.kind} · attempt {frame.event.attempt}
                  </strong>
                  <span>{frame.event.outcome}</span>
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
          <th scope="col">Due tick</th>
          <th scope="col">Event</th>
          <th scope="col">Attempt</th>
          <th scope="col">Sequence</th>
        </tr>
      </thead>
      <tbody>
        {snapshot.queue.length === 0 ? (
          <tr>
            <th scope="row">Queue</th>
            <td colSpan={3}>empty</td>
          </tr>
        ) : (
          snapshot.queue.map((event) => (
            <tr key={`${event.sequence}-${event.kind}`}>
              <th scope="row">{event.dueAt}</th>
              <td>{event.kind}</td>
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
      <caption>Protocol counters after the selected event</caption>
      <thead>
        <tr>
          <th scope="col">Evidence</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <th scope="row">Simulated time</th>
          <td>{snapshot.now} ticks</td>
        </tr>
        <tr>
          <th scope="row">Request attempts sent</th>
          <td>{snapshot.attemptsSent}</td>
        </tr>
        <tr>
          <th scope="row">Receiver accepted</th>
          <td>{snapshot.acceptedCount}</td>
        </tr>
        <tr>
          <th scope="row">Duplicate suppressed</th>
          <td>{snapshot.duplicateCount}</td>
        </tr>
        <tr>
          <th scope="row">Acknowledgments sent</th>
          <td>{snapshot.acknowledgmentsSent}</td>
        </tr>
      </tbody>
    </table>
  );
}

function ScenarioComparisonTable({ current }: { current: ProtocolScenarioId }) {
  return (
    <table className="protocol-table">
      <caption>Fixture comparison from the domain's fixed evidence</caption>
      <thead>
        <tr>
          <th scope="col">Scenario</th>
          <th scope="col">Result</th>
          <th scope="col">Attempts</th>
          <th scope="col">Accepted</th>
          <th scope="col">Duplicates</th>
          <th scope="col">ACKs sent</th>
          <th scope="col">Final tick</th>
        </tr>
      </thead>
      <tbody>
        {scenarioOptions.map((option) => {
          const summary = PROTOCOL_SCENARIO_SUMMARIES[option.value];
          return (
            <tr key={option.value} data-current={current === option.value ? "true" : undefined}>
              <th scope="row">{option.label}</th>
              <td>{summary.status}</td>
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
      <section className="protocol-card" aria-label="Selected event evidence">
        <p className="eyebrow">SELECTED EVIDENCE</p>
        <h3>Step once to inspect the queue and clock</h3>
        <p>
          Each frame records one protocol event, its simulated time, its outcome, and complete
          before/after queue snapshots.
        </p>
      </section>
    );
  }

  return (
    <section className="protocol-card protocol-evidence-card" aria-label="Selected event evidence">
      <div className="protocol-card-heading">
        <div>
          <p className="eyebrow">SELECTED EVIDENCE</p>
          <h3>
            Frame {frame.index + 1} · tick {frame.event.at}
          </h3>
        </div>
        <span className="protocol-event-chip">{frame.event.kind}</span>
      </div>
      <p className="protocol-explanation">{frame.event.explanation}</p>
      <div className="protocol-event-evidence" role="note">
        <strong>Event outcome</strong>
        <span>
          {frame.event.outcome} · attempt {frame.event.attempt} · {MESSAGE_LABEL}
        </span>
      </div>
      <div className="protocol-snapshot-grid">
        <QueueTable snapshot={frame.before} caption={`Queue before frame ${frame.index + 1}`} />
        <QueueTable snapshot={frame.after} caption={`Queue after frame ${frame.index + 1}`} />
      </div>
      <CounterTable snapshot={frame.after} />
    </section>
  );
}

const MESSAGE_LABEL = "M42 · MEET AT 3";

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
          <p className="eyebrow">PROTOCOL PROCESS · RELIABLE DELIVERY</p>
          <h2>When an acknowledgment is late, what can the sender know?</h2>
          <p>
            Follow one message through delay, loss, timeout, retry, duplicate suppression, and
            acknowledgment. The clock is simulated and every queue change is inspectable.
          </p>
        </div>
        <div className="protocol-message-card" aria-label="Message definition">
          <span>MESSAGE</span>
          <strong>{MESSAGE_LABEL}</strong>
          <small>A sends to B through one abstract channel.</small>
        </div>
      </header>

      <div className="protocol-layout">
        <aside className="protocol-controls" aria-label="Experiment controls">
          <section className="protocol-card">
            <p className="eyebrow">PREDICT</p>
            <h3>Will delivery complete?</h3>
            <label htmlFor="protocol-prediction">Your prediction</label>
            <select
              aria-describedby="protocol-prediction-help"
              id="protocol-prediction"
              onChange={(event) =>
                dispatch({ type: "set-prediction-draft", value: event.target.value })
              }
              value={lesson.predictionDraft}
            >
              <option value="">Choose one</option>
              <option value="delivered">Delivered</option>
              <option value="failed">Failed</option>
            </select>
            <label htmlFor="protocol-prediction-attempts">Request attempts</label>
            <select
              id="protocol-prediction-attempts"
              onChange={(event) =>
                dispatch({ type: "set-prediction-attempts-draft", value: event.target.value })
              }
              value={lesson.predictionAttemptsDraft}
            >
              <option value="">Choose one</option>
              <option value="1">1 attempt</option>
              <option value="2">2 attempts</option>
            </select>
            <label htmlFor="protocol-timeout-conclusion">At timeout, the sender knows</label>
            <select
              aria-describedby="protocol-prediction-help"
              id="protocol-timeout-conclusion"
              onChange={(event) =>
                dispatch({ type: "set-timeout-conclusion-draft", value: event.target.value })
              }
              value={lesson.timeoutConclusionDraft}
            >
              <option value="">Choose one</option>
              <option value="status-unknown">Delivery status is still unknown</option>
              <option value="receiver-failed">The receiver failed</option>
            </select>
            <p id="protocol-prediction-help">
              Prediction is optional and never blocks Step or Run. A timeout alone does not prove
              receiver failure.
            </p>
            <button
              className="protocol-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              Record prediction
            </button>
            {lesson.predictionMessage ? <p role="status">{lesson.predictionMessage}</p> : null}
          </section>

          <section className="protocol-card">
            <p className="eyebrow">SCENARIO</p>
            <h3>Choose the fixed fault</h3>
            <label htmlFor="protocol-scenario">Message scenario</label>
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
            <p className="eyebrow">INTERVENE</p>
            <h3>Advance the protocol</h3>
            <div className="protocol-action-row">
              <button
                className="protocol-primary-button"
                disabled={lesson.machine.status !== "running"}
                onClick={() => dispatch({ type: "step" })}
                type="button"
              >
                Step
              </button>
              <button
                className="protocol-secondary-button"
                disabled={lesson.machine.status !== "running"}
                onClick={() => dispatch({ type: "run-all" })}
                type="button"
              >
                Run to completion
              </button>
            </div>
            <button
              className="protocol-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              Reset to URL scenario
            </button>
          </section>

          <section
            className="protocol-card protocol-guidance-card"
            aria-describedby="protocol-guided-help"
          >
            <p className="eyebrow">GUIDED INSPECTION</p>
            <h3>Find the causal turning point</h3>
            <p id="protocol-guided-help">
              These controls select evidence that already exists; they do not create a missing
              event.
            </p>
            <button
              aria-describedby="protocol-guided-help"
              disabled={!hasFault}
              onClick={() => dispatch({ type: "inspect-first-fault" })}
              type="button"
            >
              Inspect first fault
            </button>
            <button
              aria-describedby="protocol-guided-help"
              disabled={!hasRetry}
              onClick={() => dispatch({ type: "inspect-retry" })}
              type="button"
            >
              Inspect retry
            </button>
          </section>
        </aside>

        <div className="protocol-main-column">
          <section className="protocol-card protocol-status-card" aria-label="Protocol status">
            <div>
              <p className="eyebrow">CURRENT STATUS</p>
              <strong>{lesson.machine.status}</strong>
            </div>
            <dl>
              <div>
                <dt>Simulated time</dt>
                <dd>{lesson.machine.now} ticks</dd>
              </div>
              <div>
                <dt>Events processed</dt>
                <dd>{lesson.machine.processedEvents}</dd>
              </div>
              <div>
                <dt>Queue entries</dt>
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

          <section className="protocol-card protocol-final-card" aria-label="Final protocol result">
            <p className="eyebrow">FINAL PROTOCOL RESULT</p>
            <h3>Final delivery and retry evidence</h3>
            <p>
              Status: <strong>{lesson.machine.status}</strong> · attempts:{" "}
              {lesson.machine.attemptsSent} · accepted: {lesson.machine.acceptedCount} · duplicates
              suppressed: {lesson.machine.duplicateCount} · acknowledgments:{" "}
              {lesson.machine.acknowledgmentsSent}
            </p>
            {lesson.machine.terminal ? (
              <p>{lesson.machine.terminal.message}</p>
            ) : (
              <p>Run the exchange to observe its terminal reason.</p>
            )}
            {lesson.prediction ? (
              <p role="status">
                Prediction: {lesson.prediction} in {lesson.predictionAttempts} attempt
                {lesson.predictionAttempts === 1 ? "" : "s"}; observed:{" "}
                {lesson.machine.status === "delivered"
                  ? "delivered"
                  : lesson.machine.status === "failed"
                    ? "failed"
                    : "running"}
                .{" "}
                {lesson.timeoutConclusion === "status-unknown"
                  ? "Timeout claim: status unknown."
                  : "Timeout claim: receiver failed."}
              </p>
            ) : null}
          </section>
          <section className="protocol-card" aria-label="Scenario comparison">
            <p className="eyebrow">COMPARE FIXTURES</p>
            <h3>Same message, different causal result</h3>
            <p>
              Compare the fixed observations: a timeout can precede successful delivery, duplicate
              suppression, or exhausted attempts.
            </p>
            <ScenarioComparisonTable current={lesson.scenario} />
          </section>
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
    <LabShell
      eyebrow="PROTOCOL PROCESS"
      title="Protocol Process"
      subtitle="reliable delivery under uncertainty"
    >
      <ProtocolProcessPageContent dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
