export type ConversionPart = "integer" | "fraction";

export type DivisionStep = {
  dividend: number;
  quotient: number;
  remainder: number;
};

export type MultiplyStep = {
  fraction: number;
  product: number;
  bit: 0 | 1;
  remainder: number;
};

export type PositionalTerm = {
  bit: 0 | 1;
  position: number;
  weight: number;
  contribution: number;
};

export function normalizeInteger(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(255, Math.max(0, Math.trunc(number)));
}

export function normalizeFraction(value: unknown): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(0.999999, Math.max(0, number));
}

export function normalizeBinary(value: unknown, part: ConversionPart): string {
  const text = String(value ?? "").replace(/[^01]/g, "");
  if (text) return text.slice(0, part === "integer" ? 8 : 8);
  return part === "integer" ? "1011" : "101";
}

export function shortDivisionSteps(value: number): DivisionStep[] {
  let dividend = normalizeInteger(value);
  if (dividend === 0) return [{ dividend: 0, quotient: 0, remainder: 0 }];

  const steps: DivisionStep[] = [];
  while (dividend > 0) {
    const quotient = Math.floor(dividend / 2);
    steps.push({ dividend, quotient, remainder: dividend % 2 });
    dividend = quotient;
  }
  return steps;
}

export function divisionResult(steps: DivisionStep[]): string {
  return steps
    .map((step) => step.remainder)
    .reverse()
    .join("");
}

export function multiplyByTwoSteps(value: number, precision = 8): MultiplyStep[] {
  let fraction = normalizeFraction(value);
  return Array.from({ length: precision }, () => {
    const product = fraction * 2;
    const bit: 0 | 1 = product >= 1 ? 1 : 0;
    const remainder = product - bit;
    const step = { fraction, product, bit, remainder };
    fraction = remainder;
    return step;
  });
}

export function fractionResult(steps: MultiplyStep[]): string {
  return steps.map((step) => step.bit).join("");
}

export function positionalTerms(pattern: string, part: ConversionPart): PositionalTerm[] {
  const bits = normalizeBinary(pattern, part);
  return [...bits].map((char, index) => {
    const bit: 0 | 1 = char === "1" ? 1 : 0;
    const position = part === "integer" ? bits.length - index - 1 : -(index + 1);
    const weight = 2 ** position;
    return { bit, position, weight, contribution: bit * weight };
  });
}

export function positionalTotal(terms: PositionalTerm[]): number {
  return terms.reduce((total, term) => total + term.contribution, 0);
}
