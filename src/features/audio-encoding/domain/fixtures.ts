export type SoundSource = "pure440" | "high-pulse" | "speech" | "sawtooth";

export type SoundFixture = {
  id: SoundSource;
  label: string;
  description: string;
  frequencyHz: number;
  durationMs: number;
  sampleAt: (timeMs: number, phaseTurns?: number) => number;
};

const TWO_PI = 2 * Math.PI;

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function phaseRadians(phaseTurns: number): number {
  const turns = Number.isFinite(phaseTurns) ? phaseTurns : 0;
  return TWO_PI * (turns % 1);
}

function pure440(timeMs: number, phaseTurns = 0): number {
  return Math.sin(TWO_PI * 440 * (timeMs / 1000) + phaseRadians(phaseTurns));
}

function highPulse(timeMs: number, phaseTurns = 0): number {
  const phase = (TWO_PI * 6000 * (timeMs / 1000) + phaseRadians(phaseTurns)) % TWO_PI;
  const normalizedPhase = phase < 0 ? phase + TWO_PI : phase;
  return normalizedPhase < TWO_PI * 0.18 ? 1 : -0.72;
}

function speech(timeMs: number, phaseTurns = 0): number {
  const seconds = timeMs / 1000;
  const envelope = 0.58 + 0.42 * Math.sin(TWO_PI * 2.2 * seconds) ** 2;
  const phase = phaseRadians(phaseTurns);
  const value =
    0.58 * Math.sin(TWO_PI * 180 * seconds + phase) +
    0.27 * Math.sin(TWO_PI * 420 * seconds + phase) +
    0.15 * Math.sin(TWO_PI * 780 * seconds + phase);
  return envelope * value;
}

function sawtooth(timeMs: number, phaseTurns = 0): number {
  const phase = (TWO_PI * 220 * (timeMs / 1000) + phaseRadians(phaseTurns)) % TWO_PI;
  const normalizedPhase = phase < 0 ? phase + TWO_PI : phase;
  return 2 * (normalizedPhase / TWO_PI) - 1;
}

export const SOUND_FIXTURES: Readonly<Record<SoundSource, SoundFixture>> = {
  pure440: {
    id: "pure440",
    label: "Pure 440 Hz",
    description: "A stable reference tone for comparing sampling and quantization.",
    frequencyHz: 440,
    durationMs: 1000,
    sampleAt: pure440,
  },
  "high-pulse": {
    id: "high-pulse",
    label: "High pulse",
    description: "A high-frequency pulse train that makes aliasing easy to see.",
    frequencyHz: 6000,
    durationMs: 1000,
    sampleAt: highPulse,
  },
  speech: {
    id: "speech",
    label: "Speech-like",
    description: "A deterministic voiced composite with a changing envelope.",
    frequencyHz: 780,
    durationMs: 1000,
    sampleAt: speech,
  },
  sawtooth: {
    id: "sawtooth",
    label: "Sawtooth",
    description: "A harmonic-rich ramp that reveals quantization steps.",
    frequencyHz: 220,
    durationMs: 1000,
    sampleAt: sawtooth,
  },
};

export function getSoundFixture(source: SoundSource): SoundFixture {
  return SOUND_FIXTURES[source] ?? SOUND_FIXTURES.pure440;
}

export function sampleSoundFixture(source: SoundSource, timeMs: number, phaseTurns = 0): number {
  return clampUnit(getSoundFixture(source).sampleAt(timeMs, phaseTurns));
}
