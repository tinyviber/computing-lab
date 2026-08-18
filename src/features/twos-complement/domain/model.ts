export type WordWidth = 4 | 8;
export type Bit = 0 | 1;
export type Reading = "signed" | "unsigned";
export type BitPattern = string;

export type AdditionColumn = {
  bitPosition: number;
  carryIn: Bit;
  left: Bit;
  right: Bit;
  result: Bit;
  carryOut: Bit;
};

export type AdditionResult = {
  result: BitPattern;
  columns: AdditionColumn[];
  carryOut: Bit;
  carryIntoSign: Bit;
};

export type IntegerModel = {
  width: WordWidth;
  left: BitPattern;
  right: BitPattern;
  result: BitPattern;
  columns: AdditionColumn[];
  carryOut: Bit;
  carryIntoSign: Bit;
  signCarriesDiffer: boolean;
  unsigned: {
    left: number;
    right: number;
    result: number;
    mathematicalSum: number;
    range: [number, number];
    inRange: boolean;
    overflow: boolean;
  };
  signed: {
    left: number;
    right: number;
    result: number;
    mathematicalSum: number;
    range: [number, number];
    inRange: boolean;
    overflow: boolean;
  };
};

export const DEFAULT_WORDS: Record<WordWidth, { left: BitPattern; right: BitPattern }> = {
  4: { left: "0111", right: "0001" },
  8: { left: "00000111", right: "00000001" },
};

export function normalizeWordWidth(value: unknown): WordWidth {
  return value === 8 || value === "8" ? 8 : 4;
}

export function isBitPattern(value: unknown, width: WordWidth): value is BitPattern {
  return typeof value === "string" && value.length === width && /^[01]+$/.test(value);
}

export function normalizeBitPattern(
  value: unknown,
  width: WordWidth,
  fallback: BitPattern,
): BitPattern {
  return isBitPattern(value, width) ? value : fallback;
}

export function bitAt(pattern: BitPattern, msbIndex: number): Bit {
  return pattern[msbIndex] === "1" ? 1 : 0;
}

export function interpretUnsigned(pattern: BitPattern): number {
  return [...pattern].reduce((value, bit) => value * 2 + (bit === "1" ? 1 : 0), 0);
}

export function interpretSigned(pattern: BitPattern): number {
  const unsigned = interpretUnsigned(pattern);
  return bitAt(pattern, 0) === 1 ? unsigned - 2 ** pattern.length : unsigned;
}

export function bitWeights(width: WordWidth, reading: Reading): number[] {
  return Array.from({ length: width }, (_, index) => {
    const exponent = width - index - 1;
    return reading === "signed" && index === 0 ? -(2 ** exponent) : 2 ** exponent;
  });
}

export function addBitPatterns(left: BitPattern, right: BitPattern): AdditionResult {
  if (left.length !== right.length || !/^[01]+$/.test(left) || !/^[01]+$/.test(right)) {
    throw new Error("Addition requires equal-width bit patterns.");
  }

  let carry: Bit = 0;
  const reversedColumns: AdditionColumn[] = [];
  const reversedResult: Bit[] = [];

  for (let index = left.length - 1; index >= 0; index -= 1) {
    const leftBit = bitAt(left, index);
    const rightBit = bitAt(right, index);
    const carryIn = carry;
    const total = leftBit + rightBit + carryIn;
    const result: Bit = total % 2 === 1 ? 1 : 0;
    carry = total >= 2 ? 1 : 0;
    reversedResult.push(result);
    reversedColumns.push({
      bitPosition: left.length - index - 1,
      carryIn,
      left: leftBit,
      right: rightBit,
      result,
      carryOut: carry,
    });
  }

  const columns = reversedColumns.reverse();
  return {
    result: reversedResult.reverse().join(""),
    columns,
    carryOut: carry,
    carryIntoSign: columns[0].carryIn,
  };
}

export function negateBitPattern(pattern: BitPattern): BitPattern {
  if (!/^[01]+$/.test(pattern)) throw new Error("Negation requires a bit pattern.");
  const inverted = [...pattern].map((bit) => (bit === "1" ? "0" : "1")).join("");
  const one = `${"0".repeat(pattern.length - 1)}1`;
  return addBitPatterns(inverted, one).result;
}

export function resizeBitPattern(
  pattern: BitPattern,
  width: WordWidth,
  reading: Reading,
): BitPattern {
  if (!/^[01]+$/.test(pattern)) throw new Error("Resize requires a bit pattern.");
  if (pattern.length === width) return pattern;
  if (pattern.length > width) return pattern.slice(-width);
  const extension = reading === "signed" && pattern[0] === "1" ? "1" : "0";
  return `${extension.repeat(width - pattern.length)}${pattern}`;
}

export function toggleBit(pattern: BitPattern, msbIndex: number): BitPattern {
  if (!Number.isInteger(msbIndex) || msbIndex < 0 || msbIndex >= pattern.length) return pattern;
  const nextBit = pattern[msbIndex] === "1" ? "0" : "1";
  return `${pattern.slice(0, msbIndex)}${nextBit}${pattern.slice(msbIndex + 1)}`;
}

export function deriveIntegerModel({
  width,
  left,
  right,
}: {
  width: WordWidth;
  left: BitPattern;
  right: BitPattern;
}): IntegerModel {
  if (!isBitPattern(left, width) || !isBitPattern(right, width)) {
    throw new Error("Model requires canonical, fixed-width operands.");
  }

  const addition = addBitPatterns(left, right);
  const unsignedLeft = interpretUnsigned(left);
  const unsignedRight = interpretUnsigned(right);
  const unsignedResult = interpretUnsigned(addition.result);
  const signedLeft = interpretSigned(left);
  const signedRight = interpretSigned(right);
  const signedResult = interpretSigned(addition.result);
  const unsignedMax = 2 ** width - 1;
  const signedMin = -(2 ** (width - 1));
  const signedMax = 2 ** (width - 1) - 1;
  const signedOverflow =
    bitAt(left, 0) === bitAt(right, 0) && bitAt(addition.result, 0) !== bitAt(left, 0);
  const signCarriesDiffer = addition.carryIntoSign !== addition.carryOut;
  const unsignedMathematicalSum = unsignedLeft + unsignedRight;
  const signedMathematicalSum = signedLeft + signedRight;

  if (signedOverflow !== signCarriesDiffer) {
    throw new Error("Ripple carry evidence disagrees with signed overflow.");
  }

  return {
    width,
    left,
    right,
    result: addition.result,
    columns: addition.columns,
    carryOut: addition.carryOut,
    carryIntoSign: addition.carryIntoSign,
    signCarriesDiffer,
    unsigned: {
      left: unsignedLeft,
      right: unsignedRight,
      result: unsignedResult,
      mathematicalSum: unsignedMathematicalSum,
      range: [0, unsignedMax],
      inRange: unsignedMathematicalSum <= unsignedMax,
      overflow: addition.carryOut === 1,
    },
    signed: {
      left: signedLeft,
      right: signedRight,
      result: signedResult,
      mathematicalSum: signedMathematicalSum,
      range: [signedMin, signedMax],
      inRange: signedMathematicalSum >= signedMin && signedMathematicalSum <= signedMax,
      overflow: signedOverflow,
    },
  };
}
