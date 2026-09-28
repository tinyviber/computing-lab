/**
 * Domain tests for the greenhouse simulator: deterministic ticks, integer
 * truncation, rule sanitization, the judge's metric order, and the hidden
 * set's bounds. Reference drafts double as the contract the hidden cases
 * are calibrated against.
 */

import { describe, expect, it } from "vitest";
import { judgeCase, rulesForStage } from "../lesson/scenario.ts";
import { publicCasesFor } from "../lesson/publicCases.ts";
import { hiddenCasesFor } from "../../../../server/judge/greenhouse/hiddenSet.ts";
import { DEFAULT_ENV, PHYS_BOUNDS, SENSOR_IDS, type ActuatorId } from "./model.ts";
import { FIXED, DEAD_BAND_RULES, LATCH_CASE } from "./fixtures.ts";
import type { GhCase, GhDraft } from "./protocol.ts";
import { GLOBAL_LIMITS, sanitizeRules, setpointRules } from "./rules.ts";
import { GREENHOUSE_STAGES, getGhStage } from "./stages.ts";
import { simulate } from "./simulate.ts";

const stage = (index: number) => {
  const s = getGhStage(index);
  if (!s) throw new Error(`no stage ${index}`);
  return s;
};

/** The calibrated reference: heater ±2° around 20.5, fan over 24.5–28.0. */
const WIDE: GhDraft = { rules: DEAD_BAND_RULES };

const c2case = (over: Partial<GhCase>): GhCase => ({
  name: "测试场景",
  category: "测试",
  ticks: 96,
  ambient: [
    { t: 0, airTemp: 300 },
    { t: 40, airTemp: 300 },
    { t: 50, airTemp: 120 },
    { t: 95, airTemp: 120 },
  ],
  expect: {},
  ...over,
});

describe("simulate", () => {
  it("is deterministic — identical inputs give identical traces", () => {
    const a = simulate(FIXED, DEAD_BAND_RULES);
    const b = simulate(FIXED, DEAD_BAND_RULES);
    expect(a).toEqual(b);
  });

  it("truncates relax steps toward zero", () => {
    // amb 200 − env 219 = −19 → trunc(−19/12) = −1, not −2.
    const run = simulate(
      {
        ticks: 1,
        initEnv: { airTemp: 219 },
        ambient: [{ t: 0, airTemp: 200 }],
        faults: [],
      },
      [],
    );
    expect(run.trace[0].env.airTemp).toBe(218);
    // Positive: 200 − 189 = +11 → trunc(11/12) = 0 → env holds.
    const up = simulate(
      {
        ticks: 1,
        initEnv: { airTemp: 189 },
        ambient: [{ t: 0, airTemp: 200 }],
        faults: [],
      },
      [],
    );
    expect(up.trace[0].env.airTemp).toBe(189);
  });

  it("holds actuator state when no row hits and latches between ticks", () => {
    const run = simulate({ ...LATCH_CASE, initActs: { fan: true } }, [
      {
        when: { kind: "leaf", sensor: "airTemp", op: ">", value: 590 },
        actuator: "fan",
        set: "on",
      },
    ]);
    expect(run.trace.every((r) => r.acts.fan)).toBe(true);
  });

  it("clamps env to physical bounds and flags the tick", () => {
    const run = simulate(
      {
        ticks: 4,
        initEnv: { airTemp: 599 },
        initActs: { heater: true },
        ambient: [{ t: 0, airTemp: 600 }],
        faults: [],
      },
      [],
    );
    expect(run.trace.some((r) => r.clamped.includes("airTemp"))).toBe(true);
    expect(run.trace.every((r) => r.env.airTemp <= PHYS_BOUNDS.airTemp[1])).toBe(true);
  });
});

describe("sanitizeRules", () => {
  const limits = { ...GLOBAL_LIMITS };

  it("accepts the wide dead-band reference", () => {
    const out = sanitizeRules(WIDE.rules, limits);
    expect(out).toEqual(WIDE.rules);
  });

  it("rejects thresholds on or outside the open sensor range", () => {
    const rules = (value: number) => [
      {
        when: { kind: "leaf" as const, sensor: "airTemp" as const, op: "<" as const, value },
        actuator: "fan" as const,
        set: "on" as const,
      },
    ];
    // airTemp range is (−100, 600): the bounds themselves are unreachable.
    expect(sanitizeRules(rules(600), limits)).toEqual([]);
    expect(sanitizeRules(rules(-100), limits)).toEqual([]);
    expect(sanitizeRules(rules(599), limits)).toHaveLength(1);
    expect(sanitizeRules(rules(-99), limits)).toHaveLength(1);
  });

  it("drops rows with out-of-palette sensors or actuators", () => {
    const stageLimits = {
      maxRules: 8,
      sensors: ["airTemp" as const],
      actuators: ["heater" as const, "fan" as const],
    };
    const out = sanitizeRules(
      [
        ...(WIDE.rules ?? []),
        {
          when: { kind: "leaf" as const, sensor: "light" as const, op: ">" as const, value: 300 },
          actuator: "fan" as const,
          set: "on" as const,
        },
        {
          when: { kind: "leaf" as const, sensor: "airTemp" as const, op: ">" as const, value: 250 },
          actuator: "sprinkler" as const,
          set: "on" as const,
        },
      ],
      stageLimits,
    );
    expect(out).toHaveLength(WIDE.rules?.length ?? 0);
  });

  it("caps the table at MAX_RULES rows", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      when: { kind: "leaf" as const, sensor: "airTemp" as const, op: "<" as const, value: 100 + i },
      actuator: "fan" as const,
      set: "on" as const,
    }));
    expect(sanitizeRules(many, limits)).toHaveLength(8);
  });

  it("rejects non-finite thresholds and malformed conditions", () => {
    const out = sanitizeRules(
      [
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<", value: Number.NaN },
          actuator: "fan",
          set: "on",
        },
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<", value: "240" },
          actuator: "fan",
          set: "on",
        },
        { when: { kind: "all", children: [] }, actuator: "fan", set: "on" },
        {
          when: { kind: "leaf", sensor: "bogus", op: "<", value: 200 },
          actuator: "fan",
          set: "on",
        },
      ] as never,
      limits,
    );
    expect(out).toEqual([]);
  });

  it("supports all/any groups up to depth 2", () => {
    const leaf = {
      kind: "leaf" as const,
      sensor: "airTemp" as const,
      op: "<" as const,
      value: 200,
    };
    const group = {
      kind: "any" as const,
      children: [leaf, { kind: "all" as const, children: [leaf, leaf] }],
    };
    const deep = { kind: "all" as const, children: [group] };
    expect(sanitizeRules([{ when: group, actuator: "fan", set: "on" }], limits)).toHaveLength(1);
    // Depth-3 group (all → any → all) exceeds the cap.
    expect(sanitizeRules([{ when: deep, actuator: "fan", set: "on" }], limits)).toEqual([]);
  });
});

describe("judgeCase metrics", () => {
  const s2 = stage(2);

  it("mustUse: a rule that never turns the actuator on fails", () => {
    const onlyOff: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<", value: 250 },
          actuator: "fan",
          set: "off",
        },
      ],
    };
    const verdict = judgeCase(onlyOff, s2, { ...c2case({}), expect: { mustUse: ["fan"] } });
    expect(verdict.passed).toBe(false);
    expect(verdict.violation?.metric).toBe("mustUse");
  });

  it("switchCount: the first flip off the initial state is free", () => {
    // Whatever the scenario does, counted = raw flips − 1: compare the
    // metric against flips observed in the trace itself.
    const rules: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<", value: 260 },
          actuator: "fan",
          set: "off",
        },
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">", value: 270 },
          actuator: "fan",
          set: "on",
        },
      ],
    };
    const swings: GhCase = c2case({
      initActs: { fan: true },
      ambient: [
        { t: 0, airTemp: 220 },
        { t: 40, airTemp: 220 },
        { t: 60, airTemp: 300 },
        { t: 95, airTemp: 300 },
      ],
      expect: { switchCount: { fan: 99 } },
    });
    const run = simulate(swings, rulesForStage(rules, s2));
    let rawFlips = 0;
    for (let i = 0; i < run.trace.length; i += 1) {
      const prev = i > 0 ? run.trace[i - 1].acts.fan : run.initActs.fan;
      if (run.trace[i].acts.fan !== prev) rawFlips += 1;
    }
    expect(rawFlips).toBeGreaterThan(1);
    const verdict = judgeCase(rules, s2, swings);
    expect(verdict.metrics.switchCount.fan).toBe(rawFlips - 1);
    expect(verdict.passed).toBe(true);
  });

  it("switchCount: repeated toggling counts every later flip", () => {
    // Zero dead band at 25° under flat warm ambient → bang-bang chatter.
    const rules: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">", value: 250 },
          actuator: "fan",
          set: "on",
        },
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<=", value: 250 },
          actuator: "fan",
          set: "off",
        },
      ],
    };
    const warm: GhCase = c2case({
      initEnv: { airTemp: 255 },
      ambient: [{ t: 0, airTemp: 280 }],
      expect: { switchCount: { fan: 2 } },
    });
    const verdict = judgeCase(rules, s2, warm);
    expect(verdict.passed).toBe(false);
    expect(verdict.violation?.metric).toBe("switchCount");
    expect(verdict.metrics.switchCount.fan).toBeGreaterThan(2);
  });

  it("neverExceeded: a clamped tick counts as a violation even inside the band", () => {
    // Band covers the whole physical range — only a clamp flag can fail it.
    const push: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<", value: 599 },
          actuator: "heater",
          set: "on",
        },
      ],
    };
    const hot: GhCase = c2case({
      initEnv: { airTemp: 598 },
      ambient: [{ t: 0, airTemp: 600 }],
      expect: { neverExceeded: { airTemp: [0, 600] } },
    });
    const verdict = judgeCase(push, s2, hot);
    expect(verdict.passed).toBe(false);
    expect(verdict.violation?.metric).toBe("neverExceeded");
  });

  it("inBandRatio counts scored ticks from scoreFrom inclusive", () => {
    // Flat 26° ambient: env parks a notch below ambient (integer relax
    // stalls inside the band) → all 96 ticks score and stay in band.
    const mild: GhCase = c2case({
      ambient: [{ t: 0, airTemp: 260 }],
      expect: { inBand: { airTemp: [200, 250] }, inBandRatio: 0.8, scoreFrom: 0 },
    });
    const ok = judgeCase(WIDE, s2, mild);
    expect(ok.metrics.scoredTicks).toBe(96);
    expect(ok.metrics.inBandTicks).toBe(96);
    expect(ok.passed).toBe(true);
    // scoreFrom halves the scored window exactly.
    const half = judgeCase(WIDE, s2, { ...mild, expect: { ...mild.expect, scoreFrom: 48 } });
    expect(half.metrics.scoredTicks).toBe(48);

    // Hot ambient pushes env past the band's top → counted misses fail.
    const fanOnly: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">=", value: 280 },
          actuator: "fan",
          set: "on",
        },
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<=", value: 245 },
          actuator: "fan",
          set: "off",
        },
      ],
    };
    const hot = judgeCase(fanOnly, s2, {
      ...mild,
      ambient: [{ t: 0, airTemp: 340 }],
      expect: { inBand: { airTemp: [200, 250] }, inBandRatio: 0.8 },
    });
    expect(hot.metrics.inBandTicks).toBeLessThan(hot.metrics.scoredTicks);
    expect(hot.passed).toBe(false);
    expect(hot.violation?.metric).toBe("inBand");
  });

  it("anti-degenerate: rules that never fire fail before metric checks", () => {
    const neverFires: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">", value: 590 },
          actuator: "fan",
          set: "on",
        },
      ],
    };
    const verdict = judgeCase(neverFires, s2, c2case({ ambient: [{ t: 0, airTemp: 220 }] }));
    expect(verdict.passed).toBe(false);
    expect(verdict.violation?.metric).toBe("no-rule-fired");
  });

  it("anti-degenerate: a leaf that only judges one way fails", () => {
    // Both thresholds sit far from the environment's range: >400 never
    // sees true, <350 never sees false — nothing judged both ways.
    const rules: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">", value: 400 },
          actuator: "fan",
          set: "on",
        },
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<", value: 350 },
          actuator: "fan",
          set: "off",
        },
      ],
    };
    const verdict = judgeCase(
      rules,
      s2,
      c2case({ initEnv: { airTemp: 200 }, ambient: [{ t: 0, airTemp: 200 }] }),
    );
    expect(verdict.passed).toBe(false);
    expect(verdict.violation?.metric).toBe("leaf-one-sided");
  });
});

describe("reference drafts against public cases", () => {
  it("C1 mid-range setpoints pass every public case", () => {
    for (const c of publicCasesFor(1)) {
      for (const setpoint of [20, 22, 24, 26]) {
        const verdict = judgeCase({ setpoint }, stage(1), c);
        expect(verdict.passed, `${c.name} @ ${setpoint}: ${verdict.reason ?? ""}`).toBe(true);
      }
    }
  });

  it("C2 wide dead band passes every public case", () => {
    for (const c of publicCasesFor(2)) {
      const verdict = judgeCase(WIDE, stage(2), c);
      expect(verdict.passed, `${c.name}: ${verdict.reason ?? ""}`).toBe(true);
    }
  });

  it("C3 wide dead band passes every public case", () => {
    for (const c of publicCasesFor(3)) {
      const verdict = judgeCase(WIDE, stage(3), c);
      expect(verdict.passed, `${c.name}: ${verdict.reason ?? ""}`).toBe(true);
    }
  });

  it("the on-only draft fails a public C2 case (只写开不写关必挂)", () => {
    const onOnly: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">", value: 270 },
          actuator: "fan",
          set: "on",
        },
      ],
    };
    const failed = publicCasesFor(2).filter((c) => !judgeCase(onOnly, stage(2), c).passed);
    expect(failed.length).toBeGreaterThan(0);
  });
});

describe("hidden set", () => {
  it("generates the boundary-matrix sizes per stage", () => {
    expect(hiddenCasesFor(1, "u1")).toHaveLength(8);
    expect(hiddenCasesFor(2, "u1")).toHaveLength(12);
    expect(hiddenCasesFor(3, "u1")).toHaveLength(16);
  });

  it("is deterministic per user and varies across users", () => {
    const a = hiddenCasesFor(2, "user-a");
    const b = hiddenCasesFor(2, "user-a");
    const c = hiddenCasesFor(2, "user-b");
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("keeps ambient anchors and init env inside sensor bounds and tick range", () => {
    for (const stageIndex of [1, 2, 3]) {
      for (const c of hiddenCasesFor(stageIndex, "bounds-check")) {
        for (const anchor of c.ambient) {
          expect(anchor.t).toBeGreaterThanOrEqual(0);
          expect(anchor.t).toBeLessThan(c.ticks);
          for (const [v, value] of Object.entries(anchor)) {
            if (v === "t") continue;
            const [lo, hi] = PHYS_BOUNDS[v as (typeof SENSOR_IDS)[number]];
            expect(value).toBeGreaterThanOrEqual(lo);
            expect(value).toBeLessThanOrEqual(hi);
          }
        }
        for (const [v, value] of Object.entries(c.initEnv ?? {})) {
          const [lo, hi] = PHYS_BOUNDS[v as (typeof SENSOR_IDS)[number]];
          expect(value).toBeGreaterThanOrEqual(lo);
          expect(value).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it("seeded cases still admit the reference solutions", () => {
    const c3 = stage(3);
    for (const user of ["alice", "bob", "carol"]) {
      for (const c of hiddenCasesFor(3, user)) {
        const verdict = judgeCase(WIDE, c3, c);
        expect(verdict.passed, `${user}/${c.name}: ${verdict.reason ?? ""}`).toBe(true);
      }
    }
  });

  it("C2 hidden set keeps the mandatory fall-back negative (只写开不写关)", () => {
    const onOnly: GhDraft = {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">", value: 270 },
          actuator: "fan",
          set: "on",
        },
      ],
    };
    const s2 = stage(2);
    const failed = hiddenCasesFor(2, "dave").filter((c) => !judgeCase(onOnly, s2, c).passed);
    expect(failed.length).toBeGreaterThan(0);
  });
});

describe("stage definitions", () => {
  it("pins the C1–C3 ladder", () => {
    expect(GREENHOUSE_STAGES.map((s) => s.id)).toEqual([
      "watch-it-run",
      "write-the-rules",
      "stop-the-chatter",
    ]);
    expect(GREENHOUSE_STAGES.map((s) => s.control)).toEqual(["setpoint", "rules", "rules"]);
  });

  it("setpoint stages build the builtin controller rows", () => {
    const rules = setpointRules(22);
    expect(rules).toHaveLength(4);
    expect(rules.map((r) => r.actuator)).toEqual(["heater", "heater", "fan", "fan"]);
    expect(rulesForStage({ setpoint: 22 }, stage(1))).toEqual(rules);
  });

  it("rulesForStage clamps the setpoint slider into the legal band", () => {
    expect(rulesForStage({ setpoint: 40 }, stage(1))).toEqual(setpointRules(28));
    expect(rulesForStage({ setpoint: 4 }, stage(1))).toEqual(setpointRules(16));
  });
});
