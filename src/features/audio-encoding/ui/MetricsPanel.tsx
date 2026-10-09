import type { PcmAudio } from "../domain/audio.ts";
import { durationOf } from "../domain/audio.ts";
import type { DigitizeResult } from "../domain/digitize.ts";
import {
  audioPeak,
  formatBytes,
  formatDb,
  formatHz,
  formatKbps,
  pcmBitRate,
  pcmByteSize,
} from "../domain/metrics.ts";
import { quantizationLevels } from "../domain/quantize.ts";
import type { AudioParams } from "../domain/audio.ts";

function Row(props: { label: string; original: string; processed: string }) {
  return (
    <tr>
      <th scope="row">{props.label}</th>
      <td>{props.original}</td>
      <td>{props.processed}</td>
    </tr>
  );
}

/** 处理前后指标表：所有数字都有计算口径说明，估算值明确标注。 */
export function MetricsPanel(props: {
  original: PcmAudio;
  params: AudioParams;
  result: DigitizeResult | null;
}) {
  const { original, params, result } = props;
  const srcCh = original.channels.length;
  const outCh = result?.effectiveChannels ?? 0;
  const outRate = result?.audio.sampleRate ?? params.sampleRate;
  const outSecs = result ? durationOf(result.audio) : 0;
  const srcSecs = durationOf(original);
  const levels = quantizationLevels(params.bitDepth);
  const minSnr = result?.quantization.length
    ? Math.min(...result.quantization.map((q) => q.snrDb))
    : null;
  const maxErr = result?.quantization.length
    ? Math.max(...result.quantization.map((q) => q.maxError))
    : null;
  const halfStep = 1 / 2 ** (params.bitDepth - 1);

  return (
    <section className="ae-panel" aria-label="指标对比">
      <div className="ae-panel-heading">
        <h3>指标对比</h3>
      </div>
      <table className="ae-metrics">
        <thead>
          <tr>
            <th scope="col">项目</th>
            <th scope="col">原始</th>
            <th scope="col">处理后</th>
          </tr>
        </thead>
        <tbody>
          <Row
            label="采样率"
            original={formatHz(original.sampleRate)}
            processed={result ? formatHz(outRate) : "—"}
          />
          <Row
            label="位深"
            original="浮点源（≈32bit）"
            processed={result ? `${params.bitDepth} bit` : "—"}
          />
          <Row label="声道数" original={`${srcCh}`} processed={result ? `${outCh}` : "—"} />
          <Row
            label="时长"
            original={`${srcSecs.toFixed(3)} s`}
            processed={result ? `${outSecs.toFixed(3)} s` : "—"}
          />
          <Row
            label="峰值"
            original={audioPeak(original).toFixed(3)}
            processed={result ? audioPeak(result.audio).toFixed(3) : "—"}
          />
          <Row label="量化级数" original="—" processed={result ? `${levels} 级` : "—"} />
          <Row
            label="量化 SNR"
            original="—"
            processed={result && minSnr !== null ? `${formatDb(minSnr)}（最差声道）` : "—"}
          />
          <Row
            label="最大量化误差"
            original="—"
            processed={
              result && maxErr !== null
                ? `±${maxErr.toFixed(4)}（理论半步 ±${halfStep.toFixed(4)}）`
                : "—"
            }
          />
          <Row
            label="PCM 码率（估算）"
            original={formatKbps(
              pcmBitRate({
                sampleRate: original.sampleRate,
                bitDepth: 16,
                channels: srcCh as 1 | 2,
              }),
            )}
            processed={
              result ? formatKbps(pcmBitRate({ ...params, channels: outCh as 1 | 2 })) : "—"
            }
          />
          <Row
            label="PCM 大小（估算）"
            original={formatBytes(
              pcmByteSize(
                { sampleRate: original.sampleRate, bitDepth: 16, channels: srcCh as 1 | 2 },
                srcSecs,
              ),
            )}
            processed={
              result
                ? formatBytes(pcmByteSize({ ...params, channels: outCh as 1 | 2 }, outSecs))
                : "—"
            }
          />
        </tbody>
      </table>
      <p className="ae-hint">
        SNR = 10·log10（信号功率÷量化误差功率），按声道算、显示最差一路；原始行的码率/大小按 16bit
        同参数估算，方便对照。估算均不含容器头与元数据，也不是压缩格式的大小。
      </p>
    </section>
  );
}
