/**
 * Scenario runner: apply the draft to a stage's control surface
 * (C1's canned setpoint controller or the editable rule table), simulate
 * the case, then grade the trace against `expect`.
 *
 * Metric order matters for the counterexample story (issue §5): a
 * structurally degenerate table is called out before any in-band math —
 * "your rules never fired" is more actionable than "you spent 40% of the
 * day out of band" when both are true.
 *
 *   1. anti-degenerate (rules mode): ≥1 rule row fired, AND ≥1 leaf was
 *      both true and false at some ticks — a table that can only ever
 *      read one way hasn't been exercised.
 *   2. neverExceeded  — hard bound, closed interval; a tick that hit the
 *      physical clamp counts as a violation even if the clamped value
 *      still sits inside the asserted band.
 *   3. inBandRatio    — fraction of ticks at/after scoreFrom with every
 *      inBand var inside its band; first out-of-band tick is reported.
 *   4. endInBand      — the final tick's env inside every inBand band.
 *   5. switchCount    — counted switches per actuator; the FIRST flip off
 *      the initial state is free, each later flip counts 1.
 *   6. mustUse        — a row that turns the actuator ON must appear in
 *      firedRows (sensing `acts[a]===true` would be faked by initActs).
 *
 * Everything compares in integers: the ratio check is `inBandTicks*1000
 * ≥ ratioPerMil*scoredTicks`, never floats.
 */

import { ACTUATOR_IDS, SENSOR_IDS, type ActuatorId, type SensorId } from "../domain/model.ts";
import {
  leavesOf,
  clampSetpoint,
  sanitizeRules,
  setpointRules,
  type RuleRow,
} from "../domain/rules.ts";
import { MAX_TICKS, simulate, type SimRun, type TraceRow } from "../domain/simulate.ts";
import type { GhStageDef } from "../domain/stages.ts";
import type {
  GhCase,
  GhCaseMetrics,
  GhDraft,
  GhFirstViolation,
  GhMetricId,
} from "../domain/protocol.ts";

export type GhVerdict = {
  name: string;
  category: string;
  passed: boolean;
  /** Chinese one-liner explaining the failure (null when passed). */
  reason: string | null;
  run: SimRun;
  metrics: GhCaseMetrics;
  violation: GhFirstViolation | null;
};

function violation(
  tick: number,
  metric: GhMetricId,
  value: number,
  band: [number, number] | null,
  subject?: SensorId | ActuatorId,
): GhFirstViolation {
  return { tick, metric, value, band, subject };
}

/** Counted switches per actuator: the first flip off initActs is free. */
function countSwitches(run: SimRun): {
  counted: Record<ActuatorId, number>;
  flipTicks: Record<ActuatorId, number[]>;
} {
  const counted = Object.fromEntries(ACTUATOR_IDS.map((a) => [a, 0])) as Record<ActuatorId, number>;
  const flipTicks = Object.fromEntries(ACTUATOR_IDS.map((a) => [a, [] as number[]])) as Record<
    ActuatorId,
    number[]
  >;
  const prev = { ...run.initActs };
  for (const row of run.trace) {
    for (const a of ACTUATOR_IDS) {
      if (row.acts[a] !== prev[a]) {
        flipTicks[a].push(row.t);
        prev[a] = row.acts[a];
      }
    }
  }
  for (const a of ACTUATOR_IDS) {
    counted[a] = Math.max(0, flipTicks[a].length - 1);
  }
  return { counted, flipTicks };
}

function inBandAt(row: TraceRow, band: NonNullable<GhCase["expect"]["inBand"]>): boolean {
  for (const v of SENSOR_IDS) {
    const range = band[v];
    if (!range) continue;
    const value = row.env[v];
    if (value < range[0] || value > range[1]) return false;
  }
  return true;
}

function leafSignCoverage(rules: RuleRow[], run: SimRun): boolean {
  const leaves = rules.flatMap((r) => leavesOf(r.when));
  if (leaves.length === 0) return false;
  const seen = leaves.map(() => ({ t: false, f: false }));
  for (const row of run.trace) {
    leaves.forEach((leaf, i) => {
      const v = row.read[leaf.sensor];
      const hit =
        leaf.op === "<"
          ? v < leaf.value
          : leaf.op === ">"
            ? v > leaf.value
            : leaf.op === "<="
              ? v <= leaf.value
              : v >= leaf.value;
      seen[i][hit ? "t" : "f"] = true;
    });
  }
  return seen.some((s) => s.t && s.f);
}

/** Resolve the draft to the rules the sim actually runs for this stage. */
export function rulesForStage(draft: GhDraft, stage: GhStageDef): RuleRow[] {
  if (stage.control === "setpoint") {
    return setpointRules(clampSetpoint(draft.setpoint));
  }
  return sanitizeRules(draft.rules, {
    maxRules: stage.maxRules,
    sensors: stage.sensors,
    actuators: stage.actuators,
  });
}

export function judgeCase(draft: GhDraft, stage: GhStageDef, testCase: GhCase): GhVerdict {
  const rules = rulesForStage(draft, stage);
  const run = simulate(testCase, rules);
  const { counted, flipTicks } = countSwitches(run);
  const expect = testCase.expect;

  const scoreFrom = expect.scoreFrom ?? 0;
  const scored = run.trace.filter((r) => r.t >= scoreFrom);
  const inBandTicks = expect.inBand ? scored.filter((r) => inBandAt(r, expect.inBand!)).length : 0;
  const permille = scored.length > 0 ? Math.trunc((inBandTicks * 1000) / scored.length) : 0;
  const metrics: GhCaseMetrics = {
    inBandTicks,
    scoredTicks: scored.length,
    inBandPermille: permille,
    switchCount: counted,
  };

  const fail = (reason: string, v: GhFirstViolation): GhVerdict => ({
    name: testCase.name,
    category: testCase.category,
    passed: false,
    reason,
    run,
    metrics,
    violation: v,
  });

  if (stage.control === "rules") {
    if (rules.length === 0 || !run.trace.some((r) => r.firedRows.length > 0)) {
      return fail(
        "整段运行里没有一条规则命中——执行器从头到尾保持原状。",
        violation(0, "no-rule-fired", 0, null),
      );
    }
    if (!leafSignCoverage(rules, run)) {
      return fail(
        "所有条件在本场景里只朝一个方向判（永远真或永远假）——等于没做判断。",
        violation(0, "leaf-one-sided", 0, null),
      );
    }
  }

  if (expect.neverExceeded) {
    for (const v of SENSOR_IDS) {
      const bound = expect.neverExceeded[v];
      if (!bound) continue;
      for (const row of run.trace) {
        const out = row.env[v] < bound[0] || row.env[v] > bound[1];
        const clamped = row.clamped.includes(v);
        if (out || clamped) {
          return fail(
            `${v === "airTemp" ? "温度" : v === "soilMoisture" ? "墒情" : "光照"}在第 ${row.t} 拍越过了安全线${clamped ? "（撞上了物理边界）" : ""}。`,
            violation(row.t, "neverExceeded", row.env[v], bound, v),
          );
        }
      }
    }
  }

  if (expect.inBand && expect.inBandRatio !== undefined) {
    const need = Math.round(expect.inBandRatio * 1000);
    if (permille < need) {
      const bad = scored.find((r) => !inBandAt(r, expect.inBand!));
      const band = bandOf(expect.inBand, bad);
      return fail(
        `得分区间内只有 ${(permille / 10).toFixed(1)}% 的时间在目标带内（要求 ≥ ${(expect.inBandRatio * 100).toFixed(0)}%）。`,
        violation(bad?.t ?? scoreFrom, "inBand", permille, band),
      );
    }
  }

  if (expect.endInBand && expect.inBand) {
    const last = run.trace[run.trace.length - 1];
    if (!inBandAt(last, expect.inBand)) {
      return fail(
        "收尾时刻不在目标带内。",
        violation(last.t, "endInBand", 0, bandOf(expect.inBand, last)),
      );
    }
  }

  if (expect.switchCount) {
    for (const a of ACTUATOR_IDS) {
      const limit = expect.switchCount[a];
      if (limit === undefined) continue;
      if (counted[a] > limit) {
        const tick = flipTicks[a][limit + 1] ?? run.trace.length - 1;
        return fail(
          `${a === "heater" ? "加热器" : a === "fan" ? "风扇" : a === "sprinkler" ? "喷淋" : a === "growLight" ? "补光灯" : "遮阳帘"}在临界线上抖了 ${counted[a]} 次（上限 ${limit} 次）。`,
          violation(tick, "switchCount", counted[a], null, a),
        );
      }
    }
  }

  if (expect.mustUse) {
    const fired = new Set(run.trace.flatMap((r) => r.firedRows));
    for (const a of expect.mustUse) {
      const drivesOn = rules.some((r, i) => r.actuator === a && r.set === "on" && fired.has(i));
      if (!drivesOn) {
        return fail(
          `需要让${a === "heater" ? "加热器" : a === "fan" ? "风扇" : a === "sprinkler" ? "喷淋" : a === "growLight" ? "补光灯" : "遮阳帘"}真正被规则开过——它没有出现在任何命中行里。`,
          violation(0, "mustUse", 0, null, a),
        );
      }
    }
  }

  return {
    name: testCase.name,
    category: testCase.category,
    passed: true,
    reason: null,
    run,
    metrics,
    violation: null,
  };
}

function bandOf(
  inBand: NonNullable<GhCase["expect"]["inBand"]>,
  row: TraceRow | undefined,
): [number, number] | null {
  if (!row) {
    const first = SENSOR_IDS.map((v) => inBand[v]).find((b) => b !== undefined);
    return first ?? null;
  }
  for (const v of SENSOR_IDS) {
    const range = inBand[v];
    if (!range) continue;
    if (row.env[v] < range[0] || row.env[v] > range[1]) return range;
  }
  return null;
}

export { MAX_TICKS };
