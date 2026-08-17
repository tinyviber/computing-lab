import { describe, expect, it } from "vitest";
import {
  DEFAULT_HOME_NETWORK_SCENARIO,
  parseHomeNetworkScenario,
  serializeHomeNetworkScenario,
} from "./scenario";

describe("home network scenario URL contract", () => {
  it("uses the canonical default and exposes the named presets", () => {
    const defaultScenario = parseHomeNetworkScenario("");
    expect(defaultScenario).toMatchObject({
      scenario: DEFAULT_HOME_NETWORK_SCENARIO,
      source: "laptop",
      target: "printer",
    });
    expect(defaultScenario.config.printer.ip).toBe("192.168.2.30");

    expect(parseHomeNetworkScenario("scenario=first-home-setup")).toMatchObject({
      scenario: "first-home-setup",
      target: "printer",
    });
    expect(parseHomeNetworkScenario("scenario=remote-internet")).toMatchObject({
      scenario: "remote-internet",
      target: "internet",
    });
    expect(parseHomeNetworkScenario("scenario=wrong-gateway").config.laptop.gateway).toBe(
      "192.168.1.254",
    );
  });

  it("keeps the first repeated key and lets an explicit target override a preset", () => {
    expect(
      parseHomeNetworkScenario(
        "scenario=static-printer&scenario=wrong-gateway&target=internet&target=printer",
      ),
    ).toMatchObject({ scenario: "static-printer", target: "internet" });
  });

  it("falls back to laptop for an invalid source and ignores unknown runtime keys", () => {
    const result = parseHomeNetworkScenario(
      "source=not-a-device&source=laptop&history=probe-1&cursor=3&prediction=remote&probeId=probe-1&config.gateway=10.0.0.1",
    );

    expect(result.source).toBe("laptop");
    expect(result).not.toHaveProperty("history");
    expect(result).not.toHaveProperty("cursor");
    expect(result).not.toHaveProperty("prediction");
    expect(result).not.toHaveProperty("probeId");
  });

  it("serializes only canonical scenario and target keys", () => {
    expect(
      serializeHomeNetworkScenario({
        scenario: "static-printer",
        target: "printer",
        source: "laptop",
        config: { gateway: "10.0.0.1" },
        history: [{ id: "probe-1" }],
        cursor: 1,
        prediction: "local",
      } as never),
    ).toBe("");

    const encoded = serializeHomeNetworkScenario({
      scenario: "remote-internet",
      target: "printer",
      source: "laptop",
      config: { gateway: "10.0.0.1" },
      history: [{ id: "probe-1" }],
      cursor: 1,
      prediction: "remote",
    } as never);
    expect(encoded).toBe("scenario=remote-internet&target=printer");
    expect(encoded).not.toMatch(/source|gateway|config|history|cursor|prediction|probe/i);

    expect(
      serializeHomeNetworkScenario({
        scenario: "first-home-setup",
        target: "not-a-target" as never,
      }),
    ).toBe("scenario=first-home-setup");
  });
});
