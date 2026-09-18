/**
 * Bus readings: interpret a named group of pins as one binary number.
 * Pure functions only — no React, no evaluation. Buses are declared MSB
 * first on the stage (see StageDef.buses); an undriven pin reads as null
 * and makes every numeric reading null while still rendering as "?".
 */

import type { Bit } from "./graph.ts";
import type { BusDef, ImplicitSign } from "./stages.ts";

export type BusReading = {
  bus: BusDef;
  /** Per-pin values, MSB first; null = undriven. */
  bits: (Bit | null)[];
  /**
   * Derived implied sign bit for buses that carry only the low bits of a
   * wider two's-complement value. Null while its source pins are undriven,
   * and also null when the bus declares no implied sign.
   */
  signBit: Bit | null;
  /** MSB-first text, e.g. "0101"; an undriven pin renders as "?". */
  text: string;
  /** Null when any pin is undriven. */
  unsigned: number | null;
  /** Null when any pin is undriven, or when the bus is not signed. */
  signed: number | null;
  /** MSB-first place values: unsigned [8,4,2,1]; signed [-8,4,2,1]; an implied sign prepends -16. */
  weights: number[];
  /** e.g. "8×0 + 4×1 + 2×0 + 1×1 = 5"; null when any pin is undriven. */
  placeValue: string | null;
};

function pinsUnsigned(pins: string[], values: Record<string, Bit | null>): number | null {
  let sum = 0;
  for (let i = 0; i < pins.length; i += 1) {
    const bit = values[pins[i]];
    if (bit !== 0 && bit !== 1) return null;
    sum += bit * 2 ** (pins.length - 1 - i);
  }
  return sum;
}

/** Value of a bus's implied sign bit; null while the pins it reads are undriven. */
function implicitSignBit(rule: ImplicitSign, values: Record<string, Bit | null>): Bit | null {
  if (rule.kind === "zero") return 0;
  if (rule.kind === "nonzero") {
    const bits = rule.pins.map((pin) => values[pin] ?? null);
    return bits.every((bit) => bit !== null) ? (bits.includes(1) ? 1 : 0) : null;
  }
  const left = pinsUnsigned(rule.left, values);
  const right = pinsUnsigned(rule.right, values);
  if (left === null || right === null) return null;
  return left < right ? 1 : 0;
}

export function readBus(bus: BusDef, values: Record<string, Bit | null>): BusReading {
  const n = bus.pins.length;
  const bits = bus.pins.map((pin) => values[pin] ?? null);
  const signBit = bus.implicitSign ? implicitSignBit(bus.implicitSign, values) : null;
  // MSB first: pin i carries weight 2^(n-1-i); a signed bus negates the MSB.
  // An implicit-sign bus keeps every real pin positive and prepends a
  // virtual sign bit of weight −2^n instead.
  const weights = bus.pins.map((_, i) => {
    const weight = 2 ** (n - 1 - i);
    return bus.signed && !bus.implicitSign && i === 0 ? -weight : weight;
  });
  if (bus.implicitSign) weights.unshift(-(2 ** n));

  const text = bits.map((bit) => (bit === null ? "?" : String(bit))).join("");
  const complete = bits.every((bit) => bit !== null);

  // `unsigned` always uses plain positional weights, even on a signed bus.
  const unsigned = complete ? pinsUnsigned(bus.pins, values) : null;
  const signed = !bus.signed
    ? null
    : bus.implicitSign
      ? unsigned !== null && signBit !== null
        ? unsigned - signBit * 2 ** n
        : null
      : complete
        ? bits.reduce<number>((sum, bit, i) => sum + (bit ?? 0) * weights[i], 0)
        : null;

  const expanded = bus.implicitSign ? [signBit, ...bits] : bits;
  const placeValue =
    unsigned !== null && expanded.every((bit) => bit !== null)
      ? `${weights.map((weight, i) => `${weight}×${expanded[i]}`).join(" + ")} = ${bus.signed ? signed : unsigned}`
      : null;

  return { bus, bits, signBit, text, unsigned, signed, weights, placeValue };
}

export function readBuses(buses: BusDef[], values: Record<string, Bit | null>): BusReading[] {
  return buses.map((bus) => readBus(bus, values));
}
