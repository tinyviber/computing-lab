/**
 * Wire protocol between the audio-encoding UI and the server judge.
 *
 * The submission is data only — the chosen digitization parameters plus,
 * for the guided stage, the answer chain. Audio itself never leaves the
 * browser: the judge regenerates the student's fixture signal from the
 * project owner's id and re-verifies the numbers against it.
 */

import type { AudioParams } from "./audio.ts";

export type AudioEncodingSubmission = {
  stageIndex: number;
  /** Which knobs the submission uses depends on the stage's kind. */
  params?: Partial<AudioParams>;
  /** guided stage: promptId → chosen option index; server re-checks each. */
  guidedAnswers?: Record<string, number>;
};

/** One pass/fail line in the verdict, shown to the student verbatim. */
export type AudioCheck = {
  id: string;
  label: string;
  ok: boolean;
  /** Optional explanation — e.g. the aliased frequency a low rate produced. */
  detail?: string;
};

export type AudioEncodingJudgeResult = {
  stageIndex: number;
  /** The fixture variant judged (its label), so UI and verdict agree. */
  signalLabel: string;
  checks: AudioCheck[];
  measured: {
    /** sampling/design: Nyquist limit of the submitted rate, in Hz. */
    nyquistHz?: number;
    /** depth/design: SNR measured on the regenerated signal, in dB. */
    snrDb?: number;
    /** design: PCM payload of the submitted scheme, in bytes. */
    sizeBytes?: number;
  };
  passed: boolean;
  submissionId: string;
  currentStage: number;
  passedStages: number[];
};
