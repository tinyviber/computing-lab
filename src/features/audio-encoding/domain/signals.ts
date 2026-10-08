/**
 * Deterministic fixture signals ("本关信号").
 *
 * Judged stages never ship student audio to the server — instead every
 * student gets a signal *spec* derived from a per-user seed, and both the
 * browser workbench and the server judge render it through `renderSignal`.
 * A spec is plain data (a list of partials per channel), so what the
 * student hears is bit-for-bit what the judge measures.
 */

import type { PcmAudio } from "./audio.ts";
import { hashSeed, makeRng, rngFloat, rngInt, type Rng } from "./rng.ts";

/** One sine partial: frequency (Hz), amplitude (0–1), phase (radians). */
export type TonePart = { freq: number; amp: number; phase: number };

export type SignalSpec = {
  /** Human-readable variant tag, e.g. "S-42" — lets a class compare draws. */
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

const randPhase = (rng: Rng) => rngFloat(rng) * Math.PI * 2;

/**
 * Draw a multitone spec: `partialsPerChannel` sine components per channel,
 * the top one parked exactly at `fmax` so `signalMaxFreq` stays meaningful,
 * the rest spread over the band below it.
 */
function drawMultitone(
  rng: Rng,
  opts: {
    fmax: number;
    partials: number;
    channelCount: 1 | 2;
    sampleRate: number;
    durationSec: number;
    noiseAmp?: number;
    /** Stereo variant: give channel 2 its own detuned partial set. */
    stereoSpread?: boolean;
  },
): SignalSpec {
  const channels: TonePart[][] = [];
  for (let ch = 0; ch < opts.channelCount; ch += 1) {
    const parts: TonePart[] = [];
    const count = opts.partials;
    for (let i = 0; i < count; i += 1) {
      let freq: number;
      if (i === count - 1) {
        freq = opts.fmax;
      } else {
        // Spread lower partials over [fmax*0.08, fmax*0.55]; channel 2 detunes.
        const base = opts.fmax * (0.08 + 0.47 * (i / Math.max(1, count - 1)));
        const jitter = (rngFloat(rng) - 0.5) * opts.fmax * 0.06;
        freq = Math.round(base + jitter + (ch === 1 && opts.stereoSpread ? 37 : 0));
      }
      parts.push({
        freq,
        amp: 0.25 + rngFloat(rng) * 0.55,
        phase: randPhase(rng),
      });
    }
    channels.push(parts);
  }
  return {
    label: `S-${rngInt(rng, 10, 99)}`,
    sampleRate: opts.sampleRate,
    durationSec: opts.durationSec,
    channels,
    noiseAmp: opts.noiseAmp ?? 0,
  };
}

/**
 * The fixture for a stage. `userId` scopes the draw: every student gets a
 * different-but-equivalent signal, and the server regenerates the identical
 * spec from the project owner's id at judge time. Passing null/empty yields
 * the shared "demo" variant (used for previews before auth resolves).
 */
export function signalSpecFor(
  userId: string | null | undefined,
  stage: { id: string },
): SignalSpec {
  const rng = makeRng(hashSeed(`audio-encoding/${stage.id}/${userId ?? "demo"}`));
  switch (stage.id) {
    case "hear-the-digits":
      // Fixed public signal: two clear tones a first-time listener can
      // separate by ear — a low hum plus a bright high partial.
      return {
        label: "T-1",
        sampleRate: 48000,
        durationSec: 2.5,
        noiseAmp: 0,
        channels: [
          [
            { freq: 220, amp: 0.7, phase: 0 },
            { freq: 660, amp: 0.35, phase: 1.3 },
            { freq: 2750, amp: 0.22, phase: 2.1 },
          ],
        ],
      };
    case "thin-wire":
      return drawMultitone(rng, {
        fmax: 3600 + 100 * rngInt(rng, 0, 38),
        partials: 4,
        channelCount: 1,
        sampleRate: 44100,
        durationSec: 3,
      });
    case "quiet-floor":
      return drawMultitone(rng, {
        fmax: 2400 + 100 * rngInt(rng, 0, 20),
        partials: 3,
        channelCount: 1,
        sampleRate: 44100,
        durationSec: 3,
        noiseAmp: 0.012,
      });
    case "full-link":
      return drawMultitone(rng, {
        fmax: 4600 + 100 * rngInt(rng, 0, 18),
        partials: 3,
        channelCount: 2,
        sampleRate: 44100,
        durationSec: 5,
        noiseAmp: 0.01,
        stereoSpread: true,
      });
    default:
      return drawMultitone(rng, {
        fmax: 3000,
        partials: 3,
        channelCount: 1,
        sampleRate: 44100,
        durationSec: 3,
      });
  }
}

/**
 * Render a spec into playable audio. Sine sum per channel plus optional
 * seeded uniform noise; the whole buffer is then peak-normalized to 0.9 so
 * later quantization uses the [-1, 1] range honestly without clipping.
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
