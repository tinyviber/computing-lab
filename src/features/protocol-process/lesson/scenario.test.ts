import { describe, expect, it } from "vitest";
import { parseProtocolScenario, serializeProtocolScenario } from "./scenario";

describe("protocol scenario", () => {
  it("hydrates the first query value and falls back to acknowledgment loss", () => {
    expect(parseProtocolScenario("?scenario=no-loss&scenario=request-loss")).toEqual({
      scenario: "no-loss",
    });
    expect(parseProtocolScenario("?scenario=unknown")).toEqual({ scenario: "ack-loss" });
    expect(parseProtocolScenario({ scenario: "request-loss" })).toEqual({
      scenario: "request-loss",
    });
  });

  it("serializes only non-default scenarios", () => {
    expect(serializeProtocolScenario({ scenario: "ack-loss" })).toBe("");
    expect(serializeProtocolScenario({ scenario: "request-loss" })).toBe("scenario=request-loss");
  });
});
