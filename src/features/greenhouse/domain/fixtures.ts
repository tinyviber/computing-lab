/**
 * Canned scenarios and traces for tests and docs. Determinism is the
 * contract, so the reference run is snapshot-tested in sim.test.ts —
 * a change in the tick order or trunc direction flips the snapshot.
 */

import type { GhCase } from "./protocol.ts";

/**
 * A summer day: pre-dawn chill, noon heat bump, night fall-off. Chosen so
 * a dead-band thermostat (heater < ~19.5, fan > ~25.5) holds 18–28°C.
 */
export const FIXED: GhCase = {
  name: "夏季晴日",
  category: "test",
  ticks: 96,
  initEnv: { airTemp: 200, soilMoisture: 400, light: 0 },
  initActs: { heater: false, fan: false, sprinkler: false, growLight: false, shade: false },
  ambient: [
    { t: 0, airTemp: 140 },
    { t: 28, airTemp: 140 },
    { t: 56, airTemp: 340 },
    { t: 80, airTemp: 200 },
    { t: 95, airTemp: 140 },
  ],
  expect: { inBand: { airTemp: [180, 280] }, inBandRatio: 0.85, scoreFrom: 8, endInBand: true },
};

/**
 * Reference wide dead-band controller: heater ±2° around 20.5°C, fan over
 * a 3.5°C window (24.5–28.0). Verified against every C2/C3 public and
 * hidden weather — narrower bands chatter on 临界缓摆-class cases.
 */
export const DEAD_BAND_RULES = [
  {
    when: { kind: "leaf" as const, sensor: "airTemp" as const, op: "<=" as const, value: 195 },
    actuator: "heater" as const,
    set: "on" as const,
  },
  {
    when: { kind: "leaf" as const, sensor: "airTemp" as const, op: ">=" as const, value: 215 },
    actuator: "heater" as const,
    set: "off" as const,
  },
  {
    when: { kind: "leaf" as const, sensor: "airTemp" as const, op: ">=" as const, value: 280 },
    actuator: "fan" as const,
    set: "on" as const,
  },
  {
    when: { kind: "leaf" as const, sensor: "airTemp" as const, op: "<=" as const, value: 245 },
    actuator: "fan" as const,
    set: "off" as const,
  },
];

/** Always-on heater vs an always-off one — degenerate/latch test fodder. */
export const LATCH_CASE: GhCase = {
  name: "只写开不写关",
  category: "test",
  ticks: 32,
  initEnv: { airTemp: 160 },
  initActs: { heater: false, fan: false },
  ambient: [{ t: 0, airTemp: 140 }],
  expect: { neverExceeded: { airTemp: [-100, 320] } },
};
