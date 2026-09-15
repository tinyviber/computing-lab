/**
 * Bus readings: interpret a named group of pins as one binary number.
 * Pure functions only — no React, no evaluation. Buses are declared MSB
 * first on the stage (see StageDef.buses); an undriven pin reads as null
 * and makes every numeric reading null while still rendering as "?".
 */

import type { Bit } from "./graph.ts";
import type { BusDef } from "./stages.ts";

export type BusReading = {
  bus: BusDef;
  /** Per-pin values, MSB first; null = undriven. */
  bits: (Bit | null)[];
  /** MSB-first text, e.g. "0101"; an undriven pin renders as "?". */
  text: string;
  /** Null when any pin is undriven. */
  unsigned: number | null;
  /** Null when any pin is undriven, or when the bus is not signed. */
  signed: number | null;
  /** MSB-first place values: unsigned [8,4,2,1]; signed [-8,4,2,1]. */
  weights: number[];
  /** e.g. "8×0 + 4×1 + 2×0 + 1×1 = 5"; null when any pin is undriven. */
  placeValue: string | null;
};

export function readBus(bus: BusDef, values: Record<string, Bit | null>): BusReading {
  const n = bus.pins.length;
  const bits = bus.pins.map((pin) => values[pin] ?? null);
  // MSB first: pin i carries weight 2^(n-1-i); a signed bus negates the MSB.
  const weights = bus.pins.map((_, i) => {
    const weight = 2 ** (n - 1 - i);
    return bus.signed && i === 0 ? -weight : weight;
  });
  const text = bits.map((bit) => (bit === null ? "?" : String(bit))).join("");
  const complete = bits.every((bit) => bit !== null);

  // `unsigned` always uses plain positional weights, even on a signed bus.
  const unsigned = complete
    ? bits.reduce<number>((sum, bit, i) => sum + (bit ?? 0) * 2 ** (n - 1 - i), 0)
    : null;
  const signed =
    complete && bus.signed
      ? bits.reduce<number>((sum, bit, i) => sum + (bit ?? 0) * weights[i], 0)
      : null;
  const placeValue = complete
    ? `${weights.map((weight, i) => `${weight}×${bits[i]}`).join(" + ")} = ${bus.signed ? signed : unsigned}`
    : null;

  return { bus, bits, text, unsigned, signed, weights, placeValue };
}

export function readBuses(buses: BusDef[], values: Record<string, Bit | null>): BusReading[] {
  return buses.map((bus) => readBus(bus, values));
}
