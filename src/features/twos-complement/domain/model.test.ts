import { describe, expect, it } from "vitest";
import {
  addBitPatterns,
  bitWeights,
  deriveIntegerModel,
  interpretSigned,
  interpretUnsigned,
  negateBitPattern,
  normalizeBitPattern,
  resizeBitPattern,
} from "./model";

function unsignedOracle(pattern: string): number {
  return [...pattern].reduce((total, bit) => total * 2 + Number(bit), 0);
}

function signedOracle(pattern: string): number {
  const unsigned = unsignedOracle(pattern);
  return pattern[0] === "1" ? unsigned - 2 ** pattern.length : unsigned;
}

describe("two's-complement domain model", () => {
  it("reads canonical 4-bit unsigned and signed words", () => {
    expect(interpretUnsigned("0000")).toBe(0);
    expect(interpretUnsigned("1111")).toBe(15);
    expect(interpretSigned("0111")).toBe(7);
    expect(interpretSigned("1000")).toBe(-8);
    expect(interpretSigned("1111")).toBe(-1);
    expect(bitWeights(4, "signed")).toEqual([-8, 4, 2, 1]);
    expect(bitWeights(4, "unsigned")).toEqual([8, 4, 2, 1]);
  });

  it("negates a finite word by inversion plus one", () => {
    expect(negateBitPattern("0001")).toBe("1111");
    expect(negateBitPattern("0010")).toBe("1110");
  });

  it("keeps normal ripple addition in the stored low word", () => {
    const addition = addBitPatterns("0011", "0010");
    expect(addition.result).toBe("0101");
    expect(addition.carryOut).toBe(0);
    expect(addition.columns).toEqual([
      { bitPosition: 3, carryIn: 0, left: 0, right: 0, result: 0, carryOut: 0 },
      { bitPosition: 2, carryIn: 1, left: 0, right: 0, result: 1, carryOut: 0 },
      { bitPosition: 1, carryIn: 0, left: 1, right: 1, result: 0, carryOut: 1 },
      { bitPosition: 0, carryIn: 0, left: 1, right: 0, result: 1, carryOut: 0 },
    ]);
  });

  it("keeps carry-out and signed overflow as distinct evidence", () => {
    const signedBoundary = deriveIntegerModel({ width: 4, left: "0111", right: "0001" });
    expect(signedBoundary).toMatchObject({
      result: "1000",
      carryOut: 0,
      carryIntoSign: 1,
      signCarriesDiffer: true,
      unsigned: { overflow: false },
      signed: { overflow: true, mathematicalSum: 8, result: -8 },
    });

    const carryOnly = deriveIntegerModel({ width: 4, left: "1111", right: "0001" });
    expect(carryOnly).toMatchObject({
      result: "0000",
      carryOut: 1,
      carryIntoSign: 1,
      signCarriesDiffer: false,
      unsigned: { overflow: true },
      signed: { overflow: false },
    });

    const negativeOverflow = deriveIntegerModel({ width: 4, left: "1000", right: "1111" });
    expect(negativeOverflow).toMatchObject({
      result: "0111",
      carryOut: 1,
      carryIntoSign: 0,
      signCarriesDiffer: true,
      signed: { overflow: true },
    });
  });

  it("preserves each guided overflow contract at both supported widths", () => {
    const contracts = [
      {
        width: 4 as const,
        left: "0111",
        right: "0001",
        result: "1000",
        carryOut: 0,
        carryIntoSign: 1,
        signCarriesDiffer: true,
        signedOverflow: true,
        unsignedOverflow: false,
      },
      {
        width: 4 as const,
        left: "1111",
        right: "0001",
        result: "0000",
        carryOut: 1,
        carryIntoSign: 1,
        signCarriesDiffer: false,
        signedOverflow: false,
        unsignedOverflow: true,
      },
      {
        width: 4 as const,
        left: "1000",
        right: "1111",
        result: "0111",
        carryOut: 1,
        carryIntoSign: 0,
        signCarriesDiffer: true,
        signedOverflow: true,
        unsignedOverflow: true,
      },
      {
        width: 8 as const,
        left: "01111111",
        right: "00000001",
        result: "10000000",
        carryOut: 0,
        carryIntoSign: 1,
        signCarriesDiffer: true,
        signedOverflow: true,
        unsignedOverflow: false,
      },
      {
        width: 8 as const,
        left: "11111111",
        right: "00000001",
        result: "00000000",
        carryOut: 1,
        carryIntoSign: 1,
        signCarriesDiffer: false,
        signedOverflow: false,
        unsignedOverflow: true,
      },
      {
        width: 8 as const,
        left: "10000000",
        right: "11111111",
        result: "01111111",
        carryOut: 1,
        carryIntoSign: 0,
        signCarriesDiffer: true,
        signedOverflow: true,
        unsignedOverflow: true,
      },
    ] as const;

    for (const contract of contracts) {
      const model = deriveIntegerModel({
        width: contract.width,
        left: contract.left,
        right: contract.right,
      });

      expect(model).toMatchObject({
        result: contract.result,
        carryOut: contract.carryOut,
        carryIntoSign: contract.carryIntoSign,
        signCarriesDiffer: contract.signCarriesDiffer,
        signed: { overflow: contract.signedOverflow },
        unsigned: { overflow: contract.unsignedOverflow },
      });
    }
  });

  it("supports both finite widths without host-integer word expansion", () => {
    const eightBit = deriveIntegerModel({ width: 8, left: "01111111", right: "00000001" });
    expect(eightBit).toMatchObject({
      result: "10000000",
      carryOut: 0,
      signed: { result: -128, overflow: true, range: [-128, 127] },
      unsigned: { result: 128, range: [0, 255] },
    });
    expect(resizeBitPattern("1000", 8, "signed")).toBe("11111000");
    expect(resizeBitPattern("1000", 8, "unsigned")).toBe("00001000");
    expect(resizeBitPattern("11111000", 4, "signed")).toBe("1000");
    expect(normalizeBitPattern("10000", 4, "0111")).toBe("0111");
  });

  it("matches an independent positional oracle for every ordered 4-bit addition", () => {
    for (let leftValue = 0; leftValue < 16; leftValue += 1) {
      for (let rightValue = 0; rightValue < 16; rightValue += 1) {
        const left = leftValue.toString(2).padStart(4, "0");
        const right = rightValue.toString(2).padStart(4, "0");
        const model = deriveIntegerModel({ width: 4, left, right });
        const mathematicalUnsigned = unsignedOracle(left) + unsignedOracle(right);
        const lowWord = (mathematicalUnsigned % 16).toString(2).padStart(4, "0");
        const expectedCarry = mathematicalUnsigned >= 16 ? 1 : 0;
        const expectedSignedResult = signedOracle(lowWord);
        const expectedSignedOverflow = left[0] === right[0] && lowWord[0] !== left[0];

        expect(model.result, `${left} + ${right}: stored low word`).toBe(lowWord);
        expect(model.carryOut, `${left} + ${right}: carry-out`).toBe(expectedCarry);
        expect(model.signed.result, `${left} + ${right}: signed result`).toBe(expectedSignedResult);
        expect(model.signed.overflow, `${left} + ${right}: same-sign sign flip`).toBe(
          expectedSignedOverflow,
        );
        expect(model.signed.overflow, `${left} + ${right}: ripple carry equivalence`).toBe(
          model.carryIntoSign !== model.carryOut,
        );
      }
    }
  });
});
