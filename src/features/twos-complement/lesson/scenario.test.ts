import { describe, expect, it } from "vitest";
import { parseTwosComplementScenario, serializeTwosComplementScenario } from "./scenario";

describe("two's-complement lesson scenario", () => {
  it("parses a canonical reproducible URL", () => {
    expect(parseTwosComplementScenario("width=4&a=0111&b=0001&reading=signed")).toEqual({
      width: 4,
      left: "0111",
      right: "0001",
      reading: "signed",
    });
  });

  it("normalizes malformed widths, words, and readings at the URL boundary", () => {
    expect(parseTwosComplementScenario("width=32&a=1111&b=bad&reading=float")).toEqual({
      width: 4,
      left: "1111",
      right: "0001",
      reading: "signed",
    });
    expect(parseTwosComplementScenario("width=8&a=0111&b=00000001&reading=unsigned")).toEqual({
      width: 8,
      left: "00000111",
      right: "00000001",
      reading: "unsigned",
    });
  });

  it("uses first duplicate values and serializes only canonical state", () => {
    const parsed = parseTwosComplementScenario(
      "width=8&width=4&a=0111&a=1111&b=0001&reading=unsigned",
    );
    expect(parsed).toEqual({
      width: 8,
      left: "00000111",
      right: "00000001",
      reading: "unsigned",
    });
    expect(serializeTwosComplementScenario(parsed)).toBe(
      "width=8&a=00000111&b=00000001&reading=unsigned",
    );
    expect(
      serializeTwosComplementScenario({
        width: 8,
        left: "11111111",
        right: "00000001",
        reading: "unsigned",
      }),
    ).toBe("width=8&a=11111111&b=00000001&reading=unsigned");
  });
});
