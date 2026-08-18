import { describe, expect, it } from "vitest";
import { parseUtf8Scenario, serializeUtf8Scenario } from "./scenario";

describe("UTF-8 scenario", () => {
  it("hydrates the first query value and falls back to mixed", () => {
    expect(parseUtf8Scenario("?scenario=emoji&scenario=ascii")).toEqual({ scenario: "emoji" });
    expect(parseUtf8Scenario("?scenario=unknown")).toEqual({ scenario: "mixed" });
    expect(parseUtf8Scenario({ scenario: "cjk" })).toEqual({ scenario: "cjk" });
  });

  it("serializes only non-default fixtures", () => {
    expect(serializeUtf8Scenario({ scenario: "mixed" })).toBe("");
    expect(serializeUtf8Scenario({ scenario: "emoji" })).toBe("scenario=emoji");
  });
});
