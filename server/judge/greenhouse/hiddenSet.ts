/**
 * Hidden judgement cases for the greenhouse lab. Every student faces the
 * same scenario FAMILY — the seed only derives an initEnv offset and an
 * ambient phase shift (issue §5), so the weather shape a case is testing
 * stays identical while copy-pasted thresholds break on a shifted day.
 *
 * Case design rules the whole file follows:
 *   - every case drives the env across at least one rule boundary in
 *     both directions, so a sane dead-band table can't fail the
 *     anti-degenerate check;
 *   - C2 includes the mandatory fall-back negatives (「只写开不写关必挂」)
 *     — weather that punishes a table missing its OFF rows;
 *   - C3 is the oscillation family: ambient loitering near the band edge
 *     turns a zero-dead-zone table into actuator chatter.
 */

import type { GhCase } from "../../../src/features/greenhouse/domain/protocol.ts";
import { makeRng, seedFor } from "../../../src/features/greenhouse/domain/rng.ts";

const BAND: [number, number] = [180, 280];

/** Shift initial env and ambient phase by the per-user seed only. */
function perturb(c: GhCase, seed: number): GhCase {
  const rng = makeRng(seed);
  const dTemp = Math.round((rng() * 2 - 1) * 20); // ±2.0°C
  const dSoil = Math.round((rng() * 2 - 1) * 40); // ±4%
  const phase = Math.round(rng() * 12) - 6; // ±6 ticks ≈ ±1.5h
  const shifted = c.ambient
    .map((a) => ({ ...a, t: Math.min(Math.max(a.t + phase, 0), c.ticks - 1) }))
    .sort((a, b) => a.t - b.t);
  // Two anchors landing on the same tick: the later one wins.
  const ambient = shifted.filter((a, i) => i === 0 || a.t !== shifted[i - 1].t);
  return {
    ...c,
    initEnv: {
      ...c.initEnv,
      airTemp: (c.initEnv?.airTemp ?? 200) + dTemp,
      soilMoisture: (c.initEnv?.soilMoisture ?? 400) + dSoil,
    },
    ambient,
  };
}

/* ---- C1: the canned setpoint controller on an ambient×initEnv grid ---- */

const C1_WEATHERS: { name: string; anchors: GhCase["ambient"] }[] = [
  {
    name: "晴日温差",
    anchors: [
      { t: 0, airTemp: 140 },
      { t: 28, airTemp: 140 },
      { t: 56, airTemp: 340 },
      { t: 80, airTemp: 200 },
      { t: 95, airTemp: 140 },
    ],
  },
  // Edge-setpoint negative (cold side): setpoint ≈16–18°C never warms up.
  { name: "寒潮夜", anchors: [{ t: 0, airTemp: 60 }] },
  // Edge-setpoint negative (hot side): setpoint ≈26–28°C never cools down.
  {
    name: "热浪午后",
    anchors: [
      { t: 0, airTemp: 320 },
      { t: 40, airTemp: 385 },
      { t: 96, airTemp: 350 },
    ],
  },
  {
    name: "多云缓变",
    anchors: [
      { t: 0, airTemp: 200 },
      { t: 32, airTemp: 165 },
      { t: 64, airTemp: 235 },
      { t: 96, airTemp: 190 },
    ],
  },
];

const C1: GhCase[] = C1_WEATHERS.flatMap((w) =>
  [
    { tag: "冷启动", init: 150 },
    { tag: "热启动", init: 290 },
  ].map(({ tag, init }) => ({
    name: `${w.name}·${tag}`,
    category: w.name,
    ticks: 96,
    initEnv: { airTemp: init },
    ambient: w.anchors,
    expect: { inBand: { airTemp: BAND }, inBandRatio: 0.8, scoreFrom: 8, endInBand: true },
  })),
);

/* ---- C2: the open rule table on the boundary matrix ---- */

const C2: GhCase[] = [
  {
    name: "晴日·常温开场",
    category: "昼夜温差",
    ticks: 96,
    initEnv: { airTemp: 200 },
    ambient: [
      { t: 0, airTemp: 140 },
      { t: 28, airTemp: 140 },
      { t: 56, airTemp: 340 },
      { t: 80, airTemp: 200 },
      { t: 95, airTemp: 140 },
    ],
    expect: {
      inBand: { airTemp: BAND },
      inBandRatio: 0.85,
      scoreFrom: 8,
      endInBand: true,
      mustUse: ["heater", "fan"],
    },
  },
  {
    name: "晴日·偏热开场",
    category: "昼夜温差",
    ticks: 96,
    initEnv: { airTemp: 265 },
    ambient: [
      { t: 0, airTemp: 150 },
      { t: 24, airTemp: 150 },
      { t: 52, airTemp: 355 },
      { t: 78, airTemp: 215 },
      { t: 95, airTemp: 150 },
    ],
    expect: {
      inBand: { airTemp: BAND },
      inBandRatio: 0.85,
      scoreFrom: 8,
      endInBand: true,
      mustUse: ["heater", "fan"],
    },
  },
  {
    name: "寒潮·深秋夜",
    category: "单向加热",
    ticks: 96,
    initEnv: { airTemp: 215 },
    ambient: [
      { t: 0, airTemp: 85 },
      { t: 48, airTemp: 40 },
      { t: 96, airTemp: 55 },
    ],
    expect: { inBand: { airTemp: BAND }, inBandRatio: 0.85, scoreFrom: 8, mustUse: ["heater"] },
  },
  {
    name: "寒潮·进场已偏暖",
    category: "单向加热",
    ticks: 96,
    initEnv: { airTemp: 250 },
    ambient: [{ t: 0, airTemp: 60 }],
    expect: { inBand: { airTemp: BAND }, inBandRatio: 0.85, scoreFrom: 8, mustUse: ["heater"] },
  },
  {
    name: "热浪·干热风",
    category: "单向降温",
    ticks: 96,
    initEnv: { airTemp: 240 },
    ambient: [{ t: 0, airTemp: 355 }],
    expect: { inBand: { airTemp: BAND }, inBandRatio: 0.8, scoreFrom: 8, mustUse: ["fan"] },
  },
  {
    name: "热浪·进场已烫",
    category: "单向降温",
    ticks: 96,
    initEnv: { airTemp: 300 },
    ambient: [
      { t: 0, airTemp: 330 },
      { t: 40, airTemp: 385 },
      { t: 96, airTemp: 340 },
    ],
    expect: { inBand: { airTemp: BAND }, inBandRatio: 0.8, scoreFrom: 8, mustUse: ["fan"] },
  },
  // Fall-back negative: heat fades to mild — a fan row with no OFF row
  // rides the env down to amb−144 ≈ 50 and freezes the crop.
  {
    name: "傍晚回落",
    category: "回落",
    ticks: 96,
    initEnv: { airTemp: 320 },
    ambient: [
      { t: 0, airTemp: 370 },
      { t: 48, airTemp: 300 },
      { t: 96, airTemp: 190 },
    ],
    expect: {
      inBand: { airTemp: BAND },
      inBandRatio: 0.8,
      scoreFrom: 8,
      endInBand: true,
      neverExceeded: { airTemp: [80, 340] },
      mustUse: ["fan"],
    },
  },
  // Fall-back negative: a cold dawn warming into comfort — a heater row
  // with no OFF row runs away toward amb+216 ≈ 440.
  {
    name: "清晨回暖",
    category: "回暖",
    ticks: 96,
    initEnv: { airTemp: 150 },
    ambient: [
      { t: 0, airTemp: 60 },
      { t: 56, airTemp: 120 },
      { t: 96, airTemp: 230 },
    ],
    expect: {
      inBand: { airTemp: BAND },
      inBandRatio: 0.8,
      scoreFrom: 8,
      neverExceeded: { airTemp: [80, 340] },
      mustUse: ["heater"],
    },
  },
  {
    name: "寒夜急冻",
    category: "单向加热",
    ticks: 96,
    initEnv: { airTemp: 170 },
    ambient: [{ t: 0, airTemp: 30 }],
    expect: { inBand: { airTemp: BAND }, inBandRatio: 0.8, scoreFrom: 8, mustUse: ["heater"] },
  },
  {
    name: "阴冷绵雨",
    category: "单向加热",
    ticks: 96,
    initEnv: { airTemp: 190 },
    ambient: [{ t: 0, airTemp: 110 }],
    expect: { inBand: { airTemp: BAND }, inBandRatio: 0.85, scoreFrom: 8, mustUse: ["heater"] },
  },
  {
    name: "干热风暴晒",
    category: "单向降温",
    ticks: 96,
    initEnv: { airTemp: 280 },
    ambient: [
      { t: 0, airTemp: 390 },
      { t: 96, airTemp: 335 },
    ],
    expect: { inBand: { airTemp: BAND }, inBandRatio: 0.78, scoreFrom: 8, mustUse: ["fan"] },
  },
  {
    name: "全天缓升",
    category: "昼夜温差",
    ticks: 96,
    initEnv: { airTemp: 185 },
    ambient: [
      { t: 0, airTemp: 120 },
      { t: 48, airTemp: 300 },
      { t: 96, airTemp: 330 },
    ],
    expect: {
      inBand: { airTemp: BAND },
      inBandRatio: 0.8,
      scoreFrom: 8,
      mustUse: ["heater", "fan"],
    },
  },
];

/* ---- C3: the oscillation family — ambient brushes the edge, briefly ----
 *
 * Excursions stay TRANSIENT on purpose: a sustained extreme ambient would
 * force even a wide dead-band into unavoidable bang-bang cycling. The
 * weather pokes across the control boundary then recedes, so a table with
 * a real dead zone rides each poke in one or two cycles while a
 * single-threshold table chatters the whole time it loiters near it.
 */

const C3_DEF: {
  name: string;
  amb: [number, number][];
  init: number;
  mustUse: ("heater" | "fan")[];
}[] = [
  {
    name: "临界缓摆",
    amb: [
      [0, 255],
      [24, 330],
      [48, 240],
      [72, 325],
      [95, 248],
    ],
    init: 250,
    mustUse: ["fan"],
  },
  {
    name: "高频阴晴",
    amb: [
      [0, 258],
      [16, 322],
      [32, 246],
      [48, 318],
      [64, 244],
      [80, 320],
      [95, 250],
    ],
    init: 240,
    mustUse: ["fan"],
  },
  {
    name: "缓坡过境",
    amb: [
      [0, 215],
      [24, 262],
      [48, 332],
      [72, 255],
      [95, 218],
    ],
    init: 235,
    mustUse: ["fan"],
  },
  {
    name: "寒潮边缘摆",
    amb: [
      [0, 210],
      [20, 150],
      [44, 235],
      [68, 158],
      [95, 198],
    ],
    init: 230,
    mustUse: ["heater"],
  },
  {
    name: "晨霜晚霁",
    amb: [
      [0, 215],
      [14, 150],
      [34, 235],
      [56, 148],
      [76, 205],
      [95, 185],
    ],
    init: 245,
    mustUse: ["heater"],
  },
  {
    name: "昼暖夜寒双摆",
    amb: [
      [0, 150],
      [20, 150],
      [44, 215],
      [72, 335],
      [95, 235],
    ],
    init: 225,
    mustUse: ["heater", "fan"],
  },
  {
    name: "烈日三连峰",
    amb: [
      [0, 242],
      [16, 325],
      [32, 250],
      [48, 328],
      [64, 242],
      [80, 322],
      [95, 250],
    ],
    init: 255,
    mustUse: ["fan"],
  },
  {
    name: "暖夜回潮",
    amb: [
      [0, 238],
      [24, 308],
      [48, 258],
      [72, 300],
      [95, 242],
    ],
    init: 230,
    mustUse: ["fan"],
  },
];

const C3: GhCase[] = C3_DEF.flatMap(({ name, amb, init, mustUse }) => {
  const anchors = amb.map(([t, airTemp]) => ({ t, airTemp }));
  return [
    {
      name: `${name}·常温进场`,
      category: name,
      ticks: 96,
      initEnv: { airTemp: init },
      ambient: anchors,
      expect: {
        inBand: { airTemp: BAND },
        inBandRatio: 0.82,
        scoreFrom: 8,
        switchCount: { fan: 8, heater: 8 },
        mustUse,
      },
    },
    {
      name: `${name}·偏移进场`,
      category: name,
      ticks: 96,
      initEnv: { airTemp: init > 240 ? init - 60 : init + 55 },
      ambient: anchors.map((a) => ({ ...a })),
      expect: {
        inBand: { airTemp: BAND },
        inBandRatio: 0.82,
        scoreFrom: 8,
        switchCount: { fan: 8, heater: 8 },
        mustUse,
      },
    },
  ] satisfies GhCase[];
});

const BASE: Record<number, GhCase[]> = { 1: C1, 2: C2, 3: C3 };

/** Hidden cases for (stage, user): same family, seeded offset + phase. */
export function hiddenCasesFor(stageIndex: number, userId: string): GhCase[] {
  const base = BASE[stageIndex] ?? [];
  return base.map((c) => perturb(c, seedFor(userId, "greenhouse", stageIndex, c.name)));
}
