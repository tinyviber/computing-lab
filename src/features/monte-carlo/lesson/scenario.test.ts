import { describe, expect, it } from "vitest";
import { parseMonteCarloScenario, serializeMonteCarloScenario } from "./scenario";

describe("Monte Carlo scenario", () => {
  it("hydrates the first query value and falls back to medium", () => {
    expect(parseMonteCarloScenario("?scenario=large&scenario=small")).toEqual({
      scenario: "large",
    });
    expect(parseMonteCarloScenario("?scenario=unknown")).toEqual({ scenario: "medium" });
    expect(parseMonteCarloScenario({ scenario: "small" })).toEqual({ scenario: "small" });
  });

  it("serializes only non-default fixtures", () => {
    expect(serializeMonteCarloScenario({ scenario: "medium" })).toBe("");
    expect(serializeMonteCarloScenario({ scenario: "same-n-different-seed" })).toBe(
      "scenario=same-n-different-seed",
    );
  });
});
