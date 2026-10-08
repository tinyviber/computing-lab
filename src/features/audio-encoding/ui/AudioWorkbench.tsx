import { useCallback, useEffect, useRef, useState } from "react";
import { demoSignalById, renderSignal } from "../domain/signals.ts";
import type { AudioParams } from "../domain/audio.ts";
import { durationOf } from "../domain/audio.ts";
import type { DigitizeResult } from "../domain/digitize.ts";
import { decodeFileToPcm, startMicRecording, type MicRecorder } from "./audioEngine.ts";
import { runDigitize, DigitizeCancelled, type DigitizeJob } from "./runDigitize.ts";
import { useAudioPlayer } from "./useAudioPlayer.ts";
import { WaveformCanvas } from "./WaveformCanvas.tsx";
import { InspectPanel } from "./InspectPanel.tsx";
import { MetricsPanel } from "./MetricsPanel.tsx";
import { ParamsPanel, type AudioSource } from "./ParamsPanel.tsx";

/**
 * The whole demo surface. Params live in the page (so ?rate=&bits=&ch=
 * links work); audio source, processing jobs, and playback live here.
 * Processing re-runs automatically on every param/source change — the
 * demo is "turn the knob, watch the digits", not a submit-and-wait lab.
 */
export function AudioWorkbench(props: {
  params: AudioParams;
  initialSignalId: string | undefined;
  onParams: (p: Partial<AudioParams>) => void;
  /** Report which preset is loaded (null for file/mic) so the share URL stays accurate. */
  onSignalId?: (id: string | null) => void;
}) {
  const { params } = props;
  const [source, setSource] = useState<AudioSource | null>(null);
  const [importing, setImporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [result, setResult] = useState<DigitizeResult | null>(null);
  const jobRef = useRef<DigitizeJob | null>(null);
  const micRef = useRef<MicRecorder | null>(null);
  const debounceRef = useRef<number | null>(null);
  const player = useAudioPlayer();

  const pickPreset = useCallback(
    (id: string) => {
      const sig = demoSignalById(id);
      setError(null);
      setSource({ kind: "preset", id: sig.id, label: sig.name, audio: renderSignal(sig.spec) });
      props.onSignalId?.(sig.id);
    },
    [props],
  );

  // Default material: the preset named by the URL (or the first one).
  // Runs once on mount — the initial preset is a starting point, not a binding.
  useEffect(() => {
    pickPreset(props.initialSignalId ?? "");
  }, []);

  const pickFile = useCallback(async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const audio = await decodeFileToPcm(file);
      setSource({ kind: "file", label: file.name, audio });
      props.onSignalId?.(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "导入失败。");
    } finally {
      setImporting(false);
    }
  }, []);

  const toggleRecord = useCallback(async () => {
    if (recording) {
      setRecording(false);
      setImporting(true);
      try {
        const audio = await micRef.current?.stop();
        if (audio) {
          setSource({ kind: "mic", label: "麦克风录音", audio });
          props.onSignalId?.(null);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "录音失败。");
      } finally {
        micRef.current = null;
        setImporting(false);
      }
      return;
    }
    setError(null);
    try {
      micRef.current = await startMicRecording();
      setRecording(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "无法启动录音。");
    }
  }, [recording]);

  // Live re-digitize: every param/source change schedules a fresh job; the
  // debounce collapses chip-click bursts, and a stale job's result is
  // dropped by id — the displayed output always matches current knobs.
  useEffect(() => {
    if (!source) return;
    if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      jobRef.current?.cancel();
      setProcessing("处理中…");
      const job = runDigitize(source.audio, params);
      jobRef.current = job;
      job.promise
        .then((res) => {
          if (jobRef.current !== job) return;
          setResult(res);
          player.setSource("processed", res.audio);
        })
        .catch((e) => {
          if (e instanceof DigitizeCancelled) return;
          if (jobRef.current === job) setError(e instanceof Error ? e.message : "处理失败。");
        })
        .finally(() => {
          if (jobRef.current === job) {
            jobRef.current = null;
            setProcessing(null);
          }
        });
    }, 120);
    return () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [source, params, player]);

  useEffect(() => {
    player.setSource("original", source?.audio ?? null);
  }, [source, player]);

  useEffect(
    () => () => {
      jobRef.current?.cancel();
      micRef.current?.cancel();
    },
    [],
  );

  const spanSeconds = source ? Math.max(0.05, durationOf(source.audio)) : 1;

  return (
    <div className="ae-workbench">
      <div className="ae-left">
        <ParamsPanel
          importing={importing}
          onParams={props.onParams}
          onPickFile={pickFile}
          onPickPreset={pickPreset}
          onToggleRecord={toggleRecord}
          params={params}
          recording={recording}
          source={source}
        />
      </div>
      <div className="ae-right">
        {error ? (
          <p className="ae-error" role="alert">
            {error}
          </p>
        ) : null}
        <section aria-label="波形对比" className="ae-panel">
          <div className="ae-panel-heading">
            <h3>③ 处理前后对比</h3>
            {processing ? (
              <span className="ae-progress-note" role="status">
                {processing}
              </span>
            ) : null}
          </div>
          {source ? (
            <div className="ae-waves">
              <div className="ae-wave-block">
                <div className="ae-wave-head">
                  <span>原音 · {source.audio.sampleRate} Hz</span>
                  <PlayButton
                    label="原音"
                    onPlay={() => player.play("original")}
                    onStop={player.stop}
                    playing={player.playing === "original"}
                  />
                </div>
                <WaveformCanvas
                  audio={source.audio}
                  color="#526579"
                  label="原音波形"
                  spanSeconds={spanSeconds}
                />
              </div>
              <div className="ae-wave-block">
                <div className="ae-wave-head">
                  <span>
                    处理后 ·{" "}
                    {result
                      ? `${result.audio.sampleRate} Hz / ${params.bitDepth} bit`
                      : `目标 ${params.sampleRate} Hz / ${params.bitDepth} bit`}
                  </span>
                  <PlayButton
                    label="处理音"
                    onPlay={() => {
                      if (result) player.play("processed");
                    }}
                    onStop={player.stop}
                    playing={player.playing === "processed"}
                  />
                </div>
                {result ? (
                  <WaveformCanvas
                    audio={result.audio}
                    color="#4f46e5"
                    label="处理后波形"
                    spanSeconds={spanSeconds}
                  />
                ) : (
                  <p className="ae-placeholder">{processing ?? "调整参数即自动重新处理。"}</p>
                )}
              </div>
              {result ? (
                <div className="ae-action-row">
                  <button
                    className="button-ghost"
                    onClick={() =>
                      player.swapTo(player.playing === "original" ? "processed" : "original")
                    }
                    type="button"
                  >
                    A/B 切换（同位置对比）
                  </button>
                  <span className="ae-hint">
                    如果演示机有声音，可以播放对比；没有也能看图理解。
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
        {source ? (
          <InspectPanel
            bitDepth={params.bitDepth}
            original={source.audio}
            processed={result?.audio ?? null}
            targetRate={params.sampleRate}
          />
        ) : null}
        {source && result ? (
          <MetricsPanel original={source.audio} params={params} result={result} />
        ) : null}
      </div>
    </div>
  );
}

function PlayButton(props: {
  label: string;
  playing: boolean;
  onPlay: () => void;
  onStop: () => void;
}) {
  return (
    <span className="ae-play-row">
      {props.playing ? (
        <button
          aria-label={`停止${props.label}`}
          className="button-ghost"
          onClick={props.onStop}
          type="button"
        >
          ■ 停止
        </button>
      ) : (
        <button
          aria-label={`播放${props.label}`}
          className="button-ghost"
          onClick={props.onPlay}
          type="button"
        >
          ▶ 播放
        </button>
      )}
    </span>
  );
}
