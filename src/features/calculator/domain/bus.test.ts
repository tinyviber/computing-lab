import { describe, expect, it } from "vitest";
import { readBus, readBuses } from "./bus.ts";
import type { BusDef } from "./stages.ts";

const unsignedNib: BusDef = {
  name: "A",
  pins: ["A3", "A2", "A1", "A0"],
  role: "input",
  signed: false,
};

const signedNib: BusDef = {
  name: "R",
  pins: ["R3", "R2", "R1", "R0"],
  role: "output",
  signed: true,
};

describe("readBus", () => {
  it("renders bits MSB first", () => {
    const reading = readBus(unsignedNib, { A3: 0, A2: 1, A1: 0, A0: 1 });
    expect(reading.text).toBe("0101");
    expect(reading.bits).toEqual([0, 1, 0, 1]);
    expect(reading.unsigned).toBe(5);
  });

  it("reads 1011 as 11 unsigned and -5 on a signed bus", () => {
    const values = { R3: 1, R2: 0, R1: 1, R0: 1 } as const;
    const reading = readBus(signedNib, values);
    expect(reading.text).toBe("1011");
    expect(reading.unsigned).toBe(11);
    expect(reading.signed).toBe(-5);
  });

  it("keeps signed null on an unsigned bus even for a leading 1", () => {
    const reading = readBus(unsignedNib, { A3: 1, A2: 0, A1: 1, A0: 1 });
    expect(reading.unsigned).toBe(11);
    expect(reading.signed).toBeNull();
    expect(reading.placeValue).toBe("8×1 + 4×0 + 2×1 + 1×1 = 11");
  });

  it("computes MSB-first weights for both modes", () => {
    expect(readBus(unsignedNib, {}).weights).toEqual([8, 4, 2, 1]);
    expect(readBus(signedNib, {}).weights).toEqual([-8, 4, 2, 1]);
  });

  it("writes the place-value expansion with negative weight for signed buses", () => {
    const reading = readBus(signedNib, { R3: 1, R2: 0, R1: 1, R0: 1 });
    expect(reading.placeValue).toBe("-8×1 + 4×0 + 2×1 + 1×1 = -5");
  });

  it("treats a missing pin as undriven: ? text and null readings", () => {
    const reading = readBus(unsignedNib, { A3: 0, A2: 1, A0: 1 });
    expect(reading.text).toBe("01?1");
    expect(reading.bits).toEqual([0, 1, null, 1]);
    expect(reading.unsigned).toBeNull();
    expect(reading.signed).toBeNull();
    expect(reading.placeValue).toBeNull();
  });

  it("supports a width-1 bus", () => {
    const carry: BusDef = { name: "Carry", pins: ["Carry"], role: "output", signed: false };
    const reading = readBus(carry, { Carry: 1 });
    expect(reading.text).toBe("1");
    expect(reading.unsigned).toBe(1);
    expect(reading.weights).toEqual([1]);
    expect(reading.placeValue).toBe("1×1 = 1");

    const signedBit: BusDef = { name: "S", pins: ["S"], role: "output", signed: true };
    const signedReading = readBus(signedBit, { S: 1 });
    expect(signedReading.weights).toEqual([-1]);
    expect(signedReading.unsigned).toBe(1);
    expect(signedReading.signed).toBe(-1);
  });
});

describe("readBuses", () => {
  it("reads every bus against the same pin values", () => {
    const readings = readBuses([unsignedNib, signedNib], {
      A3: 0,
      A2: 1,
      A1: 0,
      A0: 1,
      R3: 1,
      R2: 0,
      R1: 1,
      R0: 1,
    });
    expect(readings.map((r) => r.text)).toEqual(["0101", "1011"]);
    expect(readings[0].bus).toBe(unsignedNib);
  });
});
