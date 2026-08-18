import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import { type Utf8ByteEvidence, type Utf8Frame, type Utf8ScenarioId } from "../domain";
import { parseUtf8Scenario } from "../lesson/scenario";
import { createUtf8LessonState, transitionUtf8Lesson, type Utf8LessonState } from "../lesson/state";
import "./utf8.css";

const scenarioOptions: readonly { value: Utf8ScenarioId; label: string; description: string }[] = [
  { value: "mixed", label: "Mixed text", description: "ASCII, accented Latin, CJK, and emoji." },
  { value: "ascii", label: "ASCII", description: "One code point fits in one byte." },
  { value: "accent", label: "Accented Latin", description: "A two-byte UTF-8 sequence." },
  { value: "cjk", label: "CJK character", description: "A three-byte UTF-8 sequence." },
  { value: "emoji", label: "Emoji", description: "A four-byte UTF-8 sequence." },
];

function codePointLabel(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

function ByteTable({ bytes, caption }: { bytes: readonly Utf8ByteEvidence[]; caption: string }) {
  return (
    <table className="utf8-table">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Byte</th>
          <th scope="col">Decimal</th>
          <th scope="col">Binary</th>
        </tr>
      </thead>
      <tbody>
        {bytes.length === 0 ? (
          <tr>
            <th scope="row">Output</th>
            <td colSpan={2}>—</td>
          </tr>
        ) : (
          bytes.map((byte, index) => (
            <tr key={`${byte.decimal}-${index}`}>
              <th scope="row">{index + 1}</th>
              <td>{byte.decimal}</td>
              <td className="utf8-mono">{byte.binary}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function FrameTrace({
  frames,
  selectedFrameIndex,
  onSelect,
}: {
  frames: readonly Utf8Frame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="utf8-card" aria-label="UTF-8 frame trace">
      <div className="utf8-card-heading">
        <div>
          <p className="eyebrow">CODE POINT TRACE</p>
          <h3>One code point per frame</h3>
        </div>
        <span>{frames.length} frames</span>
      </div>
      {frames.length === 0 ? (
        <p>Press Step to inspect the first scalar-to-byte transformation.</p>
      ) : (
        <ol className="utf8-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`Frame ${frame.index + 1}, ${frame.evidence.character}, ${codePointLabel(frame.evidence.codePoint)}, ${frame.evidence.branch}, ${frame.evidence.bytes.length} bytes`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <strong>Frame {frame.index + 1}</strong>
                <span>
                  {frame.evidence.character} · {codePointLabel(frame.evidence.codePoint)} ·{" "}
                  {frame.evidence.branch}
                </span>
                <small>
                  {frame.evidence.bytes.length} byte{frame.evidence.bytes.length === 1 ? "" : "s"}
                </small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SelectedEvidence({ frame }: { frame?: Utf8Frame }) {
  if (!frame) {
    return (
      <section className="utf8-card" aria-label="Selected UTF-8 evidence">
        <p className="eyebrow">SELECTED EVIDENCE</p>
        <h3>Step once to inspect a code point</h3>
        <p>The selected frame will show the scalar, template, payload bits, and resulting bytes.</p>
      </section>
    );
  }
  return (
    <section className="utf8-card" aria-label="Selected UTF-8 evidence">
      <div className="utf8-card-heading">
        <div>
          <p className="eyebrow">SELECTED EVIDENCE</p>
          <h3>
            {frame.evidence.character} · {codePointLabel(frame.evidence.codePoint)}
          </h3>
        </div>
        <span className="utf8-branch">{frame.evidence.branch}</span>
      </div>
      <p>{frame.evidence.explanation}</p>
      <dl className="utf8-facts">
        <div>
          <dt>Code point binary</dt>
          <dd className="utf8-mono">{frame.evidence.codePointBinary}</dd>
        </div>
        <div>
          <dt>UTF-8 template</dt>
          <dd className="utf8-mono">{frame.evidence.template}</dd>
        </div>
        <div>
          <dt>Output before frame</dt>
          <dd className="utf8-mono">{frame.before.bytes.join(" ") || "—"}</dd>
        </div>
        <div>
          <dt>Output after frame</dt>
          <dd className="utf8-mono">{frame.after.bytes.join(" ") || "—"}</dd>
        </div>
      </dl>
      <ByteTable
        bytes={frame.evidence.bytes}
        caption={`Bytes produced by frame ${frame.index + 1}`}
      />
    </section>
  );
}

function Utf8Content({
  lesson,
  dispatch,
}: {
  lesson: Utf8LessonState;
  dispatch: Dispatch<Parameters<typeof transitionUtf8Lesson>[1]>;
}) {
  const selectedFrame = lesson.frames.find((frame) => frame.index === lesson.selectedFrameIndex);
  const option = scenarioOptions.find((candidate) => candidate.value === lesson.scenario)!;
  const visibleCount = [...getText(lesson.scenario)].length;
  return (
    <div className="utf8-page">
      <header className="utf8-hero">
        <div>
          <p className="eyebrow">UTF-8 · REPRESENTATION PATH</p>
          <h2>Why can four visible characters take ten bytes?</h2>
          <p>
            Follow each Unicode scalar through its range rule, payload template, and resulting UTF-8
            bytes.
          </p>
        </div>
        <div className="utf8-source-card" aria-label="UTF-8 source text">
          <span>SOURCE TEXT</span>
          <strong>{getText(lesson.scenario)}</strong>
          <small>{option.description}</small>
        </div>
      </header>

      <div className="utf8-layout">
        <aside className="utf8-controls" aria-label="UTF-8 experiment controls">
          <section className="utf8-card">
            <p className="eyebrow">PREDICT</p>
            <h3>Predict the next branch</h3>
            <label htmlFor="utf8-branch-prediction">Next code point branch</label>
            <select
              id="utf8-branch-prediction"
              onChange={(event) =>
                dispatch({ type: "set-branch-prediction", value: event.target.value })
              }
              value={lesson.predictionBranchDraft}
            >
              <option value="">Choose one</option>
              <option value="1-byte">1 byte</option>
              <option value="2-byte">2 bytes</option>
              <option value="3-byte">3 bytes</option>
              <option value="4-byte">4 bytes</option>
            </select>
            <label htmlFor="utf8-bytes-prediction">Final byte count</label>
            <input
              id="utf8-bytes-prediction"
              min={1}
              onChange={(event) =>
                dispatch({ type: "set-bytes-prediction", value: event.target.value })
              }
              type="number"
              value={lesson.predictionBytesDraft}
            />
            <p id="utf8-prediction-help">Prediction is optional and never blocks Step or Run.</p>
            <button
              className="utf8-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              Record prediction
            </button>
            {lesson.predictionMessage ? <p role="status">{lesson.predictionMessage}</p> : null}
          </section>

          <section className="utf8-card">
            <p className="eyebrow">FIXTURE</p>
            <h3>Choose source text</h3>
            <label htmlFor="utf8-scenario">UTF-8 fixture</label>
            <select
              id="utf8-scenario"
              onChange={(event) =>
                dispatch({ type: "set-scenario", scenario: event.target.value as Utf8ScenarioId })
              }
              value={lesson.scenario}
            >
              {scenarioOptions.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <p>{option.description}</p>
          </section>

          <section className="utf8-card">
            <p className="eyebrow">INTERVENE</p>
            <h3>Advance the encoding</h3>
            <div className="utf8-action-row">
              <button
                className="utf8-primary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "step" })}
                type="button"
              >
                Step
              </button>
              <button
                className="utf8-secondary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "run-all" })}
                type="button"
              >
                Run to end
              </button>
            </div>
            <button
              className="utf8-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              Reset to URL scenario
            </button>
          </section>
        </aside>

        <div className="utf8-main-column">
          <section className="utf8-card utf8-status-card" aria-label="UTF-8 encoding status">
            <div>
              <p className="eyebrow">CURRENT ENCODING</p>
              <strong>{lesson.machine.status}</strong>
            </div>
            <dl>
              <div>
                <dt>Code points processed</dt>
                <dd>{lesson.machine.nextIndex}</dd>
              </div>
              <div>
                <dt>Visible code points</dt>
                <dd>{visibleCount}</dd>
              </div>
              <div>
                <dt>Bytes produced</dt>
                <dd>{lesson.machine.bytes.length}</dd>
              </div>
            </dl>
          </section>
          <FrameTrace
            frames={lesson.frames}
            onSelect={(index) => dispatch({ type: "select-frame", index })}
            selectedFrameIndex={lesson.selectedFrameIndex}
          />
          <SelectedEvidence frame={selectedFrame} />
          <section className="utf8-card utf8-final-card" aria-label="Final UTF-8 result">
            <p className="eyebrow">FINAL UTF-8 RESULT</p>
            <h3>Encoded byte output</h3>
            <output aria-label="Encoded UTF-8 bytes">
              {lesson.machine.bytes.join(" ") || "—"}
            </output>
            <p>
              {visibleCount} visible code point
              {visibleCount === 1 ? "" : "s"} → {lesson.machine.bytes.length} byte
              {lesson.machine.bytes.length === 1 ? "" : "s"}.
            </p>
            {lesson.predictionBranch ? (
              <p role="status">
                Prediction: {lesson.predictionBranch}; observed final byte count:{" "}
                {lesson.machine.bytes.length}.
              </p>
            ) : null}
          </section>
          <section className="utf8-card" aria-label="UTF-8 byte comparison">
            <p className="eyebrow">COMPARE</p>
            <h3>Visible count is not byte count</h3>
            <ByteTable
              bytes={selectedFrame?.evidence.bytes ?? []}
              caption="Selected code point bytes"
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function getText(scenario: Utf8ScenarioId): string {
  return { ascii: "A", accent: "é", cjk: "猫", emoji: "🙂", mixed: "Aé猫🙂" }[scenario];
}

export function Utf8Page() {
  const search = useSearch({ from: "/labs/utf8" }) as Record<string, unknown>;
  const scenario = useMemo(() => parseUtf8Scenario(search), [search]);
  const [lesson, dispatch] = useReducer(transitionUtf8Lesson, scenario, createUtf8LessonState);

  useEffect(() => {
    dispatch({ type: "sync-url-scenario", scenario: scenario.scenario });
  }, [scenario.scenario]);

  return (
    <LabShell eyebrow="UTF-8" title="UTF-8" subtitle="code points to bytes">
      <Utf8Content dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
