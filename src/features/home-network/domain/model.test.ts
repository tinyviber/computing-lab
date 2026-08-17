import { describe, expect, it } from "vitest";
import { createNetworkConfig, validateNetwork } from "./model";

describe("home network domain model", () => {
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
