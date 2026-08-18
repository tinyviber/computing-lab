import { describe, expect, it } from "vitest";
import { parseRelationalScenario, serializeRelationalScenario } from "./scenario";

describe("Relational scenario", () => {
  it("hydrates the first query value and falls back to catalog", () => {
    expect(parseRelationalScenario("?scenario=catalog")).toEqual({ scenario: "catalog" });
    expect(parseRelationalScenario("?scenario=unknown")).toEqual({ scenario: "catalog" });
    expect(parseRelationalScenario({ scenario: "catalog" })).toEqual({ scenario: "catalog" });
  });

  it("serializes only non-default fixtures", () => {
    expect(serializeRelationalScenario({ scenario: "catalog" })).toBe("");
  });
});
