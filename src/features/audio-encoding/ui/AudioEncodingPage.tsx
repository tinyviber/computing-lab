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
  compare: "对照（compare）",
  aliasing: "混叠（aliasing）",
  quantization: "量化（quantization）",
};

const VIEW_LABELS: Record<SoundView, string> = {
  compare: "对照",
  samples: "采样点",
  levels: "量化级别",
  error: "重建误差",
};

const SOURCE_COPY: Record<SoundSource, { label: string; description: string }> = {
  pure440: {
    label: "纯 440 Hz 音调",
    description: "440 Hz 纯音。",
  },
  "high-pulse": {
    label: "高频脉冲",
    description: "高频脉冲序列。",
  },
  speech: {
    label: "类语音信号",
    description: "由多个频率组成的组合信号。",
  },
  sawtooth: {
    label: "锯齿波",
    description: "含多个谐波的斜坡信号，可显示量化台阶。",
  },
};

const TRANSPORT_LABELS = {
  stopped: "已停止",
  playing: "播放中",
  paused: "已暂停",
} as const;

const AUDITION_LABELS = {
  original: "原始信号",
  reconstructed: "重建信号",
} as const;

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
  if (classification === "aliased") return "发生混叠（aliased）";
  if (classification === "at") return "恰在奈奎斯特频率（at Nyquist）";
  return "低于奈奎斯特频率（below Nyquist）";
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
  const [audioStatus, setAudioStatus] = useState("按下“播放”后，音频试听就绪。");
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
  const plotWindowWidthMs = plotWindow.endMs - plotWindow.startMs;
  const isLooping = state.loop !== "off";
  const selectedView = state.view;
  const showOriginal = selectedView === "compare" || selectedView === "samples";
  const showReconstructed = selectedView !== "error";
  const plotError = selectedView === "error";
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

  const sourceCopy = SOURCE_COPY[state.source];
  const liveMessage = `${sourceCopy.label}；${TRANSPORT_LABELS[state.transport]}；光标 ${formatCursorTime(cursor.timeMs, cursorDigits)} 毫秒。`;

  const play = () => {
    const result = playback.play(playbackRequest);
    setAudioStatus(
      result.available
        ? `${AUDITION_LABELS[state.audition]}正在播放。`
        : "音频不可用；当前使用仅视觉播放。",
    );
    dispatch({ type: "play" });
  };

  const seek = (cursorMs: number) => {
    const nextRequest = { ...playbackRequest, cursorMs };
    if (state.transport === "playing") playback.seek(nextRequest);
    dispatch({ type: "seek", cursor: cursorMs });
  };

  return (
    <LabShell eyebrow="音频 / 01" title="声音编码" subtitle="采样与量化">
      <div className="sound-feature-layout">
        <section className="lesson-section sound-visualization" aria-labelledby="sound-heading">
          <div className="section-heading">
            <div>
              <h2 id="sound-heading">采样、量化与重建</h2>
              <p className="section-description">
                数值来自本地示例。图表按每一步推进；试听使用 48 kHz。
              </p>
            </div>
            <span className="sound-transport-badge">{TRANSPORT_LABELS[state.transport]}</span>
          </div>

          <div className="sound-panel sound-plot-panel">
            <div className="sound-panel-header">
              <span>波形图</span>
              <code>
                {plot.length} 个点 · {formatNumber(plotWindowWidthMs, 1)} 毫秒窗口 ·{" "}
                {formatNumber(plotWindow.startMs, 1)}–{formatNumber(plotWindow.endMs, 1)} 毫秒 /{" "}
                {model.sampleCount} 个采样点
              </code>
            </div>
            <div
              aria-label={`${sourceCopy.label} ${VIEW_LABELS[selectedView]} 波形图`}
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
                    aria-label="重建误差"
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
                <i className="sound-legend-original" /> 原始信号
              </span>
              <span>
                <i className="sound-legend-reconstructed" /> 采样保持重建
              </span>
              <span>
                <i className="sound-legend-error" /> 重建误差
              </span>
            </div>
          </div>

          <div className="sound-mode-evidence" data-sound-mode={state.mode}>
            {state.mode === "compare" ? (
              <div data-testid="sound-compare-evidence">
                <p className="eyebrow">对照结果</p>
                <p>原始信号不会随着采样设置改变。你可以在“原始信号”和“重建信号”之间切换试听。</p>
              </div>
            ) : null}
            {state.mode === "aliasing" ? (
              <div data-testid="sound-aliasing-evidence">
                <p className="eyebrow">频率分量混叠结果</p>
                <p>
                  {model.anyAliasing
                    ? "至少一个可见频率分量高于当前奈奎斯特频率。"
                    : "每个可见频率分量都低于或恰在当前奈奎斯特频率。"}
                </p>
                <p>
                  采样频率的一半是奈奎斯特频率；超过这个上限的分量会折叠到可表示范围内，表格列出每个分量的结果。
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
                        折叠到 {formatNumber(component.foldedFrequencyHz, 1)} Hz
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {state.mode === "quantization" ? (
              <div data-testid="sound-quantization-evidence">
                <p className="eyebrow">量化结果</p>
                <p>共 {model.quantization.levelValues.length} 个量化级别；当前显示部分量化级别。</p>
                <p>采样量化指标只在采样时刻测量。</p>
                <p>量化位数决定可用的量化级别数；位数越少，每个采样值能表示的精度越低。</p>
                <div
                  className="sound-level-preview"
                  data-level-count={model.quantization.levelValues.length}
                >
                  {levelPreview.map((level) => (
                    <span
                      data-level-code={level.code}
                      data-level-value={level.value}
                      key={level.code}
                      title={`量化码 ${level.code}`}
                    >
                      {level.code}: {formatNumber(level.value)}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="sound-summary" aria-label="声音读数" role="region">
            <div>
              <span>奈奎斯特频率</span>
              <strong>{formatNumber(model.nyquistHz, 0)} Hz</strong>
            </div>
            <div>
              <span>频率分量</span>
              <strong>{model.aliasingEvidence.components.length} 个</strong>
            </div>
            <div>
              <span>采样量化均方根误差</span>
              <strong>{formatNumber(model.sampleQuantizationRmsError)}</strong>
            </div>
            <div>
              <span>采样量化峰值误差</span>
              <strong>{formatNumber(model.sampleQuantizationPeakError)}</strong>
            </div>
            <div>
              <span>理论数据量</span>
              <strong>
                {model.payload.totalBits} bits / {model.payload.totalBytes} B
              </strong>
            </div>
          </div>

          <div className="sound-readout" aria-label="光标读数">
            <p className="eyebrow">光标读数</p>
            <dl>
              <div>
                <dt>时间</dt>
                <dd>{formatCursorTime(cursor.timeMs, cursorReadoutDigits)} ms</dd>
              </div>
              <div>
                <dt>采样点</dt>
                <dd>
                  #{cursor.sampleIndex + 1} @{" "}
                  {formatCursorTime(cursor.sampleTimestampMs, cursorReadoutDigits)} ms
                </dd>
              </div>
              <div>
                <dt>原始值</dt>
                <dd>{formatNumber(cursor.original)}</dd>
              </div>
              <div>
                <dt>量化码</dt>
                <dd>
                  {cursor.code} / {model.quantization.levels - 1}
                </dd>
              </div>
              <div>
                <dt>重建值</dt>
                <dd>{formatNumber(cursor.reconstructed)}</dd>
              </div>
              <div>
                <dt>重建误差</dt>
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

        <aside aria-label="声音设置" className="sound-inspector">
          <div className="sound-inspector-section">
            <p className="eyebrow">信号源</p>
            <label className="sound-label" htmlFor="sound-source">
              信号源
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
                  {SOURCE_COPY[source].label}
                </option>
              ))}
            </select>
            <p className="sound-control-description">{sourceCopy.description}</p>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">配置</p>
            <label className="sound-label" htmlFor="sound-rate">
              采样频率 <span>{state.config.sampleRate} Hz</span>
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
                  {state.config.sampleRate} Hz（情境值）
                </option>
              ) : null}
              {SAMPLE_RATE_STOPS.map((rate) => (
                <option key={rate} value={rate}>
                  {rate} Hz
                </option>
              ))}
            </select>
            <p className="sound-control-description" id="sound-rate-description">
              选择采样率；可使用接近奈奎斯特频率的档位或情境值。
            </p>
            <label className="sound-label" htmlFor="sound-bits">
              量化位数（bit depth） <span>{state.config.bitDepth} bit</span>
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
              量化级别数为 2 的量化位数次方。
            </p>
            <label className="sound-label" htmlFor="sound-phase">
              相位 <span>{formatNumber(state.config.phase, 2)} 圈</span>
            </label>
            <input
              aria-label="相位"
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
              移动采样时间戳；信号源 x(t) 保持不变。
            </p>
            <label className="sound-label" htmlFor="sound-plot-window">
              波形窗口{" "}
              <span>
                {plotWindowChoice}{" "}
                {plotWindowDefinition.kind === "periods" ? "个参考周期" : "毫秒分析窗口"}
              </span>
            </label>
            <select
              aria-label={
                plotWindowDefinition.kind === "periods"
                  ? "以参考周期表示的波形窗口"
                  : "以毫秒表示的波形分析窗口"
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
                  {option} {plotWindowDefinition.kind === "periods" ? "个参考周期" : "毫秒"}
                </option>
              ))}
            </select>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">播放控制</p>
            <div className="sound-button-row">
              <button className="button button-primary" onClick={play} type="button">
                播放
              </button>
              <button
                className="button button-secondary"
                onClick={() => {
                  playback.pause();
                  dispatch({ type: "pause" });
                }}
                type="button"
              >
                暂停
              </button>
              <button
                className="button button-secondary"
                onClick={() => {
                  playback.stop();
                  dispatch({ type: "stop" });
                }}
                type="button"
              >
                停止
              </button>
            </div>
            <button
              className="button button-secondary sound-step-button"
              onClick={() => dispatch({ type: "tick", deltaMs: 100 })}
              type="button"
            >
              前进 100 毫秒
            </button>
            <label className="sound-label" htmlFor="sound-cursor">
              光标{" "}
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
              循环播放完整情境
            </label>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">试听信号</p>
            <div className="sound-choice-row" role="group" aria-label="试听信号源">
              {(["original", "reconstructed"] as const).map((audition) => (
                <button
                  aria-pressed={state.audition === audition}
                  className="sound-choice"
                  key={audition}
                  onClick={() => dispatch({ type: "set-audition", audition })}
                  type="button"
                >
                  {AUDITION_LABELS[audition]}
                </button>
              ))}
            </div>
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">分析模式</p>
            <div className="sound-choice-row" role="group" aria-label="分析模式">
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
          </div>

          <div className="sound-inspector-section">
            <p className="eyebrow">视图</p>
            <div className="sound-choice-row sound-view-row" role="group" aria-label="波形视图">
              {(Object.keys(VIEW_LABELS) as SoundView[]).map((view) => (
                <button
                  aria-label={view === "compare" ? "叠加视图" : undefined}
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
            恢复默认状态
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
