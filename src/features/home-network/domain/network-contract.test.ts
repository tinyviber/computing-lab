import { describe, expect, it } from "vitest";
import {
  INTERNET_IP,
  L2_SEGMENTS,
  createNetworkConfig,
  probeNetwork,
  resolveNeighbor,
  type NetworkConfig,
  type ProbeResult,
} from "./model";

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
  it("models fixed LAN/WAN segments and resolves only actual neighbors", () => {
    const config = createNetworkConfig();

    expect(L2_SEGMENTS).toEqual([
      { id: "lan", name: "Home LAN", members: ["router", "laptop", "printer"] },
      { id: "wan", name: "WAN", members: ["router", "internet"] },
    ]);
    expect(resolveNeighbor(config, "lan", config.printer.ip)).toMatchObject({
      status: "resolved",
      deviceId: "printer",
    });
    expect(resolveNeighbor(config, "wan", INTERNET_IP)).toMatchObject({
      status: "resolved",
      deviceId: "internet",
    });
    expect(resolveNeighbor(config, "lan", INTERNET_IP)).toMatchObject({
      status: "unresolved",
      reason: "no-neighbor",
    });
    expect(resolveNeighbor(config, "lan", "192.168.2.30")).toMatchObject({
      status: "unresolved",
      reason: "no-neighbor",
    });
    expect(
      resolveNeighbor(
        createNetworkConfig({ printer: { ip: config.router.lanIp } }),
        "lan",
        config.router.lanIp,
      ),
    ).toMatchObject({
      status: "unresolved",
      reason: "duplicate-address",
    });
  });

  it("keeps host locality target-agnostic, then lets the actual LAN decide ARP", () => {
    const result = run(
      createNetworkConfig({ laptop: { ip: "203.0.113.20", prefix: "24" } }),
      "internet",
    );

    expect(reasons(result)).toEqual(["address-valid", "destination-local", "neighbor-unresolved"]);
    expect(result.events.at(-1)).toMatchObject({
      kind: "arp-next-hop",
      outcome: "fail",
      packet: {
        destinationIp: INTERNET_IP,
        nextHopIp: INTERNET_IP,
      },
    });
    expect(result.outcome).toBe("blocked");
  });

  it("models local delivery without gateway/router/NAT hops", () => {
    const result = run(createNetworkConfig(), "printer");

    expect(kinds(result)).toEqual([
      "address-validation",
      "destination-classification",
      "arp-next-hop",
      "transmit-request",
      "target-response",
      "destination-classification",
      "transmit-reply",
      "probe-complete",
    ]);
    expect(reasons(result)).toEqual([
      "address-valid",
      "destination-local",
      "arp-target-resolved",
      "frame-sent",
      "target-replied",
      "destination-local",
      "direct-delivery",
      "probe-complete",
    ]);
    expect(kinds(result)).not.toEqual(expect.arrayContaining(["route-lookup", "nat-request"]));
    expect(reasons(result)).not.toContain("arp-gateway-resolved");
  });

  it("classifies from the laptop prefix, then lets the printer independently route its reply", () => {
    const result = run(createNetworkConfig({ printer: { prefix: "30" } }), "printer");
    const classification = result.events.find(
      (event) => event.kind === "destination-classification",
    );
    const requestEvents = result.events.filter((event) => event.leg === "request");

    expect(classification).toMatchObject({
      reasonCode: "destination-local",
      packet: {
        sourceIp: "192.168.1.10",
        destinationIp: "192.168.1.30",
        nextHopIp: "192.168.1.30",
      },
    });
    expect(requestEvents.map((event) => event.kind)).not.toEqual(
      expect.arrayContaining(["route-lookup", "nat-request"]),
    );
    expect(requestEvents.map((event) => event.reasonCode)).not.toContain("arp-gateway-resolved");
    expect(result.events.at(-1)).toMatchObject({
      leg: "reply",
      kind: "arp-next-hop",
      reasonCode: "gateway-unresolved",
    });
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          leg: "reply",
          kind: "destination-classification",
          reasonCode: "destination-remote",
        }),
      ]),
    );
    expect(result.outcome).toBe("blocked");
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
      "arp-next-hop",
      "transmit-request",
      "target-response",
      "reverse-nat",
      "route-lookup",
      "arp-next-hop",
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
      "arp-target-resolved",
      "wan-frame-sent",
      "target-replied",
      "reverse-nat-applied",
      "route-to-lan",
      "arp-target-resolved",
      "reply-delivered",
      "probe-complete",
    ]);
  });

  it("routes to the Internet destination and keeps that next hop through source NAT", () => {
    const result = run(createNetworkConfig(), "internet");
    const route = result.events.find((event) => event.kind === "route-lookup");
    const nat = result.events.find((event) => event.kind === "nat-request");
    const wanTransmit = result.events.find(
      (event) => event.kind === "transmit-request" && event.hop === "Internet",
    );

    expect(createNetworkConfig().router).not.toHaveProperty("gateway");
    expect(route?.packet).toEqual({
      sourceIp: "192.168.1.10",
      destinationIp: "203.0.113.10",
      nextHopIp: "203.0.113.10",
    });
    expect(nat).toMatchObject({
      packet: {
        sourceIp: "192.168.1.10",
        destinationIp: "203.0.113.10",
        nextHopIp: "203.0.113.10",
      },
      transformedPacket: {
        sourceIp: "203.0.113.1",
        destinationIp: "203.0.113.10",
        nextHopIp: "203.0.113.10",
      },
    });
    expect(nat?.reason).toMatch(/source NAT|SNAT/i);
    expect(nat?.reason).not.toMatch(/reverse-NAT/i);
    expect(wanTransmit?.packet).toEqual(nat?.transformedPacket);

    const reverseNat = result.events.find((event) => event.kind === "reverse-nat");
    const replyRoute = result.events.find(
      (event) => event.leg === "reply" && event.kind === "route-lookup",
    );
    expect(reverseNat?.packet.nextHopIp).toBe("");
    expect(reverseNat?.transformedPacket?.nextHopIp).toBe("");
    expect(replyRoute?.packet.nextHopIp).toBe("192.168.1.10");
  });

  it("stops a wrong gateway at gateway ARP with gateway-unresolved, not preflight", () => {
    const result = run(createNetworkConfig({ laptop: { gateway: "192.168.1.254" } }), "internet");

    expect(reasons(result)).toEqual(["address-valid", "destination-remote", "gateway-unresolved"]);
    expect(result.outcome).toBe("blocked");
    expect(result.firstFailure?.reasonCode).toBe("gateway-unresolved");
    expect(kinds(result)).not.toContain("preflight");
    expect(result.events.at(-1)?.reasonCode).toBe("gateway-unresolved");
  });

  it.each([
    ["router LAN", "192.168.1.1"],
    ["laptop", "192.168.1.10"],
  ])("stops a printer duplicate with %s before destination classification", (_label, ip) => {
    const result = run(createNetworkConfig({ printer: { ip } }), "printer");

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      kind: "address-validation",
      outcome: "fail",
      reasonCode: "duplicate-address",
    });
    expect(result.events.some((event) => event.kind === "destination-classification")).toBe(false);
    expect(result.outcome).toBe("blocked");
  });

  it.each([
    ["router LAN", "192.168.1.1"],
    ["laptop", "192.168.1.10"],
  ])("stops an Internet probe when printer duplicates %s on the LAN", (_label, ip) => {
    const result = run(createNetworkConfig({ printer: { ip } }), "internet");

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      kind: "address-validation",
      outcome: "fail",
      reasonCode: "duplicate-address",
    });
    expect(result.events.some((event) => event.kind === "destination-classification")).toBe(false);
    expect(result.outcome).toBe("blocked");
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

  it("forwards a remote printer request through the router's connected LAN route", () => {
    const result = run(
      createNetworkConfig({ laptop: { prefix: "28" }, printer: { prefix: "24" } }),
      "printer",
    );

    expect(reasons(result)).toEqual([
      "address-valid",
      "destination-remote",
      "arp-gateway-resolved",
      "frame-sent",
      "route-to-lan",
      "arp-target-resolved",
      "frame-sent",
      "target-replied",
      "destination-local",
      "direct-delivery",
      "probe-complete",
    ]);
    expect(result.events.find((event) => event.reasonCode === "route-to-lan")?.packet).toEqual({
      sourceIp: "192.168.1.10",
      destinationIp: "192.168.1.30",
      nextHopIp: "192.168.1.30",
    });
    expect(result.outcome).toBe("delivered");
  });

  it("forwards a remote printer reply through the router after gateway ARP", () => {
    const result = run(
      createNetworkConfig({ printer: { ip: "192.168.1.6", prefix: "29" } }),
      "printer",
    );

    expect(reasons(result)).toEqual([
      "address-valid",
      "destination-local",
      "arp-target-resolved",
      "frame-sent",
      "target-replied",
      "destination-remote",
      "arp-gateway-resolved",
      "frame-sent",
      "route-to-lan",
      "arp-target-resolved",
      "reply-delivered",
      "probe-complete",
    ]);
    expect(result.events.find((event) => event.reasonCode === "route-to-lan")?.packet).toEqual({
      sourceIp: "192.168.1.6",
      destinationIp: "192.168.1.10",
      nextHopIp: "192.168.1.10",
    });
    expect(result.outcome).toBe("delivered");
  });

  it("does not let an unrelated malformed printer block Internet route and NAT", () => {
    const result = run(createNetworkConfig({ printer: { ip: "not-an-ip" } }), "internet");

    expect(result.outcome).toBe("delivered");
    expect(reasons(result)).toEqual(
      expect.arrayContaining(["route-to-internet", "nat-applied", "reverse-nat-applied"]),
    );
  });

  it("stops a malformed printer target before destination classification", () => {
    const result = run(createNetworkConfig({ printer: { ip: "not-an-ip" } }), "printer");

    expect(result.events).toHaveLength(1);
    expect(result.events[0]).toMatchObject({
      kind: "address-validation",
      outcome: "fail",
      reasonCode: "invalid-ip",
    });
    expect(result.events.some((event) => event.kind === "destination-classification")).toBe(false);
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
