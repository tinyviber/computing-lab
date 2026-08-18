import { describe, expect, it } from "vitest";
import { parseByteEditScenario, serializeByteEditScenario } from "./scenario";

describe("Byte Edit scenario", () => {
  it("hydrates the first query value and falls back to mixed", () => {
    expect(parseByteEditScenario("?scenario=emoji&scenario=ascii")).toEqual({
      scenario: "emoji",
    });
    expect(parseByteEditScenario("?scenario=unknown")).toEqual({ scenario: "mixed" });
    expect(parseByteEditScenario({ scenario: "accent" })).toEqual({ scenario: "accent" });
  });

  it("serializes only non-default fixtures", () => {
    expect(serializeByteEditScenario({ scenario: "mixed" })).toBe("");
    expect(serializeByteEditScenario({ scenario: "cjk" })).toBe("scenario=cjk");
  });
});
