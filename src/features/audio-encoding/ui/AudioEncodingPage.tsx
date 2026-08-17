import { useEffect, useMemo, useReducer, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import { SOUND_FIXTURES, type SoundSource } from "../domain/fixtures";
import {
  buildSoundPlot,
  deriveSoundModel,
  getPlotWindowWidthMs,
  SOUND_MAX_BIT_DEPTH,
  SOUND_MIN_BIT_DEPTH,
  SOUND_MIN_PHASE,
} from "../domain/model";
import { parseSoundScenario, type SoundMode, type SoundView } from "../lesson/scenario";
import { createSoundLessonState, transitionSoundLesson } from "../lesson/state";
import { createAudioPlaybackRuntime, type AudioPlaybackRequest } from "./audioPlayback";
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
  error: "Reconstruction error",
};

function formatNumber(value: number, digits = 3): string {
  const fixed = value.toFixed(digits);
  if (!fixed.includes(".")) return fixed;
  return fixed.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "");
}

function formatCursorTime(value: number, digits: number): string {
  return digits >= 3 ? value.toFixed(digits) : formatNumber(value, digits);
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

function classificationLabel(classification: "below" | "at" | "aliased"): string {
  if (classification === "aliased") return "aliased";
  if (classification === "at") return "at Nyquist";
  return "below Nyquist";
}

const SAMPLE_RATE_STOPS = [
  800, 880, 960, 3600, 3960, 4320, 8000, 10800, 12000, 13200, 16000, 21600, 24000, 26400, 44100,
];

function AudioEncodingContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseSoundScenario(search), [search]);
  const [state, dispatch] = useReducer(transitionSoundLesson, scenario, createSoundLessonState);
  const [plotWindowSelection, setPlotWindowSelection] = useState(() => ({
    source: scenario.source,
    choice: SOUND_FIXTURES[scenario.source].plotWindowDefinition.defaultValue,
  }));
  const [audioStatus, setAudioStatus] = useState("Audio is ready when Play is pressed.");
  const playback = useMemo(() => createAudioPlaybackRuntime(), []);
  const model = useMemo(() => {
    return deriveSoundModel(state.source, state.config);
  }, [state.config, state.source]);
  const fixture = SOUND_FIXTURES[state.source];
  const plotWindowDefinition = fixture.plotWindowDefinition;
  const plotWindowChoice =
    plotWindowSelection.source === state.source &&
    plotWindowDefinition.options.includes(plotWindowSelection.choice)
      ? plotWindowSelection.choice
      : plotWindowDefinition.defaultValue;
  const windowWidth = Math.min(model.durationMs, getPlotWindowWidthMs(fixture, plotWindowChoice));
  const plotWindow = useMemo(() => {
    const maxStartMs = Math.max(0, model.durationMs - windowWidth);
    const startMs = Math.min(maxStartMs, Math.max(0, state.cursor - windowWidth / 2));
    return { startMs, endMs: startMs + windowWidth };
  }, [model.durationMs, state.cursor, windowWidth]);
  const plot = useMemo(
    () =>
      buildSoundPlot(
        state.source,
        model.timestamps,
        model.reconstruction,
        model.durationMs,
        plotWindow,
      ),
    [model.durationMs, model.reconstruction, model.timestamps, plotWindow, state.source],
  );
  const cursorStep = Math.min(1, Math.max(0.01, windowWidth < 20 ? 0.01 : windowWidth / 100));
  const cursorDigits = cursorStep < 1 ? 3 : 0;
  const cursorReadoutDigits = cursorStep < 1 ? 3 : 1;
  const cursor = useMemo(() => model.cursorAt(state.cursor), [model, state.cursor]);
  const isLooping = state.loop !== "off";
  const selectedView = state.view;
  const showOriginal = selectedView === "compare" || selectedView === "samples";
  const showReconstructed = selectedView !== "error";
  const plotError = selectedView === "error";
  const aliasedComponentCount = useMemo(
    () =>
      model.aliasingEvidence.components.filter(
        (component) => component.classification === "aliased",
      ).length,
    [model],
  );
  const { levelPreview, plotLines, visibleSamples } = useMemo(() => {
    const samplesInWindow = model.samples.filter(
      (sample) =>
        sample.timestampMs >= plotWindow.startMs && sample.timestampMs <= plotWindow.endMs,
    );
    const sampleStride = Math.max(1, Math.ceil(samplesInWindow.length / 160));
    return {
      levelPreview: model.quantization.preview,
      plotLines: {
        reconstructionError: plotPoints(
          plot.map((point) => point.reconstructionError),
          4,
        ),
        original: plotPoints(plot.map((point) => point.original)),
        reconstructed: plotPoints(plot.map((point) => point.reconstructed)),
      },
      visibleSamples: samplesInWindow.filter((_, index) => index % sampleStride === 0),
    };
  }, [model, plot, plotWindow]);
  const playbackRequest: AudioPlaybackRequest = useMemo(
    () => ({
      source: state.source,
      config: state.config,
      audition: state.audition,
      cursorMs: state.cursor,
      loop: state.loop,
      durationMs: model.durationMs,
    }),
    [model.durationMs, state.audition, state.config, state.cursor, state.loop, state.source],
  );

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

  useEffect(() => {
    if (
      plotWindowSelection.source !== state.source ||
      plotWindowSelection.choice !== plotWindowChoice
    ) {
      setPlotWindowSelection({ source: state.source, choice: plotWindowChoice });
    }
  }, [plotWindowChoice, plotWindowSelection.choice, plotWindowSelection.source, state.source]);

  useEffect(() => {
    if (state.transport === "playing") playback.sync(playbackRequest);
    else playback.stop();
  }, [playback, playbackRequest, state.transport]);

  useEffect(() => () => playback.dispose(), [playback]);

  useEffect(() => {
    if (state.transport !== "playing") return undefined;

    let lastTime: number | undefined;
    let frameId: number | undefined;
    let intervalId: ReturnType<typeof setInterval> | undefined;
    const advance = (now: number) => {
      if (!Number.isFinite(now)) return;
      if (lastTime === undefined) {
        lastTime = now;
        return;
      }
      const deltaMs = Math.max(0, now - lastTime);
      lastTime = now;
      dispatch({ type: "tick", deltaMs });
    };

    if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
      const frame = (now: number) => {
        advance(now);
        frameId = window.requestAnimationFrame(frame);
      };
      frameId = window.requestAnimationFrame(frame);
    } else {
      intervalId = setInterval(
        () => advance(typeof performance === "undefined" ? Date.now() : performance.now()),
        16,
      );
    }

    return () => {
      if (frameId !== undefined && typeof window !== "undefined") {
        window.cancelAnimationFrame(frameId);
      }
      if (intervalId !== undefined) clearInterval(intervalId);
    };
  }, [state.transport]);

  const liveMessage = `${fixture.label}; ${state.transport}; cursor ${formatCursorTime(cursor.timeMs, cursorDigits)} milliseconds; ${model.anyAliasing ? "one or more components alias" : "all components are below or at Nyquist"}.`;

  const play = () => {
    const result = playback.play(playbackRequest);
    setAudioStatus(result.message);
    dispatch({ type: "play" });
  };

  const seek = (cursorMs: number) => {
    const nextRequest = { ...playbackRequest, cursorMs };
    if (state.transport === "playing") playback.seek(nextRequest);
    dispatch({ type: "seek", cursor: cursorMs });
  };

  return (
    <LabShell eyebrow="AUDIO / 01" title="声音编码" subtitle="Sampling and quantization">
      <div className="sound-feature-layout">
        <section className="lesson-section sound-visualization" aria-labelledby="sound-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">REFERENCE IMPLEMENTATION</p>
              <h2 id="sound-heading">采样、量化与重建</h2>
              <p className="section-description">
                所有读数来自确定性的本地夹具；视觉时钟由显式步进推进，音频试听使用固定 48 kHz
                缓冲区。
              </p>
            </div>
            <span className="sound-transport-badge">{state.transport}</span>
          </div>

          <div className="sound-panel sound-plot-panel">
            <div className="sound-panel-header">
              <span>BOUNDED PLOT</span>
              <code>
                {plot.length} points · {formatNumber(plot[plot.length - 1]?.timeMs ?? 0, 1)} ms
                window / {model.sampleCount} samples
              </code>
            </div>
            <div
              aria-label={`${fixture.label} ${VIEW_LABELS[selectedView]} plot`}
              className="sound-plot-stage"
              data-audition={state.audition}
              data-evidence={
                selectedView === "error" ? "reconstruction-error-waveform" : selectedView
              }
              data-sound-mode={state.mode}
              data-sound-view={selectedView}
              data-time-window-start={plotWindow.startMs}
              data-time-window-end={plotWindow.endMs}
              role="img"
            >
              <svg className="sound-plot" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line className="sound-axis" x1="0" x2="100" y1="50" y2="50" />
                {showOriginal ? (
                  <polyline className="sound-original-line" points={plotLines.original} />
                ) : null}
                {showReconstructed ? (
                  <polyline className="sound-reconstructed-line" points={plotLines.reconstructed} />
                ) : null}
                {plotError ? (
                  <polyline
                    aria-label="Reconstruction error"
                    className="sound-error-line"
                    points={plotLines.reconstructionError}
                  />
                ) : null}
                {selectedView === "samples"
                  ? visibleSamples.map((sample) => (
                      <circle
                        className="sound-sample-marker"
                        cx={
                          ((sample.timestampMs - plotWindow.startMs) /
                            (plotWindow.endMs - plotWindow.startMs)) *
                          100
                        }
                        cy={50 - sample.original * 40}
                        data-sample-marker="true"
                        data-sample-index={sample.index}
                        data-sample-timestamp-ms={sample.timestampMs}
                        key={sample.index}
                        r="1.15"
                      />
                    ))
                  : null}
                {selectedView === "levels"
                  ? levelPreview.map((level) => (
                      <line
                        className="sound-level-line"
                        data-bounded-line="true"
                        key={level.code}
                        x1="0"
                        x2="100"
                        y1={50 - level.value * 40}
                        y2={50 - level.value * 40}
                      />
                    ))
                  : null}
                {cursor.timeMs >= plotWindow.startMs && cursor.timeMs <= plotWindow.endMs ? (
                  <line
                    className="sound-cursor-line"
                    x1={
                      ((cursor.timeMs - plotWindow.startMs) /
                        (plotWindow.endMs - plotWindow.startMs)) *
                      100
                    }
                    x2={
                      ((cursor.timeMs - plotWindow.startMs) /
                        (plotWindow.endMs - plotWindow.startMs)) *
                      100
                    }
                    y1="0"
                    y2="100"
                  />
                ) : null}
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
                <i className="sound-legend-error" /> Reconstruction error
              </span>
            </div>
          </div>

          <div className="sound-mode-evidence" data-sound-mode={state.mode}>
            {state.mode === "compare" ? (
              <div data-testid="sound-compare-evidence">
                <p className="eyebrow">COMPARE EVIDENCE</p>
                <p>
                  Overlay shows immutable original x(t) against the sample-hold reconstruction. Use
                  the A/B controls to audition either buffer.
                </p>
              </div>
            ) : null}
            {state.mode === "aliasing" ? (
              <div data-testid="sound-aliasing-evidence">
                <p className="eyebrow">COMPONENT ALIASING EVIDENCE</p>
                <p>
                  {model.anyAliasing
                    ? "At least one exposed component is above Nyquist."
                    : "Every exposed component is below or exactly at Nyquist."}
                </p>
                <div className="sound-evidence-table" role="table">
                  {model.aliasingEvidence.components.map((component) => (
                    <div
                      className="sound-evidence-row"
                      key={`${component.frequencyHz}-${component.amplitude}`}
                      role="row"
                    >
                      <span role="cell">{formatNumber(component.frequencyHz, 0)} Hz</span>
                      <span role="cell">{classificationLabel(component.classification)}</span>
                      <span role="cell">
                        folds to {formatNumber(component.foldedFrequencyHz, 1)} Hz
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {state.mode === "quantization" ? (
              <div data-testid="sound-quantization-evidence">
                <p className="eyebrow">QUANTIZATION EVIDENCE</p>
                <p>
                  {model.quantization.levelValues.length} total levels; showing bounded preview of{" "}
                  {levelPreview.length}.
                </p>
                <p>Sample quantization metrics are measured only at sampling instants.</p>
                <div
                  className="sound-level-preview"
                  data-level-count={model.quantization.levelValues.length}
                >
                  {levelPreview.map((level) => (
                    <span
                      data-level-code={level.code}
                      data-level-value={level.value}
                      key={level.code}
                      title={`Code ${level.code}`}
                    >
                      {level.code}: {formatNumber(level.value)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="sound-summary" aria-label="Derived sound metrics">
            <div>
              <span>Nyquist</span>
              <strong>{formatNumber(model.nyquistHz, 0)} Hz</strong>
            </div>
            <div>
              {fixture.components.length === 1 ? (
                <>
                  <span>Folded frequency</span>
                  <strong>{formatNumber(model.foldedFrequencyHz, 1)} Hz</strong>
                </>
              ) : (
                <>
                  <span>Component aliasing</span>
                  <strong>
                    {aliasedComponentCount} / {model.aliasingEvidence.components.length} above
                    Nyquist
                  </strong>
                </>
              )}
            </div>
            <div>
              <span>Sample quantization RMS</span>
              <strong>{formatNumber(model.sampleQuantizationRmsError)}</strong>
            </div>
            <div>
              <span>Sample quantization peak</span>
              <strong>{formatNumber(model.sampleQuantizationPeakError)}</strong>
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
                <dd>{formatCursorTime(cursor.timeMs, cursorReadoutDigits)} ms</dd>
              </div>
              <div>
                <dt>Sample</dt>
                <dd>
                  #{cursor.sampleIndex + 1} @{" "}
                  {formatCursorTime(cursor.sampleTimestampMs, cursorReadoutDigits)} ms
                </dd>
              </div>
              <div>
                <dt>Original</dt>
                <dd>{formatNumber(cursor.original)}</dd>
              </div>
              <div>
                <dt>Code</dt>
                <dd>
                  {cursor.code} / {model.quantization.levels - 1}
                </dd>
              </div>
              <div>
                <dt>Reconstructed</dt>
                <dd>{formatNumber(cursor.reconstructed)}</dd>
              </div>
              <div>
                <dt>Reconstruction error</dt>
                <dd>{formatNumber(cursor.reconstructionError)}</dd>
              </div>
            </dl>
          </div>
          <p
            aria-atomic="true"
            aria-live="polite"
            className="sound-live-region"
            data-analysis-status={state.mode}
            data-audition={state.audition}
            data-testid="sound-audio-status"
            role="status"
          >
            {liveMessage} {audioStatus}
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
            <select
              aria-describedby="sound-rate-description"
              id="sound-rate"
              onChange={(event) =>
                dispatch({ type: "set-sample-rate", sampleRate: Number(event.target.value) })
              }
              value={state.config.sampleRate}
            >
              {!SAMPLE_RATE_STOPS.includes(state.config.sampleRate) ? (
                <option value={state.config.sampleRate}>
                  {state.config.sampleRate} Hz (scenario)
                </option>
              ) : null}
              {SAMPLE_RATE_STOPS.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} Hz
                </option>
              ))}
            </select>
            <p className="sound-control-description" id="sound-rate-description">
              Choose a teaching stop near a Nyquist crossing, or keep the exact scenario value.
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
              max="0.99"
              min={SOUND_MIN_PHASE}
              onChange={(event) =>
                dispatch({ type: "set-phase", phase: Number(event.target.value) })
              }
              step="0.01"
              type="range"
              value={state.config.phase}
            />
            <p className="sound-control-description" id="sound-phase-description">
              Moves sampling timestamps; source x(t) stays unchanged.
            </p>
            <label className="sound-label" htmlFor="sound-plot-window">
              Plot window{" "}
              <span>
                {plotWindowChoice}{" "}
                {plotWindowDefinition.kind === "periods"
                  ? "reference periods"
                  : "ms analysis window"}
              </span>
            </label>
            <select
              aria-label={
                plotWindowDefinition.kind === "periods"
                  ? "Plot window in reference periods"
                  : "Plot window analysis window in milliseconds"
              }
              id="sound-plot-window"
              onChange={(event) =>
                setPlotWindowSelection({
                  source: state.source,
                  choice: Number(event.target.value),
                })
              }
              value={plotWindowChoice}
            >
              {plotWindowDefinition.options.map((option) => (
                <option key={option} value={option}>
                  {option} {plotWindowDefinition.kind === "periods" ? "reference periods" : "ms"}
                </option>
              ))}
            </select>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">TRANSPORT</p>
            <div className="sound-button-row">
              <button className="button button-primary" onClick={play} type="button">
                Play
              </button>
              <button
                className="button button-secondary"
                onClick={() => {
                  playback.pause();
                  dispatch({ type: "pause" });
                }}
                type="button"
              >
                Pause
              </button>
              <button
                className="button button-secondary"
                onClick={() => {
                  playback.stop();
                  dispatch({ type: "stop" });
                }}
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
                {formatCursorTime(state.cursor, cursorDigits)} / {model.durationMs} ms
              </span>
            </label>
            <input
              id="sound-cursor"
              max={model.durationMs}
              min="0"
              onChange={(event) => seek(Number(event.target.value))}
              step={cursorStep}
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
              {model.anyAliasing
                ? `${model.aliasingEvidence.components.filter((component) => component.classification === "aliased").length} exposed component(s) exceed the ${model.nyquistHz} Hz Nyquist limit.`
                : "Every exposed component is below or exactly at the current Nyquist limit."}
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
