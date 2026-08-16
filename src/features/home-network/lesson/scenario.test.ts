import { describe, expect, it } from "vitest";
import { parseHomeNetworkScenario } from "./scenario";

describe("home network lesson scenario", () => {
  it("hydrates balanced and wrong-gateway scenarios deterministically", () => {
    expect(parseHomeNetworkScenario(new URLSearchParams())).toMatchObject({
      scenario: "balanced",
      gateway: "192.168.1.1",
    });
    expect(parseHomeNetworkScenario(new URLSearchParams("scenario=wrong-gateway"))).toMatchObject({
      scenario: "wrong-gateway",
      gateway: "192.168.1.254",
    });
    expect(parseHomeNetworkScenario(new URLSearchParams("scenario=nope"))).toMatchObject({
      scenario: "balanced",
      gateway: "192.168.1.1",
    });
  });

  it("accepts explicit first gateway value and maps wrong shortcut", () => {
    expect(
      parseHomeNetworkScenario(new URLSearchParams("gateway=192.168.1.20&gateway=10.0.0.1")),
    ).toMatchObject({ gateway: "192.168.1.20" });
    expect(parseHomeNetworkScenario(new URLSearchParams("gateway=wrong"))).toMatchObject({
      gateway: "192.168.1.254",
    });
  });
});
