import {
  BIT_DEPTH_PRESETS,
  DEFAULT_PARAMS,
  SAMPLE_RATE_PRESETS,
  type AudioParams,
  type PcmAudio,
} from "../domain/audio.ts";
import { durationOf } from "../domain/audio.ts";
import { formatBytes, formatHz, formatKbps, pcmBitRate, pcmByteSize } from "../domain/metrics.ts";
import { quantizationLevels } from "../domain/quantize.ts";
import type { AudioStageDef } from "../domain/stages.ts";

/**
 * Left-hand controls: material source + digitization knobs + live PCM
 * estimates. Pure presentation — every change flows back through
 * `onParams`/`onSourceRequest` so the draft stays the single truth.
 */
export function ParamsPanel(props: {
  stage: AudioStageDef;
  params: AudioParams;
  source: { kind: "fixture" | "file" | "mic"; label: string; audio: PcmAudio } | null;
  fixtureLabel: string;
  importing: boolean;
  recording: boolean;
  busy: boolean;
  onParams: (p: Partial<AudioParams>) => void;
  onPickFixture: () => void;
  onPickFile: (file: File) => void;
  onToggleRecord: () => void;
}) {
  const { params, stage, source } = props;
  const seconds = source ? durationOf(source.audio) : 0;
  const effectiveCh = source
    ? params.channels === 1
      ? 1
      : Math.min(2, source.audio.channels.length)
    : params.channels;
  const estimate = {
    bitrate: pcmBitRate({ ...params, channels: effectiveCh as 1 | 2 }),
    size: pcmByteSize({ ...params, channels: effectiveCh as 1 | 2 }, seconds),
  };

  return (
    <section className="ae-panel" aria-label="输入音频与编码参数">
      <div className="ae-panel-heading">
        <h3>① 素材</h3>
      </div>
      <div className="ae-source-row" role="group" aria-label="选择音频来源">
        <button
          className={`button-secondary ae-chip${source?.kind === "fixture" ? " is-active" : ""}`}
          onClick={props.onPickFixture}
          type="button"
        >
          本关测试信号 {props.fixtureLabel}
        </button>
        <label className={`button-secondary ae-chip${source?.kind === "file" ? " is-active" : ""}`}>
          导入音频文件
          <input
            accept="audio/*"
            aria-label="导入音频文件"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) props.onPickFile(file);
              e.target.value = "";
            }}
            type="file"
          />
        </label>
        <button
          className={`button-secondary ae-chip${props.recording ? " is-rec" : ""}`}
          onClick={props.onToggleRecord}
          type="button"
        >
          {props.recording ? "■ 停止录音" : "● 麦克风录音"}
        </button>
      </div>
      <p className="ae-source-status" role="status">
        {props.importing
          ? "正在载入音频…"
          : source
            ? `当前素材：${source.label} · ${durationOf(source.audio).toFixed(2)} 秒 · ${source.audio.sampleRate} Hz · ${source.audio.channels.length} 声道`
            : "还没有素材——选一个来源。"}
        {props.recording ? "（录音中，最长 15 秒，结束后自动载入）" : ""}
      </p>
      <p className="ae-hint">
        音频只在你的浏览器里处理，不会上传。浏览器能解码的格式（常见 mp3 / wav / ogg /
        m4a）都可以导入。
      </p>

      <div className="ae-panel-heading">
        <h3>② 编码参数</h3>
        <button
          className="button-ghost"
          onClick={() => props.onParams(DEFAULT_PARAMS)}
          type="button"
        >
          恢复默认
        </button>
      </div>

      <fieldset className="ae-field">
        <legend>目标采样率（奈奎斯特上限 {formatHz(params.sampleRate / 2)}）</legend>
        <div className="ae-chip-row">
          {SAMPLE_RATE_PRESETS.map((rate) => (
            <button
              aria-pressed={params.sampleRate === rate}
              className={`ae-chip${params.sampleRate === rate ? " is-active" : ""}`}
              key={rate}
              onClick={() => props.onParams({ sampleRate: rate })}
              type="button"
            >
              {rate >= 1000 ? `${rate / 1000}k` : rate}
            </button>
          ))}
          <label className="ae-custom">
            自定义
            <input
              aria-label="自定义采样率"
              max={96000}
              min={2000}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v) && v >= 2000 && v <= 96000) {
                  props.onParams({ sampleRate: Math.round(v) });
                }
              }}
              step={100}
              type="number"
              value={params.sampleRate}
            />
          </label>
        </div>
        <p className="ae-hint">
          采样率 ÷ 2 = 理论上还能表示的最高频率；更高的分量会混叠，不是消失。
        </p>
      </fieldset>

      <fieldset className="ae-field">
        <legend>
          量化位深（{quantizationLevels(params.bitDepth)} 级 / {params.bitDepth} bit）
        </legend>
        <div className="ae-chip-row">
          {BIT_DEPTH_PRESETS.map((bits) => (
            <button
              aria-pressed={params.bitDepth === bits}
              className={`ae-chip${params.bitDepth === bits ? " is-active" : ""}`}
              key={bits}
              onClick={() => props.onParams({ bitDepth: bits })}
              type="button"
            >
              {bits} bit
            </button>
          ))}
        </div>
        <p className="ae-hint">等级数 = 2^位深。位数越少，量化台阶越粗，叠加的噪声地板越高。</p>
      </fieldset>

      <fieldset className="ae-field">
        <legend>声道策略</legend>
        <div className="ae-chip-row">
          <button
            aria-pressed={params.channels === 2}
            className={`ae-chip${params.channels === 2 ? " is-active" : ""}`}
            onClick={() => props.onParams({ channels: 2 })}
            type="button"
          >
            保留声道
          </button>
          <button
            aria-pressed={params.channels === 1}
            className={`ae-chip${params.channels === 1 ? " is-active" : ""}`}
            onClick={() => props.onParams({ channels: 1 })}
            type="button"
          >
            转单声道
          </button>
        </div>
        <p className="ae-hint">
          转单声道 = 各声道取平均后合成一路；保留声道 = 每一路分别处理。数据量与声道数成正比。
        </p>
      </fieldset>

      {stage.probes.length > 0 ? (
        <div className="ae-probe-row">
          {stage.probes.map((probe) => (
            <button
              className="button-ghost"
              key={probe.label}
              onClick={() => props.onParams(probe.params)}
              type="button"
            >
              {probe.label}
            </button>
          ))}
        </div>
      ) : null}

      <p className="ae-estimate" aria-live="polite">
        估算 PCM：{formatKbps(estimate.bitrate)} · 这段素材约 {formatBytes(estimate.size)}
        <span className="ae-hint">
          （理论估算：采样率×位深×声道数×时长，不含 WAV 容器头与元数据；不是 MP3/AAC 的大小）
        </span>
      </p>
    </section>
  );
}
