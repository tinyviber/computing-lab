import { describe, expect, it } from "vitest";
import {
  divisionResult,
  fractionResult,
  multiplyByTwoSteps,
  positionalTerms,
  positionalTotal,
  shortDivisionSteps,
} from "./model";

describe("number conversion domain", () => {
  it("converts an integer with short division and reads remainders upward", () => {
    const steps = shortDivisionSteps(13);
    expect(steps).toEqual([
      { dividend: 13, quotient: 6, remainder: 1 },
      { dividend: 6, quotient: 3, remainder: 0 },
      { dividend: 3, quotient: 1, remainder: 1 },
      { dividend: 1, quotient: 0, remainder: 1 },
    ]);
    expect(divisionResult(steps)).toBe("1101");
  });

  it("converts a fraction by multiplying by two", () => {
    const steps = multiplyByTwoSteps(0.625, 4);
    expect(steps.map(({ bit, remainder }) => [bit, remainder])).toEqual([
      [1, 0.25],
      [0, 0.5],
      [1, 0],
      [0, 0],
    ]);
    expect(fractionResult(steps)).toBe("1010");
  });

  it("adds positional weights for integer and fractional binary", () => {
    const integer = positionalTerms("1011", "integer");
    const fraction = positionalTerms("101", "fraction");
    expect(integer.map((term) => term.position)).toEqual([3, 2, 1, 0]);
    expect(positionalTotal(integer)).toBe(11);
    expect(fraction.map((term) => term.weight)).toEqual([0.5, 0.25, 0.125]);
    expect(positionalTotal(fraction)).toBe(0.625);
  });
});
