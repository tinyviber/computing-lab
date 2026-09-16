import { describe, expect, it } from "vitest";
import { CALCULATOR_STAGES, getStage } from "./stages";

describe("calculator stage pin order", () => {
  it("places numbered pins from low bit to high bit on the canvas", () => {
    expect(getStage(3)?.inputs).toEqual(["A0", "A1", "A2", "A3", "B0", "B1", "B2", "B3"]);
    expect(getStage(3)?.outputs).toEqual(["S0", "S1", "S2", "S3", "Cout"]);
    expect(getStage(6)?.outputs).toEqual(["P0", "P1", "P2", "P3", "P4", "P5", "P6", "P7"]);
    expect(getStage(7)?.inputs.slice(-2)).toEqual(["Op0", "Op1"]);
  });

  it("keeps numeric readout buses in high-bit-first order", () => {
    const add4 = getStage(3)!;
    expect(add4.buses[0].pins).toEqual(["A3", "A2", "A1", "A0"]);
    expect(add4.buses[2].pins).toEqual(["Cout", "S3", "S2", "S1", "S0"]);

    for (const stage of CALCULATOR_STAGES.filter((candidate) => candidate.index >= 4)) {
      const operandBus = stage.buses.find((bus) => bus.name === "A");
      expect(operandBus?.pins).toEqual(["A3", "A2", "A1", "A0"]);
    }
  });

  it("states the fixed-width positive-input contract for negation", () => {
    expect(getStage(4)?.description).toContain("4 位无符号正数");
    expect(getStage(4)?.description).toContain("1≤A≤15");
    expect(getStage(4)?.description).toContain("最高位之外的进位不保留");
  });
});
