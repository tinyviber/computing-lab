export type SoundSource = "pure440" | "high-pulse" | "speech" | "sawtooth";

export type SoundComponent = {
  frequencyHz: number;
  amplitude: number;
};

export type SoundFixture = {
  id: SoundSource;
  label: string;
  description: string;
  frequencyHz: number;
  durationMs: number;
  components: readonly SoundComponent[];
  sampleAt: (timeMs: number) => number;
};

const TWO_PI = 2 * Math.PI;

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function pure440(timeMs: number): number {
  return Math.sin(TWO_PI * 440 * (timeMs / 1000));
}

const HIGH_PULSE_COMPONENTS: readonly SoundComponent[] = [1, 2, 3, 4, 5].map((harmonic) => ({
  frequencyHz: 6000 * harmonic,
  amplitude: 1 / harmonic,
}));

function highPulse(timeMs: number): number {
  const seconds = timeMs / 1000;
  const value = HIGH_PULSE_COMPONENTS.reduce(
    (sum, component, index) =>
      sum +
      component.amplitude *
        Math.sin(TWO_PI * component.frequencyHz * seconds + (index % 2 ? Math.PI / 3 : 0)),
    0,
  );
  return clampUnit(value / 1.9);
}

function speech(timeMs: number): number {
  const seconds = timeMs / 1000;
  const value =
    0.58 * Math.sin(TWO_PI * 180 * seconds) +
    0.27 * Math.sin(TWO_PI * 420 * seconds) +
    0.15 * Math.sin(TWO_PI * 780 * seconds);
  return clampUnit(value);
}

const SAWTOOTH_COMPONENTS: readonly SoundComponent[] = Array.from({ length: 9 }, (_, index) => {
  const harmonic = index + 1;
  return {
    frequencyHz: 220 * harmonic,
    amplitude: (2 / Math.PI) * ((harmonic % 2 === 0 ? -1 : 1) / harmonic),
  };
});

const SAWTOOTH_NORMALIZATION =
  1 / SAWTOOTH_COMPONENTS.reduce((sum, component) => sum + Math.abs(component.amplitude), 0);
const NORMALIZED_SAWTOOTH_COMPONENTS: readonly SoundComponent[] = SAWTOOTH_COMPONENTS.map(
  (component) => ({ ...component, amplitude: component.amplitude * SAWTOOTH_NORMALIZATION }),
);

function sawtooth(timeMs: number): number {
  const seconds = timeMs / 1000;
  return NORMALIZED_SAWTOOTH_COMPONENTS.reduce(
    (sum, component) =>
      sum + component.amplitude * Math.sin(TWO_PI * component.frequencyHz * seconds),
    0,
  );
}

export const SOUND_FIXTURES: Readonly<Record<SoundSource, SoundFixture>> = {
  pure440: {
    id: "pure440",
    label: "Pure 440 Hz",
    description: "A stable reference tone for comparing sampling and quantization.",
    frequencyHz: 440,
    durationMs: 1000,
    components: [{ frequencyHz: 440, amplitude: 1 }],
    sampleAt: pure440,
  },
  "high-pulse": {
    id: "high-pulse",
    label: "High pulse",
    description: "A high-frequency pulse train that makes aliasing easy to see.",
    frequencyHz: 6000,
    durationMs: 1000,
    components: HIGH_PULSE_COMPONENTS,
    sampleAt: highPulse,
  },
  speech: {
    id: "speech",
    label: "Speech-like",
    description: "A deterministic voiced composite made from explicit components.",
    frequencyHz: 780,
    durationMs: 1000,
    components: [
      { frequencyHz: 180, amplitude: 0.58 },
      { frequencyHz: 420, amplitude: 0.27 },
      { frequencyHz: 780, amplitude: 0.15 },
    ],
    sampleAt: speech,
  },
  sawtooth: {
    id: "sawtooth",
    label: "Sawtooth",
    description: "A harmonic-rich ramp that reveals quantization steps.",
    frequencyHz: 220,
    durationMs: 1000,
    components: NORMALIZED_SAWTOOTH_COMPONENTS,
    sampleAt: sawtooth,
  },
};

export function getSoundFixture(source: SoundSource): SoundFixture {
  return SOUND_FIXTURES[source] ?? SOUND_FIXTURES.pure440;
}

export function sampleSoundFixture(
  source: SoundSource,
  timeMs: number,
  _ignoredPhaseTurns?: number,
): number {
  return getSoundFixture(source).sampleAt(timeMs);
}
