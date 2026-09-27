/**
 * Greenhouse model: one simulated greenhouse = three environment
 * variables in integer fixed-point (×10 — 26.5°C is stored as 265), five
 * boolean actuators, and a rule table the learner writes.
 *
 * Display precision IS judgement precision: the UI prints one decimal
 * which is the stored fixed-point value itself, so mental arithmetic in
 * class matches the simulation exactly.
 */

export type SensorId = "airTemp" | "soilMoisture" | "light";
export const SENSOR_IDS: readonly SensorId[] = ["airTemp", "soilMoisture", "light"];

export type ActuatorId = "heater" | "fan" | "sprinkler" | "growLight" | "shade";
export const ACTUATOR_IDS: readonly ActuatorId[] = [
  "heater",
  "fan",
  "sprinkler",
  "growLight",
  "shade",
];

export const SENSOR_LABEL: Record<SensorId, string> = {
  airTemp: "空气温度",
  soilMoisture: "土壤墒情",
  light: "光照",
};

export const ACTUATOR_LABEL: Record<ActuatorId, string> = {
  heater: "加热器",
  fan: "风扇",
  sprinkler: "喷淋",
  growLight: "补光灯",
  shade: "遮阳帘",
};

export const SENSOR_UNIT: Record<SensorId, string> = {
  airTemp: "°C",
  soilMoisture: "%",
  light: "%",
};

/** Environment variables, all integer fixed-point ×10. */
export type Env = Record<SensorId, number>;
/** Actuator on/off states; they persist across ticks until a rule flips them. */
export type Acts = Record<ActuatorId, boolean>;
/** What the sensors report this tick — post-fault, may differ from env. */
export type Readings = Record<SensorId, number>;

/**
 * Sensor measurement ranges. Rule thresholds must land strictly inside
 * the OPEN interval — a threshold at the range edge is a tautology that
 * range-clamping alone cannot kill (`T < 60.0` is always true).
 * `PHYS_BOUNDS` doubles as the physical clamp for the env itself, placed
 * well outside every teaching band.
 */
export const SENSOR_RANGE: Record<SensorId, readonly [number, number]> = {
  airTemp: [-100, 600],
  soilMoisture: [0, 1000],
  light: [0, 1000],
};
export const PHYS_BOUNDS = SENSOR_RANGE;

/** Default weather-station starting point: 22.0°C, 40% moisture, dark. */
export const DEFAULT_ENV: Env = { airTemp: 220, soilMoisture: 400, light: 0 };

export function defaultActs(): Acts {
  return { heater: false, fan: false, sprinkler: false, growLight: false, shade: false };
}

export function clampInt(value: unknown, min: number, max: number, fallback = min): number {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, n));
}

/**
 * Clamp env into PHYS_BOUNDS; the returned list records which variables
 * touched an edge (the trace carries it so the judge can count a clamped
 * tick as a bound violation).
 */
export function clampEnv(env: Env): { env: Env; clamped: SensorId[] } {
  const clamped: SensorId[] = [];
  const out = { ...env };
  for (const v of SENSOR_IDS) {
    const [lo, hi] = PHYS_BOUNDS[v];
    if (out[v] < lo) {
      out[v] = lo;
      clamped.push(v);
    } else if (out[v] > hi) {
      out[v] = hi;
      clamped.push(v);
    }
  }
  return { env: out, clamped };
}

/** Fixed-point → display: 265 → "26.5". Sign-safe for negatives. */
export function fmtFixed(value: number): string {
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  return `${sign}${Math.trunc(abs / 10)}.${abs % 10}`;
}

/** 265 on airTemp → "26.5°C". */
export function fmtSensor(sensor: SensorId, value: number): string {
  return `${fmtFixed(value)}${SENSOR_UNIT[sensor]}`;
}
