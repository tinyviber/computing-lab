import { describe, expect, it } from "vitest";
import { getNetworkScenario, validateGateway } from "./model";

describe("home network domain", () => {
  it("accepts router gateway and rejects unreachable values", () => {
    expect(validateGateway("192.168.1.1")).toBe(true);
    expect(validateGateway("192.168.1.254")).toBe(false);
  });

  it("reads shareable scenario from URL search", () => {
    expect(getNetworkScenario("?scenario=wrong-gateway")).toBe("wrong-gateway");
    expect(getNetworkScenario("")).toBeNull();
  });

  it("keeps gateway validation deterministic for the canonical /24 fixture", () => {
    expect(validateGateway("192.168.1.1")).toBe(true);
    expect(validateGateway("192.168.1.254")).toBe(false);
    expect(validateGateway("10.0.0.1")).toBe(false);
    expect(validateGateway("192.168.1.999")).toBe(false);
  });
});
