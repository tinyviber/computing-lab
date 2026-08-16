import { useEffect, useMemo, useReducer } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import { SOUND_FIXTURES, type SoundSource } from "../domain/fixtures";
import {
  deriveSoundModel,
  SOUND_MAX_BIT_DEPTH,
  SOUND_MAX_PHASE,
  SOUND_MAX_SAMPLE_RATE,
  SOUND_MIN_BIT_DEPTH,
  SOUND_MIN_PHASE,
  SOUND_MIN_SAMPLE_RATE,
} from "../domain/model";
import { parseSoundScenario, type SoundMode, type SoundView } from "../lesson/scenario";
import { createSoundLessonState, transitionSoundLesson } from "../lesson/state";
import "./audio-encoding.css";

const MODE_LABELS: Record<SoundMode, string> = {
  compare: "Compare",
  aliasing: "Aliasing",
  quantization: "Quantization",
};

const VIEW_LABELS: Record<SoundView, string> = {
  compare: "Compare",
  samples: "Samples",
  levels: "Levels",
  error: "Error",
};

function formatNumber(value: number, digits = 3): string {
  return value.toFixed(digits).replace(/\.?(0+)$/, "");
}

function plotPoints(values: readonly number[], scale = 1): string {
  if (values.length === 0) return "";
  return values
    .map((value, index) => {
      const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100;
      const y = 50 - Math.max(-1, Math.min(1, value * scale)) * 40;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

function AudioEncodingContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseSoundScenario(search), [search]);
  const [state, dispatch] = useReducer(transitionSoundLesson, scenario, createSoundLessonState);
  const model = useMemo(
    () => deriveSoundModel(state.source, state.config, state.cursor),
    [state.config, state.cursor, state.source],
  );
  const fixture = SOUND_FIXTURES[state.source];
  const isLooping = state.loop !== "off";
  const selectedView = state.view;
  const showOriginal = selectedView === "compare" || selectedView === "samples";
  const showReconstructed = selectedView !== "error";
  const plotError = selectedView === "error";

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [
    scenario.bitDepth,
    scenario.loop,
    scenario.mode,
    scenario.phase,
    scenario.sampleRate,
    scenario.source,
    scenario.view,
  ]);

  const liveMessage = `${fixture.label}; ${state.transport}; cursor ${formatNumber(state.cursor, 0)} milliseconds; ${model.aliasing ? "aliasing detected" : "below Nyquist"}.`;

  return (
    <LabShell eyebrow="AUDIO / 01" title="声音编码" subtitle="Sampling and quantization">
      <div className="sound-feature-layout">
        <section className="lesson-section sound-visualization" aria-labelledby="sound-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">REFERENCE IMPLEMENTATION</p>
              <h2 id="sound-heading">采样、量化与重建</h2>
              <p className="section-description">
                所有读数来自确定性的本地夹具；播放按钮只改变状态，时间只由显式步进推进。
              </p>
            </div>
            <span className="sound-transport-badge">{state.transport}</span>
          </div>

          <div className="sound-panel sound-plot-panel">
            <div className="sound-panel-header">
              <span>BOUNDED PLOT</span>
              <code>
                {model.plot.length} points / {model.sampleCount} samples
              </code>
            </div>
            <div
              aria-label={`${fixture.label} ${selectedView} plot`}
              className="sound-plot-stage"
              role="img"
            >
              <svg className="sound-plot" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line className="sound-axis" x1="0" x2="100" y1="50" y2="50" />
                {showOriginal ? (
                  <polyline
                    className="sound-original-line"
                    points={plotPoints(model.plot.map((point) => point.original))}
                  />
                ) : null}
                {showReconstructed ? (
                  <polyline
                    className="sound-reconstructed-line"
                    points={plotPoints(model.plot.map((point) => point.reconstructed))}
                  />
                ) : null}
                {plotError ? (
                  <polyline
                    className="sound-error-line"
                    points={plotPoints(
                      model.plot.map((point) => point.error),
                      4,
                    )}
                  />
                ) : null}
                <line
                  className="sound-cursor-line"
                  x1={(state.cursor / model.durationMs) * 100}
                  x2={(state.cursor / model.durationMs) * 100}
                  y1="0"
                  y2="100"
                />
              </svg>
            </div>
            <div className="sound-panel-footer">
              <span>
                <i className="sound-legend-original" /> Original
              </span>
              <span>
                <i className="sound-legend-reconstructed" /> Sample-hold reconstruction
              </span>
              <span>
                <i className="sound-legend-error" /> Error
              </span>
            </div>
          </div>

          <div className="sound-summary" aria-label="Derived sound metrics">
            <div>
              <span>Nyquist</span>
              <strong>{formatNumber(model.nyquistHz, 0)} Hz</strong>
            </div>
            <div>
              <span>Folded frequency</span>
              <strong>{formatNumber(model.foldedFrequencyHz, 1)} Hz</strong>
            </div>
            <div>
              <span>RMS error</span>
              <strong>{formatNumber(model.rmsError)}</strong>
            </div>
            <div>
              <span>Peak error</span>
              <strong>{formatNumber(model.peakError)}</strong>
            </div>
            <div>
              <span>Payload</span>
              <strong>
                {model.payload.totalBits} bits / {model.payload.totalBytes} B
              </strong>
            </div>
          </div>

          <div className="sound-readout" aria-label="Cursor readout">
            <p className="eyebrow">CURSOR READOUT</p>
            <dl>
              <div>
                <dt>Time</dt>
                <dd>{formatNumber(model.cursor.timeMs, 1)} ms</dd>
              </div>
              <div>
                <dt>Sample</dt>
                <dd>
                  #{model.cursor.sampleIndex + 1} @{" "}
                  {formatNumber(model.cursor.sampleTimestampMs, 2)} ms
                </dd>
              </div>
              <div>
                <dt>Original</dt>
                <dd>{formatNumber(model.cursor.original)}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>
                  {model.cursor.code} / {model.quantization.levels - 1}
                </dd>
              </div>
              <div>
                <dt>Reconstructed</dt>
                <dd>{formatNumber(model.cursor.reconstructed)}</dd>
              </div>
              <div>
                <dt>Error</dt>
                <dd>{formatNumber(model.cursor.error)}</dd>
              </div>
            </dl>
          </div>
          <p aria-atomic="true" aria-live="polite" className="sound-live-region" role="status">
            {liveMessage}
          </p>
        </section>

        <aside aria-label="Sound configuration inspector" className="sound-inspector">
          <div className="sound-inspector-section">
            <p className="eyebrow">SOURCE</p>
            <label className="sound-label" htmlFor="sound-source">
              Source
            </label>
            <select
              id="sound-source"
              onChange={(event) =>
                dispatch({ type: "set-source", source: event.target.value as SoundSource })
              }
              value={state.source}
            >
              {(Object.keys(SOUND_FIXTURES) as SoundSource[]).map((source) => (
                <option key={source} value={source}>
                  {SOUND_FIXTURES[source].label}
                </option>
              ))}
            </select>
            <p className="sound-source-id">
              Source id: <code>{state.source}</code>
            </p>
            <p className="sound-control-description">{fixture.description}</p>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">CONFIGURATION</p>
            <label className="sound-label" htmlFor="sound-rate">
              Sample rate <span>{state.config.sampleRate} Hz</span>
            </label>
            <input
              aria-describedby="sound-rate-description"
              id="sound-rate"
              max={SOUND_MAX_SAMPLE_RATE}
              min={SOUND_MIN_SAMPLE_RATE}
              onChange={(event) =>
                dispatch({ type: "set-sample-rate", sampleRate: Number(event.target.value) })
              }
              step={100}
              type="range"
              value={state.config.sampleRate}
            />
            <p className="sound-control-description" id="sound-rate-description">
              Samples captured per second.
            </p>
            <label className="sound-label" htmlFor="sound-bits">
              Bit depth <span>{state.config.bitDepth} bit</span>
            </label>
            <input
              aria-describedby="sound-bits-description"
              id="sound-bits"
              max={SOUND_MAX_BIT_DEPTH}
              min={SOUND_MIN_BIT_DEPTH}
              onChange={(event) =>
                dispatch({ type: "set-bit-depth", bitDepth: Number(event.target.value) })
              }
              type="range"
              value={state.config.bitDepth}
            />
            <p className="sound-control-description" id="sound-bits-description">
              Quantization levels are 2 to the bit depth.
            </p>
            <label className="sound-label" htmlFor="sound-phase">
              Phase <span>{formatNumber(state.config.phase, 2)} turns</span>
            </label>
            <input
              aria-label="Phase"
              aria-describedby="sound-phase-description"
              id="sound-phase"
              max={SOUND_MAX_PHASE}
              min={SOUND_MIN_PHASE}
              onChange={(event) =>
                dispatch({ type: "set-phase", phase: Number(event.target.value) })
              }
              step="0.01"
              type="range"
              value={state.config.phase}
            />
            <p className="sound-control-description" id="sound-phase-description">
              A deterministic phase offset for the fixture.
            </p>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">TRANSPORT</p>
            <div className="sound-button-row">
              <button
                className="button button-primary"
                onClick={() => dispatch({ type: "play" })}
                type="button"
              >
                Play
              </button>
              <button
                className="button button-secondary"
                onClick={() => dispatch({ type: "pause" })}
                type="button"
              >
                Pause
              </button>
              <button
                className="button button-secondary"
                onClick={() => dispatch({ type: "stop" })}
                type="button"
              >
                Stop
              </button>
            </div>
            <button
              className="button button-secondary sound-step-button"
              onClick={() => dispatch({ type: "tick", deltaMs: 100 })}
              type="button"
            >
              Advance 100 ms
            </button>
            <label className="sound-label" htmlFor="sound-cursor">
              Cursor{" "}
              <span>
                {formatNumber(state.cursor, 0)} / {model.durationMs} ms
              </span>
            </label>
            <input
              id="sound-cursor"
              max={model.durationMs}
              min="0"
              onChange={(event) =>
                dispatch({ type: "set-cursor", cursor: Number(event.target.value) })
              }
              step="1"
              type="range"
              value={state.cursor}
            />
            <label className="sound-check-label">
              <input
                checked={isLooping}
                onChange={(event) =>
                  dispatch({
                    type: "set-loop",
                    loop: event.target.checked ? { startMs: 0, endMs: model.durationMs } : "off",
                  })
                }
                type="checkbox"
              />{" "}
              Loop full fixture
            </label>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">AUDITION</p>
            <div className="sound-choice-row" role="group" aria-label="Audition source">
              {(["original", "reconstructed"] as const).map((audition) => (
                <button
                  aria-pressed={state.audition === audition}
                  className="sound-choice"
                  key={audition}
                  onClick={() => dispatch({ type: "set-audition", audition })}
                  type="button"
                >
                  {audition}
                </button>
              ))}
            </div>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">ANALYSIS MODE</p>
            <div className="sound-choice-row" role="group" aria-label="Analysis mode">
              {(Object.keys(MODE_LABELS) as SoundMode[]).map((mode) => (
                <button
                  aria-pressed={state.mode === mode}
                  className="sound-choice"
                  key={mode}
                  onClick={() => dispatch({ type: "set-mode", mode })}
                  type="button"
                >
                  {MODE_LABELS[mode]}
                </button>
              ))}
            </div>
            <p className="sound-mode-note">
              {model.aliasing
                ? `The ${fixture.frequencyHz} Hz fixture exceeds the ${model.nyquistHz} Hz Nyquist limit.`
                : "This fixture is below the current Nyquist limit."}
            </p>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">VIEW</p>
            <div className="sound-choice-row sound-view-row" role="group" aria-label="Plot view">
              {(Object.keys(VIEW_LABELS) as SoundView[]).map((view) => (
                <button
                  aria-label={view === "compare" ? "Overlay view" : undefined}
                  aria-pressed={state.view === view}
                  className="sound-choice"
                  key={view}
                  onClick={() => dispatch({ type: "set-view", view })}
                  type="button"
                >
                  {VIEW_LABELS[view]}
                </button>
              ))}
            </div>
          </div>

          <button
            className="button button-secondary sound-reset"
            onClick={() => dispatch({ type: "reset" })}
            type="button"
          >
            Reset reference state
          </button>
        </aside>
      </div>
    </LabShell>
  );
}

export function AudioEncodingPage() {
  const search = useSearch({ from: "/labs/audio-encoding" });
  return <AudioEncodingContent search={search} />;
}
