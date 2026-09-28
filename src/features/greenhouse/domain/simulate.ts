/**
 * Deterministic tick simulator for the greenhouse lab — the SAME file the
 * browser preview and the server judge import, so a run can never diverge
 * between the two.
 *
 * Everything is integer fixed-point (×10). All proportional steps —
 * ambient piecewise interpolation, the `(amb − env) / RELAX_K` relax, and
 * the halved actuator couplings — are integer ops via `Math.trunc`, which
 * truncates TOWARD ZERO; that direction is part of the model contract.
 * No `Math.random`, no `Date.now`, no transcendental functions: all
 * disturbance comes from case data.
 *
 * Tick order is pinned (issue §3): ambient → sensor read (with scripted
 * faults) → rule eval (first matching row per actuator, row order =
 * priority, no hit = hold previous state) → actuator gains → relax toward
 * ambient + soil dry drift → clamp (recorded) → push trace row.
 */

import {
  ACTUATOR_IDS,
  clampEnv,
  defaultActs,
  DEFAULT_ENV,
  PHYS_BOUNDS,
  SENSOR_IDS,
  type Acts,
  type ActuatorId,
  type Env,
  type Readings,
  type SensorId,
} from "./model.ts";
import { holds, type RuleRow } from "./rules.ts";

/** dt = 1 tick ≈ 15 min; 96 ticks = one day. */
export const TICK_MINUTES = 15;
export const MAX_TICKS = 96;

/** Natural relax: each tick env closes 1/RELAX_K of the gap to ambient. */
export const RELAX_K = 12;
/** Soil dries on its own: −0.3%/tick ≈ −29% per day. */
export const SOIL_DRY_DRIFT = -3;

const HEATER_TEMP_GAIN = 18;
const FAN_TEMP_GAIN = -12;

/**
 * Per-tick gains while an actuator runs. Couplings are truncated halves
 * of the primary temperature gains — computed once, stored as integers:
 *   heater +T · fan −T · sprinkler +S −T · growLight +L +T/2 · shade −L −T/2
 */
export const ACTUATOR_GAIN: Record<ActuatorId, Partial<Env>> = {
  heater: { airTemp: HEATER_TEMP_GAIN },
  fan: { airTemp: FAN_TEMP_GAIN },
  sprinkler: { soilMoisture: 30, airTemp: -4 },
  growLight: { light: 80, airTemp: Math.trunc(HEATER_TEMP_GAIN / 2) },
  shade: { light: -60, airTemp: Math.trunc(FAN_TEMP_GAIN / 2) },
};

/** Piecewise-linear ambient anchors; a var may appear in any subset. */
export type AmbientAnchor = {
  t: number;
  airTemp?: number;
  soilMoisture?: number;
  light?: number;
};

/** Scripted sensor faults (unused by C1–C3 cases; model keeps them). */
export type SensorFault = {
  t: number;
  sensor: SensorId;
  kind: "stuckAt" | "drift" | "offset";
  /** offset: constant delta · drift: per-tick delta · stuckAt: pinned value. */
  value?: number;
};

export type ActuatorFault = {
  t: number;
  actuator: ActuatorId;
  kind: "stuckOn" | "stuckOff";
};

/** What a scenario feeds the sim — the case shape minus name/expect. */
export type SimInput = {
  ticks: number;
  initEnv?: Partial<Env>;
  initActs?: Partial<Acts>;
  ambient: AmbientAnchor[];
  faults?: SensorFault[];
  actuatorFaults?: ActuatorFault[];
};

export type TraceRow = {
  t: number;
  /** Effective ambient target per var (unanchored vars track env = no forcing). */
  amb: Env;
  /** Sensor readings used for this tick's rule eval. */
  read: Readings;
  /** Actuator states after this tick's eval (post actuator-faults). */
  acts: Acts;
  /** Environment at end of tick: gains + relax + clamp applied. */
  env: Env;
  /** Indices of the rule rows that hit this tick (one per actuator at most). */
  firedRows: number[];
  /** Env vars that hit a PHYS_BOUNDS edge this tick — counts as a violation. */
  clamped: SensorId[];
};

export type SimRun = {
  ticks: number;
  /** env / acts at t=0, before the first tick runs. */
  initEnv: Env;
  initActs: Acts;
  trace: TraceRow[];
  finalEnv: Env;
  finalActs: Acts;
};

type AnchorSeries = { t: number; v: number }[];

/**
 * Piecewise-linear ambient value for one variable at tick t. Integer math
 * only: `v0 + trunc((v1−v0)·(t−t0)/(t1−t0))` — truncation toward zero.
 * Before the first anchor / after the last it holds the edge value; a var
 * with no anchors returns null (no forcing).
 */
function ambientVarAt(series: AnchorSeries, t: number): number | null {
  if (series.length === 0) return null;
  if (t <= series[0].t) return series[0].v;
  for (let i = 1; i < series.length; i += 1) {
    const a = series[i - 1];
    const b = series[i];
    if (t <= b.t || i === series.length - 1) {
      if (b.t === a.t) return b.v;
      return a.v + Math.trunc(((b.v - a.v) * (t - a.t)) / (b.t - a.t));
    }
  }
  return series[series.length - 1].v;
}

function ambientAt(anchors: AmbientAnchor[], t: number, env: Env): Env {
  const out = { ...env };
  for (const v of SENSOR_IDS) {
    const series: AnchorSeries = anchors
      .filter((a) => a[v] !== undefined)
      .map((a) => ({ t: a.t, v: a[v]! }));
    const value = ambientVarAt(series, t);
    // Unanchored vars get the env itself as relax target (no forcing) —
    // the trace's `amb` then mirrors env, and charts skip drawing them.
    out[v] = value ?? env[v];
  }
  return out;
}

/** Readings = truth + scripted faults applied in authored order. */
function sense(
  env: Env,
  faults: SensorFault[],
  t: number,
  stuck: ReadonlyMap<SensorId, number>,
): Readings {
  const read = { ...env } as Readings;
  for (const f of faults) {
    if (f.t > t) continue;
    const base = read[f.sensor];
    switch (f.kind) {
      case "stuckAt":
        read[f.sensor] = f.value ?? stuck.get(f.sensor) ?? base;
        break;
      case "offset":
        read[f.sensor] = base + (f.value ?? 0);
        break;
      case "drift":
        read[f.sensor] = base + (t - f.t) * (f.value ?? 1);
        break;
    }
  }
  return read;
}

/** Run the whole scenario under the given rules. Pure + deterministic. */
export function simulate(input: SimInput, rules: RuleRow[]): SimRun {
  const ticks = Math.min(Math.max(Math.trunc(input.ticks), 1), MAX_TICKS);
  const { env: initEnv } = clampEnv({ ...DEFAULT_ENV, ...input.initEnv });
  const initActs: Acts = { ...defaultActs(), ...input.initActs };
  const faults = input.faults ?? [];
  const actuatorFaults = input.actuatorFaults ?? [];

  let env = initEnv;
  let acts = initActs;
  /** stuckAt without an explicit value freezes the reading at fault start. */
  const stuck = new Map<SensorId, number>();
  const trace: TraceRow[] = [];

  for (let t = 0; t < ticks; t += 1) {
    const amb = ambientAt(input.ambient, t, env);
    for (const f of faults) {
      if (f.t === t && f.kind === "stuckAt" && f.value === undefined && !stuck.has(f.sensor)) {
        stuck.set(f.sensor, env[f.sensor]);
      }
    }
    const read = sense(env, faults, t, stuck);

    const firedRows: number[] = [];
    const nextActs = { ...acts };
    for (const a of ACTUATOR_IDS) {
      const hit = rules.findIndex((r) => r.actuator === a && holds(r.when, read));
      if (hit >= 0) {
        nextActs[a] = rules[hit].set === "on";
        firedRows.push(hit);
      }
    }
    for (const f of actuatorFaults) {
      if (t >= f.t) nextActs[f.actuator] = f.kind === "stuckOn";
    }
    acts = nextActs;

    const post = { ...env } as Env;
    for (const a of ACTUATOR_IDS) {
      if (!acts[a]) continue;
      const gain = ACTUATOR_GAIN[a];
      for (const v of SENSOR_IDS) post[v] += gain[v] ?? 0;
    }
    for (const v of SENSOR_IDS) {
      post[v] += Math.trunc((amb[v] - env[v]) / RELAX_K);
    }
    post.soilMoisture += SOIL_DRY_DRIFT;

    const bounded = clampEnv(post);
    env = bounded.env;
    trace.push({
      t,
      amb,
      read,
      acts: { ...acts },
      env: { ...env },
      firedRows,
      clamped: bounded.clamped,
    });
  }

  return { ticks, initEnv, initActs, trace, finalEnv: env, finalActs: acts };
}

/** hh:mm wall clock for a tick (t×15min into the day) — labels only. */
export function tickClock(t: number): string {
  const mins = t * TICK_MINUTES;
  return `${String(Math.trunc(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export { PHYS_BOUNDS };
