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

  it("reads the implied sign bit as a virtual -16 MSB", () => {
    // Stage-4 shape: R is the low 4 bits of -A; the sign is 1 iff A ≠ 0.
    const lowBits: BusDef = {
      name: "R",
      pins: ["R3", "R2", "R1", "R0"],
      role: "output",
      signed: true,
      implicitSign: { kind: "nonzero", pins: ["A3", "A2", "A1", "A0"] },
    };
    const neg = readBus(lowBits, {
      A3: 0,
      A2: 1,
      A1: 0,
      A0: 1,
      R3: 1,
      R2: 0,
      R1: 1,
      R0: 1,
    });
    expect(neg.signBit).toBe(1);
    expect(neg.weights).toEqual([-16, 8, 4, 2, 1]);
    expect(neg.unsigned).toBe(11);
    expect(neg.signed).toBe(-5);
    expect(neg.placeValue).toBe("-16×1 + 8×1 + 4×0 + 2×1 + 1×1 = -5");

    // A = 0 keeps the sign at 0, so the same pins read as +11.
    const zero = readBus(lowBits, {
      A3: 0,
      A2: 0,
      A1: 0,
      A0: 0,
      R3: 1,
      R2: 0,
      R1: 1,
      R0: 1,
    });
    expect(zero.signBit).toBe(0);
    expect(zero.signed).toBe(11);
  });

  it("derives a borrow-style implied sign from comparing two inputs", () => {
    // Stage-5 shape: the sign of A - B is 1 iff A < B.
    const lowBits: BusDef = {
      name: "R",
      pins: ["R3", "R2", "R1", "R0"],
      role: "output",
      signed: true,
      implicitSign: {
        kind: "lt",
        left: ["A3", "A2", "A1", "A0"],
        right: ["B3", "B2", "B1", "B0"],
      },
    };
    const borrow = readBus(lowBits, {
      A3: 0,
      A2: 0,
      A1: 0,
      A0: 0,
      B3: 1,
      B2: 1,
      B1: 1,
      B0: 1,
      R3: 0,
      R2: 0,
      R1: 0,
      R0: 1,
    });
    // 0 - 15 = -15: the low bits read 0001 while the true value is -15.
    expect(borrow.signBit).toBe(1);
    expect(borrow.signed).toBe(-15);
    expect(borrow.placeValue).toBe("-16×1 + 8×0 + 4×0 + 2×0 + 1×1 = -15");

    const noBorrow = readBus(lowBits, {
      A3: 0,
      A2: 1,
      A1: 0,
      A0: 1,
      B3: 0,
      B2: 0,
      B1: 1,
      B0: 1,
      R3: 0,
      R2: 0,
      R1: 1,
      R0: 0,
    });
    expect(noBorrow.signBit).toBe(0);
    expect(noBorrow.signed).toBe(2);
  });

  it("keeps the signed reading null while the implied sign is undriven", () => {
    const lowBits: BusDef = {
      name: "R",
      pins: ["R3", "R2", "R1", "R0"],
      role: "output",
      signed: true,
      implicitSign: { kind: "nonzero", pins: ["A3", "A2", "A1", "A0"] },
    };
    const reading = readBus(lowBits, { A3: 0, R3: 1, R2: 0, R1: 1, R0: 1 });
    expect(reading.signBit).toBeNull();
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
