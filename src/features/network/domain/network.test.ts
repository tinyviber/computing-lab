import { describe, expect, it } from "vitest";
import {
  formatIp,
  isUsableHost,
  longestPrefixMatch,
  parseCidr,
  parseIp,
  parseMask,
  sameSubnet,
} from "./addressing.ts";
import { runCase, validateNet, validateStructure } from "./scenario.ts";
import { freshSimState, runProbe } from "./simulate.ts";
import { getNetStage, netPlan, netPrefill, netRequiredMap, netStageUnlocked } from "./stages.ts";
import { seedFor } from "./rng.ts";
import type { NetTopology } from "./topology.ts";

const UID = "u-test";
const seedOf = (stage: number) => seedFor(UID, "network-sim", stage);
const ipAt = (cidr: string, host: number) =>
  formatIp((parseIp(cidr.slice(0, cidr.indexOf("/")))! + host) >>> 0);
const subnetBase = (cidr: string) =>
  cidr.slice(0, cidr.indexOf("/")).split(".").slice(0, 3).join(".");

describe("addressing", () => {
  it("parses dotted and slash masks", () => {
    expect(parseMask("/24")).toBe(24);
    expect(parseMask("255.255.255.0")).toBe(24);
    expect(parseMask("/30")).toBe(30);
    expect(parseMask("255.255.254.0")).toBe(23);
    expect(parseMask("255.255.0.255")).toBeNull();
    expect(parseMask("/33")).toBeNull();
    expect(parseMask("1.2.3.4")).toBeNull();
  });

  it("detects same-subnet and usable hosts", () => {
    const ip = (s: string) => parseIp(s)!;
    expect(sameSubnet(ip("10.0.1.5"), 24, ip("10.0.1.9"))).toBe(true);
    expect(sameSubnet(ip("10.0.1.5"), 24, ip("10.0.2.9"))).toBe(false);
    expect(isUsableHost(ip("10.0.1.5"), 24)).toBe(true);
    expect(isUsableHost(ip("10.0.1.0"), 24)).toBe(false); // network
    expect(isUsableHost(ip("10.0.1.255"), 24)).toBe(false); // broadcast
    expect(isUsableHost(ip("10.0.1.1"), 30)).toBe(true);
  });

  it("requires host bits zeroed in CIDR and picks longest prefix", () => {
    expect(parseCidr("10.0.1.0/24")).not.toBeNull();
    expect(parseCidr("10.0.1.5/24")).toBeNull();
    const ip = (s: string) => parseIp(s)!;
    const route = (cidr: string, nextHop: string) => ({
      network: parseCidr(cidr)!.network,
      prefix: parseCidr(cidr)!.prefix,
      nextHop: ip(nextHop),
    });
    const routes = [
      route("0.0.0.0/0", "1.1.1.1"),
      route("10.0.0.0/8", "2.2.2.2"),
      route("10.0.1.0/24", "3.3.3.3"),
    ];
    expect(longestPrefixMatch(routes, ip("10.0.1.9"))?.nextHop).toBe(ip("3.3.3.3"));
    expect(longestPrefixMatch(routes, ip("10.5.1.9"))?.nextHop).toBe(ip("2.2.2.2"));
    expect(longestPrefixMatch(routes, ip("9.9.9.9"))?.nextHop).toBe(ip("1.1.1.1"));
  });
});

/** Stage-1 draft with both hosts configured inside the seeded subnet. */
function solvedStage1(): NetTopology {
  const seed = seedOf(1);
  const net = netPrefill(getNetStage(1)!, seed);
  const base = subnetBase(netPlan(seed).lanA);
  for (const node of net.nodes) {
    node.ports = node.ports.map((p) => ({
      ...p,
      ip: `${base}.${node.id === "pc1" ? 11 : 12}`,
      mask: "/24",
    }));
  }
  return net;
}

describe("simulation engine", () => {
  it("delivers a same-subnet probe directly", () => {
    const net = solvedStage1();
    const dst = ipAt(netPlan(seedOf(1)).lanA, 12);
    const probe = runProbe(net, freshSimState(net), "pc1", dst);
    expect(probe.request.delivered).toBe(true);
    expect(probe.request.path.map(String)).toEqual(["PC1", "PC2"]);
    expect(probe.reply?.delivered).toBe(true);
  });

  it("drops at the source host when the gateway is unset", () => {
    const net = solvedStage1();
    const probe = runProbe(net, freshSimState(net), "pc1", "203.0.113.9");
    expect(probe.request.delivered).toBe(false);
    expect(probe.request.reason).toBe("no-gateway");
    expect(probe.request.droppedAtId).toBe("pc1");
  });

  it("floods first and unicasts once the MAC table learns", () => {
    const seed = seedOf(2);
    const net = netPrefill(getNetStage(2)!, seed);
    const dst = ipAt(netPlan(seed).lanA, 13);
    const macs = freshSimState(net);
    const first = runProbe(net, macs, "pc1", dst);
    expect(first.request.flooded).toBe(true);
    const again = runProbe(net, macs, "pc1", dst);
    expect(again.request.flooded).toBe(false);
    expect(again.request.delivered).toBe(true);
  });

  it("crosses a router both ways when the gateway is set", () => {
    const seed = seedOf(3);
    const plan = netPlan(seed);
    const net = netPrefill(getNetStage(3)!, seed);
    for (const node of net.nodes) {
      if (node.kind !== "host") continue;
      node.gateway = node.id === "pc3" ? ipAt(plan.lanC, 1) : ipAt(plan.lanA, 1);
    }
    const probe = runProbe(net, freshSimState(net), "pc1", ipAt(plan.lanC, 11));
    expect(probe.request.delivered).toBe(true);
    expect(probe.request.path.map(String)).toEqual(["PC1", "SW1", "R1", "SW2", "PC3"]);
    expect(probe.reply?.delivered).toBe(true);
    const again = runProbe(net, freshSimState(net), "pc3", ipAt(plan.lanA, 11));
    expect(again.reply?.path.map(String)).toEqual(["PC1", "SW1", "R1", "SW2", "PC3"]);
  });

  it("spins on a routing loop until TTL expires", () => {
    const seed = seedOf(5);
    const net = netPrefill(getNetStage(5)!, seed); // prefill ships the loop
    const probe = runProbe(net, freshSimState(net), "pc1", ipAt(netPlan(seed).bogus, 9));
    expect(probe.request.delivered).toBe(false);
    expect(probe.request.reason).toBe("ttl-exceeded");
  });

  it("stage gating is sequential and X1 waits for all four cores", () => {
    expect(netStageUnlocked(getNetStage(1)!, [])).toBe(true);
    expect(netStageUnlocked(getNetStage(2)!, [])).toBe(false);
    expect(netStageUnlocked(getNetStage(2)!, [1])).toBe(true);
    expect(netStageUnlocked(getNetStage(5)!, [1, 2, 3])).toBe(false);
    expect(netStageUnlocked(getNetStage(5)!, [1, 2, 3, 4])).toBe(true);
  });
});

describe("stage contracts", () => {
  it("rejects a forged node in the draft", () => {
    const draft = solvedStage1();
    draft.nodes.push({
      id: "evil",
      label: "EVIL",
      kind: "host",
      x: 5,
      y: 5,
      ports: [{ id: "eth0", ip: "1.2.3.4", mask: "/24" }],
    });
    expect(validateStructure(draft, netPrefill(getNetStage(1)!, seedOf(1)))).not.toBeNull();
  });

  it("rejects duplicate IPs on linked interfaces", () => {
    const net = solvedStage1();
    const dup = net.nodes[1].ports[0].ip!;
    net.nodes[0].ports[0].ip = dup;
    const issues = validateNet(net, netRequiredMap(getNetStage(1)!, seedOf(1)));
    expect(issues.map((i) => i.message).join(" ")).toContain("冲突");
  });

  it("enforces the required subnet per port", () => {
    const net = solvedStage1();
    net.nodes[0].ports[0].ip = "9.9.9.9";
    const issues = validateNet(net, netRequiredMap(getNetStage(1)!, seedOf(1)));
    expect(issues.length).toBeGreaterThan(0);
  });

  it("rejects a route whose next hop is off-link", () => {
    const seed = seedOf(4);
    const net = netPrefill(getNetStage(4)!, seed);
    const r2 = net.nodes.find((n) => n.id === "r2")!;
    r2.routes = [{ prefix: netPlan(seed).lanA, nextHop: "8.8.8.8" }];
    const issues = validateNet(net, netRequiredMap(getNetStage(4)!, seed));
    expect(issues.map((i) => i.message).join(" ")).toContain("下一跳");
  });

  it("runs every public case green on a solved stage", () => {
    // Regression net: every stage's intended solution must pass its own
    // hidden set shape-wise (public cases share the same machinery).
    const seed = seedOf(1);
    const net = solvedStage1();
    const dst = ipAt(netPlan(seed).lanA, 12);
    const result = runCase(net, {
      name: "same-subnet",
      category: "t",
      probes: [
        {
          src: "pc1",
          dst,
          expect: { kind: "path", path: ["PC1", "PC2"], replyPath: ["PC2", "PC1"] },
        },
      ],
    });
    expect(result.passed).toBe(true);
  });
});
