import { describe, expect, it } from "vitest";
import { parseUtf8Scenario, serializeUtf8Scenario } from "./scenario";

describe("UTF-8 scenario", () => {
  it("hydrates the first query value and falls back to mixed", () => {
    expect(parseUtf8Scenario("?scenario=emoji&scenario=ascii")).toEqual({ scenario: "emoji" });
    expect(parseUtf8Scenario("?scenario=unknown")).toEqual({ scenario: "mixed" });
    expect(parseUtf8Scenario({ scenario: "cjk" })).toEqual({ scenario: "cjk" });
  });

  it("ignores transient lesson state while preserving first-value URL semantics", () => {
    expect(parseUtf8Scenario("scenario=ascii&scenario=emoji&frame=3&prediction=4-byte")).toEqual({
      scenario: "ascii",
    });
    expect(
      serializeUtf8Scenario({
        scenario: "ascii",
        frames: [{ index: 0 }],
        selectedFrameIndex: 0,
        predictionBranch: "1-byte",
        predictionBytes: 1,
      } as never),
    ).toBe("scenario=ascii");
  });

  it("serializes only non-default fixtures", () => {
    expect(serializeUtf8Scenario({ scenario: "mixed" })).toBe("");
    expect(serializeUtf8Scenario({ scenario: "emoji" })).toBe("scenario=emoji");
  });
});
