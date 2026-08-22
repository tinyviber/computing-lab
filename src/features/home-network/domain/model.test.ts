import { describe, expect, it } from "vitest";
import { createNetworkConfig, runHomeNetworkProbe, validateNetwork } from "./model";

describe("home network domain model", () => {
  it("keeps hand-authored probe facts for all six learner scenarios", () => {
    const expected = {
      "first-home-setup": { target: "printer", outcome: "delivered", firstFailure: undefined },
      "static-printer": { target: "printer", outcome: "blocked", firstFailure: "no-route" },
      "remote-internet": { target: "internet", outcome: "delivered", firstFailure: undefined },
      "wrong-gateway": {
        target: "internet",
        outcome: "blocked",
        firstFailure: "gateway-unresolved",
      },
      "duplicate-ip": {
        target: "printer",
        outcome: "blocked",
        firstFailure: "duplicate-address",
      },
      "invalid-config": { target: "printer", outcome: "blocked", firstFailure: "invalid-ip" },
    } as const;

    const scenarios = {
      "first-home-setup": createNetworkConfig(),
      "static-printer": createNetworkConfig({ printer: { ip: "192.168.2.30", prefix: "24" } }),
      "remote-internet": createNetworkConfig(),
      "wrong-gateway": createNetworkConfig({ laptop: { gateway: "192.168.1.254" } }),
      "duplicate-ip": createNetworkConfig({ printer: { ip: "192.168.1.10" } }),
      "invalid-config": createNetworkConfig({ printer: { ip: "not-an-ip" } }),
    } as const;

    for (const scenario of Object.keys(expected) as Array<keyof typeof expected>) {
      const result = runHomeNetworkProbe(
        scenarios[scenario],
        expected[scenario].target,
        "laptop",
        1,
      );

      expect(result.outcome, scenario).toBe(expected[scenario].outcome);
      expect(result.firstFailure?.reasonCode, scenario).toBe(expected[scenario].firstFailure);
    }
  });

  it("accepts the canonical fixed topology", () => {
    expect(validateNetwork(createNetworkConfig())).toEqual({ valid: true, issues: [] });
  });

  it("returns invalid-prefix for /0, /31, /32, and malformed host prefixes", () => {
    for (const prefix of ["0", "31", "32", "malformed"] as const) {
      const result = validateNetwork(
        createNetworkConfig({ printer: { prefix } as { prefix: string } }),
      );

      expect(result.valid, `/${prefix} should be rejected`).toBe(false);
      expect(result.issues, `/${prefix} should explain its rejection`).toContain("invalid-prefix");
    }
  });

  it("identifies malformed addresses instead of treating them as reachable targets", () => {
    const result = validateNetwork(createNetworkConfig({ printer: { ip: "192.168.1.30x" } }));

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("invalid-ip");
  });

  it("identifies duplicate target configuration with the duplicate-address reason", () => {
    const result = validateNetwork(createNetworkConfig({ printer: { ip: "192.168.1.10" } }));

    expect(result.valid).toBe(false);
    expect(result.issues).toContain("duplicate-address");
  });
});
