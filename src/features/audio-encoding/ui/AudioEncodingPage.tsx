import { useEffect, useMemo, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { FormulaPanel } from "../../../shared/lab/FormulaPanel";
import { LabShell } from "../../../shared/lab/LabShell";
import { RangeControl } from "../../../shared/lab/RangeControl";
import { StatusMessage, type LabPhase } from "../../../shared/lab/StatusMessage";
import { VisualizationPanel } from "../../../shared/lab/VisualizationPanel";
import {
  AUDIO_MAX_BITS,
  AUDIO_MAX_FREQUENCY,
  AUDIO_MAX_RATE,
  AUDIO_MIN_BITS,
  AUDIO_MIN_FREQUENCY,
  AUDIO_MIN_RATE,
  buildWaveform,
  calculateAudioStats,
  parseAudioEncodingScenario,
  type AudioEncodingOptions,
} from "../domain/model";

function AudioEncodingContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseAudioEncodingScenario(search), [search]);
  const [options, setOptions] = useState<AudioEncodingOptions>(scenario);
  const [phase, setPhase] = useState<LabPhase>("ready");

  useEffect(() => {
    setOptions(scenario);
    setPhase("ready");
  }, [scenario.bits, scenario.frequency, scenario.sampleRate]);

  const stats = useMemo(() => calculateAudioStats(options), [options]);
  const waveform = useMemo(() => buildWaveform(options), [options]);
  const waveformPoints = useMemo(
    () =>
      waveform
        .map((point, index) => {
          const x = waveform.length === 1 ? 50 : (index / (waveform.length - 1)) * 100;
          const y = 50 - point.reconstructed * 40;
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(" "),
    [waveform],
  );

  const update = (key: keyof AudioEncodingOptions, value: number) => {
    setOptions((current) => ({ ...current, [key]: value }));
    setPhase("editing");
  };

  const reset = () => {
    setOptions(scenario);
    setPhase("ready");
  };

  return (
    <LabShell
      controlsLabel="Audio encoding inspector"
      eyebrow="AUDIO / 01"
      title="声音编码"
      subtitle="Sampling and quantization"
      visualization={
        <section className="lesson-section" aria-labelledby="audio-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">LIVE WAVEFORM</p>
              <h2 id="audio-heading">采样后的声音</h2>
              <p className="section-description">
                频率决定波形变化；采样率决定每秒采样点；位数决定振幅等级。
              </p>
            </div>
            <span className={`phase-badge phase-${phase}`}>
              {phase === "editing" ? "Editing" : "Ready"}
            </span>
          </div>
          <VisualizationPanel
            eyebrow="WAVEFORM"
            meta={`${stats.sampleCount} samples / second`}
            footer={<span className="sample-count">1 second local fixture</span>}
          >
            <div
              className="waveform-stage"
              aria-label={`${stats.sampleCount} sampled waveform points`}
              role="group"
            >
              <svg
                aria-label={`${stats.sampleCount} reconstructed waveform samples`}
                className="waveform-svg"
                role="img"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
              >
                <line className="waveform-axis" x1="0" x2="100" y1="50" y2="50" />
                <polyline className="waveform-line" points={waveformPoints} />
              </svg>
            </div>
          </VisualizationPanel>
          <div className="summary-panel audio-summary">
            <dl className="metrics-grid">
              <div className="metric-item">
                <dt>Samples / sec</dt>
                <dd>{stats.samplesPerSecond}</dd>
              </div>
              <div className="metric-item">
                <dt>Amplitude levels</dt>
                <dd>{stats.amplitudeLevels}</dd>
              </div>
              <div className="metric-item">
                <dt>Encoded bits</dt>
                <dd>{stats.encodedBits}</dd>
              </div>
              <div className="metric-item">
                <dt>Encoded bytes</dt>
                <dd>{stats.encodedBytes}</dd>
              </div>
            </dl>
          </div>
        </section>
      }
      controls={
        <div className="inspector-panel audio-controls">
          <div className="inspector-heading">
            <p className="eyebrow">INSPECTOR</p>
            <strong>Encoding settings</strong>
          </div>
          <RangeControl
            description="Cycles per second in the local fixture."
            id="audio-frequency"
            label="Frequency"
            max={AUDIO_MAX_FREQUENCY}
            min={AUDIO_MIN_FREQUENCY}
            onChange={(value) => update("frequency", value)}
            unit=" Hz"
            value={options.frequency}
          />
          <RangeControl
            description="Samples captured in one second."
            id="sample-rate"
            label="Sampling rate"
            max={AUDIO_MAX_RATE}
            min={AUDIO_MIN_RATE}
            onChange={(value) => update("sampleRate", value)}
            unit=" /s"
            value={options.sampleRate}
          />
          <RangeControl
            description="Bits used for each sampled amplitude."
            id="audio-bits"
            label="Quantization bits"
            max={AUDIO_MAX_BITS}
            min={AUDIO_MIN_BITS}
            onChange={(value) => update("bits", value)}
            unit=" bit"
            value={options.bits}
          />
        </div>
      }
      explanation={
        <FormulaPanel
          title="AUDIO ENCODING FORMULA"
          rows={[
            { label: "Samples", value: `${stats.sampleCount} samples` },
            { label: "Packed payload", value: `${stats.sampleCount} × ${options.bits} bits` },
            { label: "Encoded bytes", value: `${stats.encodedBytes} bytes` },
            { label: "Preset", value: scenario.scenario },
          ]}
        />
      }
      actions={
        <div className="inspector-actions">
          <StatusMessage
            phase={phase}
            title={phase === "editing" ? "Listening" : "Ready"}
            detail="Move controls to inspect the local representation."
          />
          <button className="button button-secondary" onClick={reset} type="button">
            Reset
          </button>
        </div>
      }
    />
  );
}

export function AudioEncodingPage() {
  const search = useSearch({ from: "/labs/audio-encoding" });
  return <AudioEncodingContent search={search} />;
}
