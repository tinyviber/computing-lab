/**
 * Demo fixture signals for the audio-encoding demo page.
 *
 * Presets are pure data (`SignalSpec` = a list of sine partials per
 * channel) rendered through `renderSignal` — deterministic, cheap, and
 * small enough that digitizing re-runs live on every parameter change.
 */

import type { PcmAudio } from "./audio.ts";
import { hashSeed, makeRng } from "./rng.ts";

/** One sine partial: frequency (Hz), amplitude (0–1), phase (radians). */
export type TonePart = { freq: number; amp: number; phase: number };

export type SignalSpec = {
  /** Human-readable tag shown next to the preset name. */
  label: string;
  /** Native rate the fixture is rendered at. */
  sampleRate: number;
  durationSec: number;
  /** One partial list per channel; stereo fixtures have two entries. */
  channels: TonePart[][];
  /** Optional deterministic broadband noise (0 = clean tone). */
  noiseAmp: number;
};

export function signalMaxFreq(spec: SignalSpec): number {
  let max = 0;
  for (const channel of spec.channels) {
    for (const part of channel) max = Math.max(max, part.freq);
  }
  return max;
}

/**
 * Render a spec into playable audio. Sine sum per channel plus optional
 * seeded uniform noise; the whole buffer is then peak-normalized to 0.9 so
 * quantization uses the [-1, 1] range honestly without clipping.
 */
export function renderSignal(spec: SignalSpec): PcmAudio {
  const frames = Math.round(spec.durationSec * spec.sampleRate);
  const noiseRng = makeRng(hashSeed(`noise/${spec.label}`));
  const channels = spec.channels.map((parts) => {
    const out = new Float32Array(frames);
    for (let n = 0; n < frames; n += 1) {
      const t = n / spec.sampleRate;
      let v = 0;
      for (const p of parts) v += p.amp * Math.sin(2 * Math.PI * p.freq * t + p.phase);
      if (spec.noiseAmp > 0) v += spec.noiseAmp * (noiseRng() / 0x80000000 - 1);
      out[n] = v;
    }
    return out;
  });
  // Global peak normalization keeps relative channel loudness intact.
  let peak = 0;
  for (const data of channels) {
    for (let n = 0; n < data.length; n += 1) peak = Math.max(peak, Math.abs(data[n]));
  }
  const gain = peak > 0 ? 0.9 / peak : 1;
  for (const data of channels) {
    for (let n = 0; n < data.length; n += 1) data[n] *= gain;
  }
  return { sampleRate: spec.sampleRate, channels };
}

export type DemoSignal = {
  id: string;
  name: string;
  description: string;
  spec: SignalSpec;
};

/**
 * Built-in material. Each preset illustrates a different teaching moment:
 * speech = everything fits even at telephone rates; music = wide band that
 * exposes the Nyquist knee; highs = partials deliberately parked above the
 * low preset rates so aliasing is guaranteed and visible.
 */
export const DEMO_SIGNALS: DemoSignal[] = [
  {
    id: "voice",
    name: "语音样例",
    description:
      "低频为主的类语音信号（最高约 3.4 kHz）。即使用 8000 Hz 的“电话音质”也几乎无损——采样率刚好够用时发生了什么，用它看。",
    spec: {
      label: "语音",
      sampleRate: 44100,
      durationSec: 3,
      noiseAmp: 0.004,
      channels: [
        [
          { freq: 180, amp: 0.55, phase: 0 },
          { freq: 360, amp: 0.3, phase: 1.1 },
          { freq: 720, amp: 0.22, phase: 2.3 },
          { freq: 1440, amp: 0.15, phase: 0.7 },
          { freq: 2880, amp: 0.09, phase: 3.0 },
          { freq: 3400, amp: 0.06, phase: 1.9 },
        ],
      ],
    },
  },
  {
    id: "music",
    name: "音乐样例",
    description:
      "较宽频带的类音乐信号（含约 8 kHz 泛音，双声道）。降到 11025 Hz 以下时，顶部泛音会折回成混叠——看频谱图里的箭头。",
    spec: {
      label: "音乐",
      sampleRate: 44100,
      durationSec: 4,
      noiseAmp: 0.008,
      channels: [
        [
          { freq: 220, amp: 0.45, phase: 0 },
          { freq: 440, amp: 0.35, phase: 0.9 },
          { freq: 880, amp: 0.25, phase: 2.1 },
          { freq: 1760, amp: 0.18, phase: 1.4 },
          { freq: 3520, amp: 0.12, phase: 2.8 },
          { freq: 7040, amp: 0.08, phase: 0.4 },
          { freq: 8000, amp: 0.05, phase: 1.7 },
        ],
        [
          { freq: 220, amp: 0.4, phase: 0.6 },
          { freq: 453, amp: 0.3, phase: 1.8 },
          { freq: 906, amp: 0.22, phase: 0.2 },
          { freq: 1812, amp: 0.16, phase: 2.5 },
          { freq: 3624, amp: 0.11, phase: 1.0 },
          { freq: 7248, amp: 0.07, phase: 2.9 },
          { freq: 8100, amp: 0.05, phase: 0.8 },
        ],
      ],
    },
  },
  {
    id: "highs",
    name: "高频泛音样例",
    description:
      "故意放进 5–10 kHz 泛音的信号，任何低于 20 kHz 的采样率都会混叠。把采样率拖到 8000–16000，看高频分量被“折回”低频区。",
    spec: {
      label: "高泛音",
      sampleRate: 44100,
      durationSec: 3,
      noiseAmp: 0,
      channels: [
        [
          { freq: 300, amp: 0.5, phase: 0 },
          { freq: 600, amp: 0.28, phase: 1.2 },
          { freq: 5200, amp: 0.2, phase: 0.5 },
          { freq: 7800, amp: 0.16, phase: 2.2 },
          { freq: 9900, amp: 0.12, phase: 1.1 },
        ],
      ],
    },
  },
];

export const DEFAULT_DEMO_SIGNAL = DEMO_SIGNALS[0];

export function demoSignalById(id: string | null | undefined): DemoSignal {
  return DEMO_SIGNALS.find((s) => s.id === id) ?? DEFAULT_DEMO_SIGNAL;
}
