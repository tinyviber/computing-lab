/**
 * Public sandbox cases — the "试运行" set every student sees. Same schema
 * as the hidden set; each case exercises at least one actuator cycle so
 * the anti-degenerate check can't false-positive on a sane table.
 */

import type { GhCase } from "../domain/protocol.ts";

const BAND_DAY: [number, number] = [180, 280];

const C1_CASES: GhCase[] = [
  {
    name: "夏季晴日",
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
    expect: { inBand: { airTemp: BAND_DAY }, inBandRatio: 0.85, scoreFrom: 8, endInBand: true },
  },
  {
    name: "寒潮夜",
    category: "持续低温",
    ticks: 96,
    initEnv: { airTemp: 240 },
    ambient: [{ t: 0, airTemp: 60 }],
    expect: { inBand: { airTemp: BAND_DAY }, inBandRatio: 0.85, scoreFrom: 8, endInBand: true },
  },
  {
    name: "午后热浪",
    category: "持续高温",
    ticks: 96,
    initEnv: { airTemp: 260 },
    ambient: [
      { t: 0, airTemp: 300 },
      { t: 40, airTemp: 380 },
      { t: 96, airTemp: 360 },
    ],
    expect: { inBand: { airTemp: BAND_DAY }, inBandRatio: 0.8, scoreFrom: 8, endInBand: true },
  },
  {
    name: "早春阴天",
    category: "温和过渡",
    ticks: 96,
    initEnv: { airTemp: 190 },
    ambient: [
      { t: 0, airTemp: 160 },
      { t: 50, airTemp: 220 },
      { t: 96, airTemp: 180 },
    ],
    expect: { inBand: { airTemp: BAND_DAY }, inBandRatio: 0.9, scoreFrom: 8 },
  },
];

const C2_CASES: GhCase[] = [
  {
    name: "昼夜温差",
    category: "双向调节",
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
      inBand: { airTemp: BAND_DAY },
      inBandRatio: 0.85,
      scoreFrom: 8,
      endInBand: true,
      mustUse: ["heater", "fan"],
    },
  },
  {
    name: "寒潮来袭",
    category: "单向加热",
    ticks: 96,
    initEnv: { airTemp: 210 },
    ambient: [
      { t: 0, airTemp: 90 },
      { t: 48, airTemp: 40 },
      { t: 96, airTemp: 60 },
    ],
    expect: {
      inBand: { airTemp: BAND_DAY },
      inBandRatio: 0.85,
      scoreFrom: 8,
      mustUse: ["heater"],
    },
  },
  {
    name: "闷热潮",
    category: "单向降温",
    ticks: 96,
    initEnv: { airTemp: 250 },
    ambient: [
      { t: 0, airTemp: 300 },
      { t: 40, airTemp: 360 },
      { t: 96, airTemp: 330 },
    ],
    expect: {
      inBand: { airTemp: BAND_DAY },
      inBandRatio: 0.8,
      scoreFrom: 8,
      mustUse: ["fan"],
    },
  },
];

const C3_CASES: GhCase[] = [
  {
    name: "临界缓摆",
    category: "振荡天气",
    ticks: 96,
    initEnv: { airTemp: 250 },
    ambient: [
      { t: 0, airTemp: 255 },
      { t: 24, airTemp: 330 },
      { t: 48, airTemp: 240 },
      { t: 72, airTemp: 325 },
      { t: 95, airTemp: 248 },
    ],
    expect: {
      inBand: { airTemp: BAND_DAY },
      inBandRatio: 0.85,
      scoreFrom: 8,
      switchCount: { fan: 8, heater: 8 },
      mustUse: ["fan"],
    },
  },
  {
    name: "昼夜大摆",
    category: "双向调节",
    ticks: 96,
    initEnv: { airTemp: 220 },
    ambient: [
      { t: 0, airTemp: 165 },
      { t: 26, airTemp: 152 },
      { t: 46, airTemp: 342 },
      { t: 68, airTemp: 218 },
      { t: 95, airTemp: 175 },
    ],
    expect: {
      inBand: { airTemp: BAND_DAY },
      inBandRatio: 0.85,
      scoreFrom: 8,
      endInBand: true,
      switchCount: { fan: 8, heater: 8 },
      mustUse: ["heater", "fan"],
    },
  },
  {
    name: "倒春寒夜",
    category: "振荡天气",
    ticks: 96,
    initEnv: { airTemp: 230 },
    ambient: [
      { t: 0, airTemp: 205 },
      { t: 14, airTemp: 150 },
      { t: 34, airTemp: 235 },
      { t: 56, airTemp: 150 },
      { t: 76, airTemp: 208 },
      { t: 95, airTemp: 178 },
    ],
    expect: {
      inBand: { airTemp: BAND_DAY },
      inBandRatio: 0.85,
      scoreFrom: 8,
      switchCount: { heater: 8, fan: 8 },
      mustUse: ["heater"],
    },
  },
];

const CASES: Record<number, GhCase[]> = { 1: C1_CASES, 2: C2_CASES, 3: C3_CASES };

export function publicCasesFor(stageIndex: number): GhCase[] {
  return CASES[stageIndex] ?? [];
}
