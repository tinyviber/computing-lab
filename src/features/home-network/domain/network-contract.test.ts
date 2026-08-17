import { describe, expect, it } from "vitest";
import { createNetworkConfig, probeNetwork, type NetworkConfig, type ProbeResult } from "./model";

function run(config: NetworkConfig, target: "printer" | "internet"): ProbeResult {
  return probeNetwork(config, target, "laptop");
}

function kinds(result: ProbeResult): string[] {
  return result.events.map((event) => event.kind);
}

function reasons(result: ProbeResult): string[] {
  return result.events.map((event) => event.reasonCode);
}

describe("home network packet-path contract", () => {
  it("models local delivery without gateway/router/NAT hops", () => {
    const result = run(createNetworkConfig(), "printer");

    expect(kinds(result)).toEqual([
      "address-validation",
      "destination-classification",
      "arp-next-hop",
      "transmit-request",
      "target-response",
      "transmit-reply",
      "probe-complete",
    ]);
    expect(reasons(result)).toEqual([
      "address-valid",
      "destination-local",
      "arp-target-resolved",
      "frame-sent",
      "target-replied",
      "direct-delivery",
      "probe-complete",
    ]);
    expect(kinds(result)).not.toEqual(expect.arrayContaining(["route-lookup", "nat-request"]));
    expect(reasons(result)).not.toContain("arp-gateway-resolved");
  });

  it("models remote delivery as gateway ARP, route, NAT, WAN, and reverse NAT", () => {
    const result = run(createNetworkConfig(), "internet");

    expect(kinds(result)).toEqual([
      "address-validation",
      "destination-classification",
      "arp-next-hop",
      "transmit-request",
      "route-lookup",
      "nat-request",
      "transmit-request",
      "target-response",
      "reverse-nat",
      "transmit-reply",
      "probe-complete",
    ]);
    expect(reasons(result)).toEqual([
      "address-valid",
      "destination-remote",
      "arp-gateway-resolved",
      "frame-sent",
      "route-to-internet",
      "nat-applied",
      "wan-frame-sent",
      "target-replied",
      "reverse-nat-applied",
      "reply-delivered",
      "probe-complete",
    ]);
  });

  it("stops a wrong gateway at gateway ARP with gateway-unresolved, not preflight", () => {
    const result = run(createNetworkConfig({ laptop: { gateway: "192.168.1.254" } }), "internet");

    expect(reasons(result)).toEqual(["address-valid", "destination-remote", "gateway-unresolved"]);
    expect(result.outcome).toBe("blocked");
    expect(result.firstFailure?.reasonCode).toBe("gateway-unresolved");
    expect(kinds(result)).not.toContain("preflight");
    expect(result.events.at(-1)?.reasonCode).toBe("gateway-unresolved");
  });

  it("does not resolve a canonical gateway outside the source prefix", () => {
    const result = run(createNetworkConfig({ laptop: { prefix: "30" } }), "internet");

    expect(reasons(result)).toEqual(["address-valid", "destination-remote", "gateway-unresolved"]);
    expect(result.events.at(-1)?.kind).toBe("arp-next-hop");
    expect(result.outcome).toBe("blocked");
  });

  it("reports a malformed gateway at the ARP event with an invalid-ip reason", () => {
    const result = run(createNetworkConfig({ laptop: { gateway: "not-an-ip" } }), "internet");

    expect(reasons(result)).toEqual(["address-valid", "destination-remote", "invalid-ip"]);
    expect(result.firstFailure?.reasonCode).toBe("invalid-ip");
    expect(result.events.at(-1)?.kind).toBe("arp-next-hop");
  });

  it("stops a wrong-subnet static printer at router no-route, then reprobes locally after repair", () => {
    const wrongSubnet = createNetworkConfig({ printer: { ip: "192.168.2.30" } });
    const failed = run(wrongSubnet, "printer");

    expect(reasons(failed)).toEqual([
      "address-valid",
      "destination-remote",
      "arp-gateway-resolved",
      "frame-sent",
      "no-route",
    ]);
    expect(failed.outcome).toBe("blocked");
    expect(failed.events.at(-1)?.reasonCode).toBe("no-route");

    const repaired = run(createNetworkConfig({ printer: { ip: "192.168.1.30" } }), "printer");
    expect(reasons(repaired)).toContain("direct-delivery");
    expect(repaired.outcome).toBe("delivered");
    expect(failed).not.toEqual(repaired);
  });

  it("does not let an unrelated malformed printer block Internet route and NAT", () => {
    const result = run(createNetworkConfig({ printer: { ip: "not-an-ip" } }), "internet");

    expect(result.outcome).toBe("delivered");
    expect(reasons(result)).toEqual(
      expect.arrayContaining(["route-to-internet", "nat-applied", "reverse-nat-applied"]),
    );
  });

  it("uses deterministic probe IDs and ends every failed trace at its first stopped event", () => {
    const config = createNetworkConfig();
    const first = run(config, "internet");
    const second = run(config, "internet");
    expect(first.id).toBe(second.id);
    expect(first.id).toMatch(/^probe-[0-9a-f]{8}$/);
    expect(kinds(first)).toEqual(kinds(second));

    for (const failed of [
      run(createNetworkConfig({ laptop: { gateway: "192.168.1.254" } }), "internet"),
      run(createNetworkConfig({ printer: { ip: "192.168.2.30" } }), "printer"),
    ]) {
      expect(failed.outcome).toBe("blocked");
      expect(failed.events.at(-1)?.outcome).toBe("fail");
      expect(failed.firstFailure?.eventId).toBe(failed.events.at(-1)?.id);
    }
  });
});
