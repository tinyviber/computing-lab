import { describe, expect, it } from "vitest";
import { encodeSamplingScenario, parseSamplingScenario } from "./scenario.ts";

describe("scenario URL codec", () => {
  it("parses a full scenario", () => {
    expect(parseSamplingScenario({ stage: "4", w: "16", h: "8" })).toEqual({
      stageIndex: 4,
      width: 16,
      height: 8,
    });
  });

  it("drops unknown stages and clamps resolutions", () => {
    expect(parseSamplingScenario({ stage: 99, w: 500, h: 1 })).toEqual({
      stageIndex: null,
      width: 64,
      height: 2,
    });
  });

  it("a lone w implies square", () => {
    expect(parseSamplingScenario({ w: 12 })).toEqual({
      stageIndex: null,
      width: 12,
      height: 12,
    });
  });

  it("round-trips", () => {
    const scenario = { stageIndex: 2, width: 24, height: 24 };
    expect(parseSamplingScenario(encodeSamplingScenario(scenario))).toEqual(scenario);
  });
});
