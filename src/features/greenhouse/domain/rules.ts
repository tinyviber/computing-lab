/**
 * Rule-table model: `RuleRow = { when: Cond, actuator, set: on|off }`.
 * Each tick, an actuator takes the FIRST row (top-down) whose condition
 * holds on the current sensor readings; no matching row = keep the
 * previous state — the latch that makes two-row hysteresis expressible.
 *
 * `Cond = leaf{sensor, op, value} | all[…] | any[…]`, depth ≤ 2. The
 * C1–C3 editor only emits leaf conditions, but the domain carries the
 * full shape so later stages need no schema change.
 */

import {
  ACTUATOR_IDS,
  ACTUATOR_LABEL,
  SENSOR_LABEL,
  SENSOR_RANGE,
  SENSOR_IDS,
  clampInt,
  fmtSensor,
  type ActuatorId,
  type Readings,
  type SensorId,
} from "./model.ts";

export type CmpOp = "<" | ">" | "<=" | ">=";
export const CMP_OPS: readonly CmpOp[] = ["<", ">", "<=", ">="];
export const CMP_LABEL: Record<CmpOp, string> = { "<": "<", ">": ">", "<=": "≤", ">=": "≥" };

export type CondLeaf = { kind: "leaf"; sensor: SensorId; op: CmpOp; value: number };
export type CondGroup = { kind: "all" | "any"; children: Cond[] };
export type Cond = CondLeaf | CondGroup;

export type RuleRow = { when: Cond; actuator: ActuatorId; set: "on" | "off" };

/** Issue §3 bound: v1 caps the table at 8 rows (X3 would allow 12 — out of scope). */
export const MAX_RULES = 8;
export const COND_MAX_DEPTH = 2;
export const COND_MAX_CHILDREN = 4;

export function holds(cond: Cond, read: Readings): boolean {
  if (cond.kind === "leaf") {
    const v = read[cond.sensor];
    switch (cond.op) {
      case "<":
        return v < cond.value;
      case ">":
        return v > cond.value;
      case "<=":
        return v <= cond.value;
      case ">=":
        return v >= cond.value;
    }
  }
  return cond.kind === "all"
    ? cond.children.every((c) => holds(c, read))
    : cond.children.some((c) => holds(c, read));
}

export function leavesOf(cond: Cond): CondLeaf[] {
  if (cond.kind === "leaf") return [cond];
  return cond.children.flatMap(leavesOf);
}

export function condDepth(cond: Cond): number {
  if (cond.kind === "leaf") return 1;
  return 1 + Math.max(...cond.children.map(condDepth));
}

type RuleLimits = {
  maxRules: number;
  /** Sensors a condition may reference in this stage. */
  sensors: readonly SensorId[];
  /** Actuators a row may drive in this stage. */
  actuators: readonly ActuatorId[];
};

export const GLOBAL_LIMITS: RuleLimits = {
  maxRules: MAX_RULES,
  sensors: SENSOR_IDS,
  actuators: ACTUATOR_IDS,
};

function sanitizeCond(raw: unknown, limits: RuleLimits, depth: number): Cond | null {
  if (typeof raw !== "object" || raw === null || depth > COND_MAX_DEPTH) return null;
  const candidate = raw as Record<string, unknown>;
  if (candidate.kind === "leaf") {
    const sensor = candidate.sensor as SensorId;
    const op = candidate.op as CmpOp;
    if (!limits.sensors.includes(sensor)) return null;
    if (!CMP_OPS.includes(op)) return null;
    if (typeof candidate.value !== "number" || !Number.isFinite(candidate.value)) return null;
    const value = Math.round(candidate.value);
    // Threshold must sit strictly inside the sensor's OPEN range —
    // clamping cannot save a tautology like `T < rangeMax`.
    const [lo, hi] = SENSOR_RANGE[sensor];
    if (value <= lo || value >= hi) return null;
    return { kind: "leaf", sensor, op, value };
  }
  if (candidate.kind === "all" || candidate.kind === "any") {
    if (!Array.isArray(candidate.children) || candidate.children.length === 0) return null;
    const children = candidate.children
      .slice(0, COND_MAX_CHILDREN)
      .map((c) => sanitizeCond(c, limits, depth + 1))
      .filter((c): c is Cond => c !== null);
    if (children.length === 0) return null;
    return { kind: candidate.kind, children };
  }
  return null;
}

function sanitizeRow(raw: unknown, limits: RuleLimits): RuleRow | null {
  if (typeof raw !== "object" || raw === null) return null;
  const candidate = raw as Record<string, unknown>;
  const actuator = candidate.actuator as ActuatorId;
  if (!limits.actuators.includes(actuator)) return null;
  const set = candidate.set === "on" ? "on" : candidate.set === "off" ? "off" : null;
  if (!set) return null;
  const when = sanitizeCond(candidate.when, limits, 1);
  if (!when) return null;
  return { when, actuator, set };
}

/**
 * Bound any incoming value into the rule-table contract: ≤ maxRules rows,
 * palette sensors/actuators only, open-interval thresholds. Invalid rows
 * are dropped, never trusted.
 */
export function sanitizeRules(raw: unknown, limits: RuleLimits): RuleRow[] {
  if (!Array.isArray(raw)) return [];
  const out: RuleRow[] = [];
  for (const row of raw) {
    if (out.length >= limits.maxRules) break;
    const clean = sanitizeRow(row, limits);
    if (clean) out.push(clean);
  }
  return out;
}

/* ---- C1's built-in setpoint controller ---- */

/** Learner-facing slider bounds, whole °C (draft stores the integer). */
export const SETPOINT_MIN = 16;
export const SETPOINT_MAX = 28;
export const SETPOINT_DEFAULT = 22;
/** Fixed hysteresis: ±1.5°C around the setpoint, 0.5°C release slack. */
export const BUILTIN_HYSTERESIS = 15;
export const BUILTIN_SLACK = 5;

export function clampSetpoint(value: unknown): number {
  return clampInt(value, SETPOINT_MIN, SETPOINT_MAX, SETPOINT_DEFAULT);
}

/**
 * The canned thermostat C1 ships with: a dead zone of ±1.5°C around the
 * setpoint — heater on below it, fan on above it, each released after a
 * 0.5°C slack. Students meet the same row shape again when C2 hands them
 * the table.
 */
export function setpointRules(setpoint: number): RuleRow[] {
  const sp = clampSetpoint(setpoint) * 10;
  return [
    {
      when: { kind: "leaf", sensor: "airTemp", op: "<=", value: sp - BUILTIN_HYSTERESIS },
      actuator: "heater",
      set: "on",
    },
    {
      when: {
        kind: "leaf",
        sensor: "airTemp",
        op: ">=",
        value: sp - BUILTIN_HYSTERESIS + BUILTIN_SLACK,
      },
      actuator: "heater",
      set: "off",
    },
    {
      when: { kind: "leaf", sensor: "airTemp", op: ">=", value: sp + BUILTIN_HYSTERESIS },
      actuator: "fan",
      set: "on",
    },
    {
      when: {
        kind: "leaf",
        sensor: "airTemp",
        op: "<=",
        value: sp + BUILTIN_HYSTERESIS - BUILTIN_SLACK,
      },
      actuator: "fan",
      set: "off",
    },
  ];
}

/* ---- Natural-language echo for the editor ---- */

export function leafText(leaf: CondLeaf): string {
  return `${SENSOR_LABEL[leaf.sensor]} ${CMP_LABEL[leaf.op]} ${fmtSensor(leaf.sensor, leaf.value)}`;
}

export function condText(cond: Cond): string {
  if (cond.kind === "leaf") return leafText(cond);
  const joiner = cond.kind === "all" ? " 且 " : " 或 ";
  return cond.children.map(condText).join(joiner);
}

export function rowText(row: RuleRow): string {
  return `当 ${condText(row.when)} → ${ACTUATOR_LABEL[row.actuator]} ${row.set === "on" ? "开" : "关"}`;
}
