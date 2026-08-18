import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  BYTE_EDIT_PRESETS,
  decodeUtf8,
  getByteEditScenario,
  type ByteEditFrame,
  type ByteEditScenarioId,
} from "../domain";
import { parseByteEditScenario } from "../lesson/scenario";
import {
  createByteEditLessonState,
  transitionByteEditLesson,
  type ByteEditLessonState,
} from "../lesson/state";
import "./byte-edit.css";

const scenarioOptions: readonly { value: ByteEditScenarioId; label: string }[] = [
  { value: "mixed", label: "Mixed text" },
  { value: "ascii", label: "ASCII" },
  { value: "accent", label: "Accented Latin" },
  { value: "cjk", label: "CJK character" },
  { value: "emoji", label: "Emoji" },
];

const hexBytes = (bytes: readonly number[]) =>
  bytes.map((value) => value.toString(16).padStart(2, "0")).join(" ");

function DecodeEvidence({ decode }: { decode: ReturnType<typeof decodeUtf8> }) {
  return decode.valid ? (
    <p className="be-valid" role="status">
      Valid UTF-8 → “{decode.characters}” (
      {decode.codePoints
        .map((point) => `U+${point.toString(16).toUpperCase().padStart(4, "0")}`)
        .join(" ")}
      )
    </p>
  ) : (
    <p className="be-invalid" role="status">
      Invalid at byte {decode.at}: {decode.reason}.
    </p>
  );
}

function FrameTrace({
  frames,
  selectedFrameIndex,
  onSelect,
}: {
  frames: readonly ByteEditFrame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="be-card" aria-label="Byte edit trace">
      <div className="be-card-heading">
        <div>
          <p className="eyebrow">EDIT TRACE</p>
          <h3>One applied edit per frame</h3>
        </div>
        <span>{frames.length} frames</span>
      </div>
      {frames.length === 0 ? (
        <p>Apply a byte edit or load a preset to start the trace.</p>
      ) : (
        <ol className="be-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`Edit ${frame.index + 1}, ${frame.edit.kind === "byte" ? `byte ${frame.edit.byteIndex} to ${frame.edit.value}` : frame.edit.preset}, ${frame.decode.valid ? "valid" : "invalid"}`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <strong>Edit {frame.index + 1}</strong>
                <span>
                  {frame.edit.kind === "byte"
                    ? `byte ${frame.edit.byteIndex} → ${frame.edit.value}`
                    : BYTE_EDIT_PRESETS[frame.edit.preset].label}
                </span>
                <small>{frame.decode.valid ? "valid" : "invalid"}</small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SelectedEvidence({ frame }: { frame?: ByteEditFrame }) {
  if (!frame) {
    return (
      <section className="be-card" aria-label="Selected byte edit evidence">
        <p className="eyebrow">SELECTED EVIDENCE</p>
        <h3>Apply an edit to inspect it</h3>
        <p>The selected edit will show before/after bytes and the full-sequence decode result.</p>
      </section>
    );
  }
  return (
    <section className="be-card" aria-label="Selected byte edit evidence">
      <div className="be-card-heading">
        <div>
          <p className="eyebrow">SELECTED EVIDENCE</p>
          <h3>
            {frame.edit.kind === "byte"
              ? `Byte ${frame.edit.byteIndex} → ${frame.edit.value}`
              : BYTE_EDIT_PRESETS[frame.edit.preset].label}
          </h3>
        </div>
        <span className="be-mono">{hexBytes(frame.after.bytes)}</span>
      </div>
      {frame.predictedValid !== undefined ? (
        <p role="status">
          Predicted {frame.predictedValid ? "valid" : "invalid"}; observed{" "}
          {frame.decode.valid ? "valid" : "invalid"}.
        </p>
      ) : null}
      <dl className="be-facts">
        <div>
          <dt>Bytes before</dt>
          <dd className="be-mono">{hexBytes(frame.before.bytes)}</dd>
        </div>
        <div>
          <dt>Bytes after</dt>
          <dd className="be-mono">{hexBytes(frame.after.bytes)}</dd>
        </div>
      </dl>
      <DecodeEvidence decode={frame.decode} />
      {frame.edit.kind === "preset" ? <p>{BYTE_EDIT_PRESETS[frame.edit.preset].note}</p> : null}
    </section>
  );
}

function ByteEditContent({
  lesson,
  dispatch,
}: {
  lesson: ByteEditLessonState;
  dispatch: Dispatch<Parameters<typeof transitionByteEditLesson>[1]>;
}) {
  const selectedFrame = lesson.frames.find((frame) => frame.index === lesson.selectedFrameIndex);
  const scenario = getByteEditScenario(lesson.scenario);
  const option = scenarioOptions.find((candidate) => candidate.value === lesson.scenario)!;
  const currentDecode = useMemo(() => decodeUtf8(lesson.machine.bytes), [lesson.machine.bytes]);

  return (
    <div className="be-page">
      <header className="be-hero">
        <div>
          <p className="eyebrow">BYTE EDIT · FINITE REPRESENTATION</p>
          <h2>What happens when you edit one byte?</h2>
          <p>
            Change a byte of a known UTF-8 sequence, or load a preset, and read the exact validity
            rule the decoder applies.
          </p>
        </div>
        <div className="be-fixture-card" aria-label="Byte edit fixture">
          <span>FIXTURE</span>
          <strong>{option.label}</strong>
          <small className="be-mono">{hexBytes(scenario.bytes)}</small>
        </div>
      </header>

      <div className="be-layout">
        <aside className="be-controls" aria-label="Byte edit controls">
          <section className="be-card">
            <p className="eyebrow">PREDICT</p>
            <h3>Will the edited sequence stay valid?</h3>
            <label htmlFor="be-prediction">Validity</label>
            <select
              id="be-prediction"
              onChange={(event) => dispatch({ type: "set-prediction", value: event.target.value })}
              value={lesson.predictionDraft}
            >
              <option value="">Choose one</option>
              <option value="valid">Stays valid</option>
              <option value="invalid">Becomes invalid</option>
            </select>
            <p id="be-prediction-help">Prediction is optional and never blocks an edit.</p>
            <button
              className="be-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              Record prediction
            </button>
            {lesson.predictionMessage ? <p role="status">{lesson.predictionMessage}</p> : null}
          </section>

          <section className="be-card">
            <p className="eyebrow">EDIT</p>
            <h3>Change one byte</h3>
            <label htmlFor="be-index">Byte index</label>
            <select
              id="be-index"
              onChange={(event) => dispatch({ type: "set-edit-index", value: event.target.value })}
              value={lesson.editIndexDraft}
            >
              <option value="">Choose one</option>
              {lesson.machine.bytes.map((value, index) => (
                <option key={index} value={index}>
                  {index} (currently {value})
                </option>
              ))}
            </select>
            <label htmlFor="be-value">New value (0–255)</label>
            <input
              id="be-value"
              min={0}
              max={255}
              onChange={(event) => dispatch({ type: "set-edit-value", value: event.target.value })}
              type="number"
              value={lesson.editValueDraft}
            />
            <button
              className="be-primary-button"
              onClick={() => dispatch({ type: "apply-edit" })}
              type="button"
            >
              Apply edit
            </button>
          </section>

          <section className="be-card">
            <p className="eyebrow">PRESETS</p>
            <h3>Load a known sequence</h3>
            <div className="be-preset-grid">
              {Object.values(BYTE_EDIT_PRESETS).map((preset) => (
                <button
                  key={preset.id}
                  className="be-preset-button"
                  onClick={() => dispatch({ type: "apply-preset", preset: preset.id })}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </section>

          <section className="be-card">
            <p className="eyebrow">FIXTURE</p>
            <h3>Choose text</h3>
            <label htmlFor="be-scenario">Byte edit fixture</label>
            <select
              id="be-scenario"
              onChange={(event) =>
                dispatch({
                  type: "set-scenario",
                  scenario: event.target.value as ByteEditScenarioId,
                })
              }
              value={lesson.scenario}
            >
              {scenarioOptions.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <button
              className="be-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              Reset to URL scenario
            </button>
          </section>
        </aside>

        <div className="be-main-column">
          <section className="be-card be-status-card" aria-label="Current byte sequence">
            <div>
              <p className="eyebrow">CURRENT SEQUENCE</p>
              <strong className="be-mono">{hexBytes(lesson.machine.bytes)}</strong>
            </div>
            <DecodeEvidence decode={currentDecode} />
          </section>
          <FrameTrace
            frames={lesson.frames}
            onSelect={(index) => dispatch({ type: "select-frame", index })}
            selectedFrameIndex={lesson.selectedFrameIndex}
          />
          <SelectedEvidence frame={selectedFrame} />
        </div>
      </div>
    </div>
  );
}

export function ByteEditPage() {
  const search = useSearch({ from: "/labs/byte-edit" }) as Record<string, unknown>;
  const scenario = useMemo(() => parseByteEditScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionByteEditLesson,
    scenario,
    createByteEditLessonState,
  );

  useEffect(() => {
    dispatch({ type: "sync-url-scenario", scenario: scenario.scenario });
  }, [scenario.scenario]);

  return (
    <LabShell eyebrow="Byte Edit" title="字节编辑" subtitle="one byte changes meaning">
      <ByteEditContent dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
