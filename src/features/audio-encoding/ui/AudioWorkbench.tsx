import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderSignal, signalSpecFor } from "../domain/signals.ts";
import type { AudioParams, PcmAudio } from "../domain/audio.ts";
import type { AudioEncodingJudgeResult } from "../domain/protocol.ts";
import type { AudioStageDef } from "../domain/stages.ts";
import type { DigitizeResult } from "../domain/digitize.ts";
import { formatDb } from "../domain/metrics.ts";
import { decodeFileToPcm, startMicRecording, type MicRecorder } from "./audioEngine.ts";
import { runDigitize, DigitizeCancelled, type DigitizeJob } from "./runDigitize.ts";
import { useAudioPlayer } from "./useAudioPlayer.ts";
import { WaveformCanvas } from "./WaveformCanvas.tsx";
import { InspectPanel } from "./InspectPanel.tsx";
import { ParamsPanel } from "./ParamsPanel.tsx";
import { MetricsPanel } from "./MetricsPanel.tsx";
import { GuidedPanel } from "./GuidedPanel.tsx";

type Source = { kind: "fixture" | "file" | "mic"; label: string; audio: PcmAudio };

type Props = {
  stage: AudioStageDef;
  userId: string | undefined;
  params: AudioParams;
  guidedAnswers: Record<string, number>;
  verdict: AudioEncodingJudgeResult | null;
  busy: boolean;
  onParams: (p: Partial<AudioParams>) => void;
  onGuidedAnswer: (id: string, option: number) => void;
  onSubmit: () => void;
};

const guidedReady = (stage: AudioStageDef, answers: Record<string, number>) =>
  stage.guided ? stage.guided.prompts.every((p) => answers[p.id] != null) : true;

export function AudioWorkbench(props: Props) {
  const { stage, userId, params } = props;
  const spec = useMemo(() => signalSpecFor(userId, stage), [userId, stage]);
  const [source, setSource] = useState<Source | null>(null);
  const [importing, setImporting] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [result, setResult] = useState<DigitizeResult | null>(null);
  const jobRef = useRef<DigitizeJob | null>(null);
  const micRef = useRef<MicRecorder | null>(null);
  const player = useAudioPlayer();

  const loadFixture = useCallback(() => {
    setError(null);
    setSource({ kind: "fixture", label: spec.label, audio: renderSignal(spec) });
    setResult(null);
  }, [spec]);

  // The stage's own fixture is the default material — always available,
  // deterministic per student, and identical to what the judge re-creates.
  useEffect(() => {
    loadFixture();
  }, [loadFixture]);

  useEffect(() => {
    player.setSource("original", source?.audio ?? null);
    if (!result) player.setSource("processed", null);
  }, [source, result]);

  const pickFile = useCallback(async (file: File) => {
    setImporting(true);
    setError(null);
    try {
      const audio = await decodeFileToPcm(file);
      setSource({ kind: "file", label: file.name, audio });
      setResult(null);
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
          setResult(null);
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

  const cancelProcessing = useCallback(() => {
    jobRef.current?.cancel();
    jobRef.current = null;
    setProcessing(null);
  }, []);

  const process = useCallback(() => {
    if (!source || processing) return;
    setError(null);
    setProcessing("启动处理…");
    const job = runDigitize(source.audio, params, (phase, done, total) => {
      const label = phase === "resample" ? "重采样" : phase === "quantize" ? "量化" : "混声道";
      setProcessing(`${label} ${done}/${total}`);
    });
    jobRef.current = job;
    job.promise
      .then((res) => {
        if (jobRef.current !== job) return; // stale job
        setResult(res);
        player.setSource("processed", res.audio);
      })
      .catch((e) => {
        if (e instanceof DigitizeCancelled) return;
        setError(e instanceof Error ? e.message : "处理失败。");
      })
      .finally(() => {
        if (jobRef.current === job) {
          jobRef.current = null;
          setProcessing(null);
        }
      });
  }, [source, params, processing, player]);

  useEffect(
    () => () => {
      jobRef.current?.cancel();
      micRef.current?.cancel();
    },
    [],
  );

  const ready = guidedReady(stage, props.guidedAnswers);
  const needProcess = stage.kind !== "guided" && !result;
  const spanSeconds = source
    ? Math.max(0.05, source.audio.channels[0].length / source.audio.sampleRate)
    : 1;

  return (
    <div className="ae-workbench">
      <div className="ae-left">
        <ParamsPanel
          busy={props.busy || processing != null}
          fixtureLabel={spec.label}
          importing={importing}
          onParams={props.onParams}
          onPickFile={pickFile}
          onPickFixture={loadFixture}
          onToggleRecord={toggleRecord}
          params={params}
          recording={recording}
          source={source}
          stage={stage}
        />
      </div>
      <div className="ae-right">
        {stage.guided ? (
          <GuidedPanel
            answers={props.guidedAnswers}
            disabled={props.busy}
            onAnswer={props.onGuidedAnswer}
            prompts={stage.guided.prompts}
          />
        ) : null}
        {error ? (
          <p className="ae-error" role="alert">
            {error}
          </p>
        ) : null}
        <section aria-label="波形对比" className="ae-panel">
          <div className="ae-panel-heading">
            <h3>③ 处理与对比</h3>
            <div className="ae-action-row">
              <button
                className="button-primary"
                disabled={!source || processing != null || props.busy}
                onClick={process}
                type="button"
              >
                {processing ?? "开始数字化"}
              </button>
              {processing ? (
                <button className="button-secondary" onClick={cancelProcessing} type="button">
                  取消
                </button>
              ) : null}
            </div>
          </div>
          {source ? (
            <div className="ae-waves">
              <div className="ae-wave-block">
                <div className="ae-wave-head">
                  <span>原音 · {source.audio.sampleRate} Hz</span>
                  <PlayButtons
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
                      ? `${result.audio.sampleRate} Hz`
                      : `目标 ${params.sampleRate} Hz / ${params.bitDepth} bit`}
                  </span>
                  <PlayButtons
                    label="处理音"
                    onPlay={() => (result ? player.play("processed") : undefined)}
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
                  <p className="ae-placeholder">
                    {processing ? processing : "点「开始数字化」生成处理后音频。"}
                  </p>
                )}
              </div>
              {result ? (
                <button
                  className="button-ghost"
                  onClick={() =>
                    player.swapTo(player.playing === "original" ? "processed" : "original")
                  }
                  type="button"
                >
                  A/B 切换（同位置对比）
                </button>
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
        {props.verdict ? <VerdictPanel verdict={props.verdict} /> : null}
        <div className="ae-submit-row">
          <button
            className="button-primary"
            disabled={props.busy || !ready || needProcess}
            onClick={props.onSubmit}
            title={needProcess ? "先「开始数字化」再提交" : !ready ? "先答完上面的引导题" : ""}
            type="button"
          >
            提交本关
          </button>
          {!ready ? <span className="ae-hint">答完引导题后才能提交。</span> : null}
          {needProcess ? <span className="ae-hint">先运行一次数字化，再提交你的参数。</span> : null}
        </div>
      </div>
    </div>
  );
}

function PlayButtons(props: {
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

function VerdictPanel(props: { verdict: AudioEncodingJudgeResult }) {
  const { verdict } = props;
  return (
    <section
      aria-label="判定结果"
      className={`ae-panel ae-verdict ${verdict.passed ? "is-pass" : "is-fail"}`}
    >
      <div className="ae-panel-heading">
        <h3>{verdict.passed ? "✓ 通过" : "✗ 还没过"}</h3>
        <span className="ae-progress-note">信号：{verdict.signalLabel}</span>
      </div>
      <ul className="ae-check-list">
        {verdict.checks.map((check) => (
          <li className={check.ok ? "is-ok" : "is-bad"} key={check.id}>
            {check.ok ? "✓" : "✗"} {check.label}
            {check.detail ? <span className="ae-check-detail">{check.detail}</span> : null}
          </li>
        ))}
      </ul>
      {verdict.measured.snrDb != null || verdict.measured.sizeBytes != null ? (
        <p className="ae-hint">
          实测：{verdict.measured.snrDb != null ? `SNR ${formatDb(verdict.measured.snrDb)}` : ""}
          {verdict.measured.sizeBytes != null
            ? ` · 大小 ${(verdict.measured.sizeBytes / 1000).toFixed(1)} KB`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
