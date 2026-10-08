/**
 * Audio-encoding judge: verifies a submitted digitization scheme against
 * the student's own fixture signal.
 *
 * The submission is data only — params and guided answers, never audio.
 * The student's signal spec is derived from the project owner's id, so the
 * judge regenerates bit-for-bit what the browser played and re-measures
 * every claim with the same domain functions.
 */

import type { DatabaseSync } from "node:sqlite";
import type { AudioParams } from "../../../src/features/audio-encoding/domain/audio.ts";
import {
  MAX_BIT_DEPTH,
  MAX_SAMPLE_RATE,
  MIN_BIT_DEPTH,
  MIN_SAMPLE_RATE,
} from "../../../src/features/audio-encoding/domain/audio.ts";
import { digitize } from "../../../src/features/audio-encoding/domain/digitize.ts";
import { formatBytes, pcmByteSize } from "../../../src/features/audio-encoding/domain/metrics.ts";
import type {
  AudioCheck,
  AudioEncodingJudgeResult,
} from "../../../src/features/audio-encoding/domain/protocol.ts";
import {
  renderSignal,
  signalMaxFreq,
  signalSpecFor,
} from "../../../src/features/audio-encoding/domain/signals.ts";
import {
  getAudioStage,
  nextAudioStage,
} from "../../../src/features/audio-encoding/domain/stages.ts";
import type { StageDraft } from "../../../src/features/audio-encoding/lesson/state.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";

const isInt = (v: unknown): v is number => Number.isInteger(v);

/** Fold `freq` into [0, rate/2] — the frequency an aliased partial lands on. */
function foldedHz(freq: number, rate: number): number {
  const r = ((freq % rate) + rate) % rate;
  return Math.min(r, rate - r);
}

function readParams(body: Record<string, unknown>): Partial<AudioParams> {
  const raw = (body.params ?? {}) as Record<string, unknown>;
  return {
    sampleRate: isInt(raw.sampleRate) ? raw.sampleRate : undefined,
    bitDepth: isInt(raw.bitDepth) ? raw.bitDepth : undefined,
    channels: raw.channels === 2 ? 2 : raw.channels === 1 ? 1 : undefined,
  };
}

function requireRate(params: Partial<AudioParams>): number | LabJudgeError {
  if (
    !isInt(params.sampleRate) ||
    params.sampleRate < MIN_SAMPLE_RATE ||
    params.sampleRate > MAX_SAMPLE_RATE
  ) {
    return { error: "invalid-params", status: 400 };
  }
  return params.sampleRate;
}

function requireBits(params: Partial<AudioParams>): number | LabJudgeError {
  if (
    !isInt(params.bitDepth) ||
    params.bitDepth < MIN_BIT_DEPTH ||
    params.bitDepth > MAX_BIT_DEPTH
  ) {
    return { error: "invalid-params", status: 400 };
  }
  return params.bitDepth;
}

function aliasCheck(rate: number, fmax: number): AudioCheck {
  const ok = rate >= 2 * fmax;
  return {
    id: "alias",
    label: "不产生混叠",
    ok,
    detail: ok
      ? undefined
      : `信号最高的分量（在奈奎斯特线 ${Math.round(rate / 2)} Hz 之上）会折回成约 ${Math.round(
          foldedHz(fmax, rate),
        )} Hz 的假音——听感上多出不属于原信号的低音。`,
  };
}

export function judgeAudioSubmission(
  db: DatabaseSync,
  project: ProjectRow<StageDraft>,
  stageIndex: number,
  body: Record<string, unknown>,
): AudioEncodingJudgeResult | LabJudgeError {
  const gated = gateStage(
    getAudioStage(stageIndex),
    (stage) => stage.index <= 1 || project.passedStages.includes(stage.index - 1),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;
  const spec = signalSpecFor(project.userId, stage);
  const params = readParams(body);
  const checks: AudioCheck[] = [];
  const measured: AudioEncodingJudgeResult["measured"] = {};

  if (stage.kind === "guided") {
    const prompts = stage.guided?.prompts ?? [];
    const answers = (body.guidedAnswers ?? {}) as Record<string, unknown>;
    for (const prompt of prompts) {
      const pick = answers[prompt.id];
      checks.push({
        id: prompt.id,
        label: prompt.prompt,
        ok: isInt(pick) && prompt.options[pick]?.correct === true,
      });
    }
  } else if (stage.kind === "sampling") {
    const rate = requireRate(params);
    if (typeof rate !== "number") return rate;
    const fmax = signalMaxFreq(spec);
    checks.push(aliasCheck(rate, fmax));
    checks.push({
      id: "budget",
      label: `在线路预算内（≤ ${stage.rateBudgetHz} 采样点/秒）`,
      ok: rate <= stage.rateBudgetHz!,
      detail:
        rate > stage.rateBudgetHz!
          ? `${rate} Hz 超过了这条线路每秒 ${stage.rateBudgetHz} 个采样点的上限。`
          : undefined,
    });
    measured.nyquistHz = rate / 2;
  } else if (stage.kind === "depth") {
    const bits = requireBits(params);
    if (typeof bits !== "number") return bits;
    const audio = renderSignal(spec);
    const result = digitize(audio, {
      sampleRate: spec.sampleRate,
      bitDepth: bits,
      channels: 1,
    });
    const snr = Math.min(...result.quantization.map((q) => q.snrDb));
    measured.snrDb = snr;
    checks.push({
      id: "snr",
      label: `量化信噪比达标（≥ ${stage.snrBudgetDb} dB）`,
      ok: snr >= stage.snrBudgetDb!,
      detail:
        snr < stage.snrBudgetDb!
          ? `实测 ${snr.toFixed(1)} dB——位数太少，量化台阶叠加的噪声盖过了要求。`
          : undefined,
    });
    checks.push({
      id: "cap",
      label: `不超过器件上限（≤ ${stage.bitDepthCap} bit）`,
      ok: bits <= stage.bitDepthCap!,
      detail:
        bits > stage.bitDepthCap!
          ? "接收端的器件存不下更大的位深——更高不一定更好，要先看预算。"
          : undefined,
    });
  } else {
    // design: full {rate, bits, channels} scheme under a byte budget.
    const rate = requireRate(params);
    if (typeof rate !== "number") return rate;
    const bits = requireBits(params);
    if (typeof bits !== "number") return bits;
    const channels = params.channels === 2 ? 2 : params.channels === 1 ? 1 : null;
    if (channels === null) return { error: "invalid-params", status: 400 };
    const audio = renderSignal(spec);
    const result = digitize(audio, { sampleRate: rate, bitDepth: bits, channels });
    const snr = Math.min(...result.quantization.map((q) => q.snrDb));
    const sizeBytes = pcmByteSize({ sampleRate: rate, bitDepth: bits, channels }, spec.durationSec);
    measured.nyquistHz = rate / 2;
    measured.snrDb = snr;
    measured.sizeBytes = sizeBytes;
    checks.push(aliasCheck(rate, signalMaxFreq(spec)));
    checks.push({
      id: "snr",
      label: `量化信噪比达标（≥ ${stage.snrBudgetDb} dB）`,
      ok: snr >= stage.snrBudgetDb!,
      detail:
        snr < stage.snrBudgetDb!
          ? `实测 ${snr.toFixed(1)} dB——位深太低，噪声地板盖过了要求。`
          : undefined,
    });
    checks.push({
      id: "size",
      label: `数据量在预算内（≤ ${formatBytes(stage.byteBudget!)}）`,
      ok: sizeBytes <= stage.byteBudget!,
      detail:
        sizeBytes > stage.byteBudget!
          ? `方案要 ${formatBytes(sizeBytes)}——采样率、位深、声道数任何一个乘大都直接推高数据量。`
          : undefined,
    });
  }

  const passed = checks.every((c) => c.ok);
  const submissionId = withTransaction(db, () => {
    const id = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: { params, guidedAnswers: body.guidedAnswers ?? null },
      score: checks.filter((c) => c.ok).length,
      total: checks.length,
      passed,
      testSummary: { checks, measured, signalLabel: spec.label },
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextAudioStage);
      return { id, progress };
    }
    return { id, progress: null };
  });

  return {
    stageIndex,
    signalLabel: spec.label,
    checks,
    measured,
    passed,
    submissionId: submissionId.id,
    currentStage: submissionId.progress?.currentStage ?? project.currentStage,
    passedStages: submissionId.progress?.passedStages ?? project.passedStages,
  };
}
