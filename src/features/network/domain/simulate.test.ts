/**
 * Domain tests for the network packet simulator: addressing helpers,
 * per-kind forwarding semantics, the bounds (TTL, flood copies, event
 * budget, MAC table), the judge's assertion families, and the stage
 * sweep — every reference topology must pass every public + hidden case
 * of its stage under two seeds.
 */

import { describe, expect, it } from "vitest";
import {
  formatIpv4,
  isHostAddress,
  macFor,
  networkOf,
  parseIpv4,
  parsePrefix,
  sameSubnet,
} from "./addressing.ts";
import {
  enforceStageContract,
  findContractIssues,
  sanitizeTopology,
  type NetNode,
  type NetTopology,
} from "./model.ts";
import { netReferenceFor } from "./fixtures.ts";
import { planFor } from "./plan.ts";
import { judgeNetCase, type NetCase } from "./scenario.ts";
import { simulate } from "./simulate.ts";
import { NET_STAGES } from "./stages.ts";
import { publicNetCases } from "../lesson/publicCases.ts";
import { hiddenNetCases } from "../../../../server/judge/network/hiddenSet.ts";

const host = (id: string, ip = "10.0.1.11", prefix = 24, gateway?: string): NetNode => ({
  id,
  kind: "host",
  label: id,
  x: 0,
  y: 0,
  fixed: true,
  addresses: { eth0: { ip, prefix } },
  gateway,
  routes: [],
});
const sw = (id: string): NetNode => ({
  id,
  kind: "switch",
  label: id,
  x: 1,
  y: 0,
  fixed: true,
  addresses: {},
  routes: [],
});
const rtr = (
  id: string,
  addresses: Record<string, { ip: string; prefix: number }>,
  routes: { dest: string; prefix: number; nextHop: string }[] = [],
): NetNode => ({
  id,
  kind: "router",
  label: id,
  x: 2,
  y: 0,
  fixed: true,
  addresses,
  routes,
});
const link = (aNode: string, aIface: string, bNode: string, bIface: string) => ({
  a: { node: aNode, iface: aIface },
  b: { node: bNode, iface: bIface },
});
const topo = (nodes: NetNode[], links: NetTopology["links"]): NetTopology => ({ nodes, links });

describe("addressing", () => {
  it("parses dotted quads and rejects junk", () => {
    expect(parseIpv4("10.0.0.1")).toBe(0x0a000001);
    expect(parseIpv4("256.1.1.1")).toBeNull();
    expect(parseIpv4("10.0.0")).toBeNull();
    expect(parseIpv4("10.0.0.x")).toBeNull();
    expect(formatIpv4(0x0a000001)).toBe("10.0.0.1");
  });

  it("parses prefix lengths and dotted masks; rejects non-contiguous", () => {
    expect(parsePrefix("24")).toBe(24);
    expect(parsePrefix("/30")).toBe(30);
    expect(parsePrefix(16)).toBe(16);
    expect(parsePrefix("255.255.255.0")).toBe(24);
    expect(parsePrefix("255.255.0.255")).toBeNull();
    expect(parsePrefix("33")).toBeNull();
  });

  it("subnet math and host-usable checks", () => {
    expect(networkOf(parseIpv4("10.0.1.55")!, 24)).toBe(parseIpv4("10.0.1.0")!);
    expect(sameSubnet(parseIpv4("10.0.1.55")!, parseIpv4("10.0.1.99")!, 24)).toBe(true);
    expect(sameSubnet(parseIpv4("10.0.2.55")!, parseIpv4("10.0.1.99")!, 24)).toBe(false);
    expect(isHostAddress(parseIpv4("10.0.1.0")!, 24)).toBe(false);
    expect(isHostAddress(parseIpv4("10.0.1.255")!, 24)).toBe(false);
    expect(isHostAddress(parseIpv4("10.0.1.1")!, 24)).toBe(true);
  });
});

describe("sanitizeTopology", () => {
  it("drops bad links, caps nodes/links, keeps one wire per interface", () => {
    const t = sanitizeTopology(
      topo(
        [host("a"), host("b"), host("c"), sw("s")],
        [
          link("a", "eth0", "s", "p1"),
          link("a", "eth0", "s", "p2"), // re-wired: replaces the first
          link("a", "bogus", "s", "p3"),
          link("ghost", "eth0", "s", "p4"),
          link("a", "eth0", "a", "eth0"),
        ],
      ),
    );
    expect(t.links).toEqual([link("a", "eth0", "s", "p2")]);
  });

  it("normalizes addresses and routes; drops malformed rows", () => {
    const t = sanitizeTopology(
      topo(
        [
          {
            ...host("a"),
            addresses: { eth0: { ip: "10.0.1.5", prefix: 24 }, lo0: { ip: "1.2.3.4", prefix: 32 } },
          },
          rtr("r", { eth0: { ip: "10.0.1.254", prefix: 24 } }, [
            { dest: "10.0.3.99", prefix: 24, nextHop: "10.0.1.2" },
            { dest: "bogus", prefix: 24, nextHop: "10.0.1.2" },
          ]),
        ],
        [],
      ),
    );
    expect(t.nodes[0].addresses).toEqual({ eth0: { ip: "10.0.1.5", prefix: 24 } });
    const router = t.nodes[1];
    expect(router.routes).toEqual([{ dest: "10.0.3.0", prefix: 24, nextHop: "10.0.1.2" }]);
  });
});

describe("host decisions", () => {
  const pair = () =>
    topo([host("a", "10.0.1.11"), host("b", "10.0.1.12")], [link("a", "eth0", "b", "eth0")]);

  it("same-subnet destination is delivered directly", () => {
    const run = simulate(pair(), "a", "10.0.1.12");
    expect(run.outcome).toEqual({ kind: "delivered", at: 1, path: ["a", "b"] });
    expect(run.trace[0].action).toBe("send");
  });

  it("foreign destination with no gateway dies at the source", () => {
    const run = simulate(pair(), "a", "203.0.113.5");
    expect(run.outcome).toMatchObject({ kind: "dropped", node: "a", reason: "no-gateway" });
  });

  it("unclaimed same-subnet IP dies as no-such-host", () => {
    const run = simulate(pair(), "a", "10.0.1.99");
    expect(run.outcome).toMatchObject({ kind: "dropped", node: "a", reason: "no-such-host" });
  });

  it("unwired source dies as no-link", () => {
    const run = simulate(
      topo([host("a", "10.0.1.11"), host("b", "10.0.1.12")], []),
      "a",
      "10.0.1.12",
    );
    expect(run.outcome).toMatchObject({ kind: "dropped", node: "a", reason: "no-link" });
  });

  it("off-subnet gateway is rejected as gateway-offlink", () => {
    const t = topo(
      [host("a", "10.0.1.11", 24, "10.0.9.1"), host("b", "10.0.1.12")],
      [link("a", "eth0", "b", "eth0")],
    );
    const run = simulate(t, "a", "10.0.9.9");
    expect(run.outcome).toMatchObject({ kind: "dropped", reason: "gateway-offlink" });
  });
});

describe("switch behaviour", () => {
  const star = () =>
    topo(
      [host("a", "10.0.1.11"), host("b", "10.0.1.12"), host("c", "10.0.1.13"), sw("s")],
      [link("a", "eth0", "s", "p1"), link("b", "eth0", "s", "p2"), link("c", "eth0", "s", "p3")],
    );

  it("unknown destination floods all other wired ports", () => {
    const run = simulate(star(), "a", "10.0.1.13");
    // send(0) → s floods at 1 → b absorbs at 2 → c delivers at 3
    expect(run.outcome).toEqual({ kind: "delivered", at: 3, path: ["a", "s", "c"] });
    const flood = run.trace.find((r) => r.node === "s");
    expect(flood?.action).toBe("flood");
    expect(flood?.outs).toHaveLength(2);
    // the stray copy at b is absorbed, not a fault
    expect(run.drops.some((d) => d.node === "b" && d.reason === "absorbed")).toBe(true);
  });

  it("learned dst MAC turns the next send into unicast", () => {
    const first = simulate(star(), "c", "10.0.1.11");
    expect(first.macTables.s[macFor("c", "eth0")]).toBe("p3");
    const second = simulate(star(), "a", "10.0.1.13", { initMacTables: first.macTables });
    expect(second.outcome).toMatchObject({ kind: "delivered", path: ["a", "s", "c"] });
    const row = second.trace.find((r) => r.node === "s");
    expect(row?.action).toBe("forward");
    expect(row?.outs).toHaveLength(1);
    expect(second.macTables.s[macFor("a", "eth0")]).toBe("p1");
  });

  it("a copy re-entering a switch dies as broadcast-storm", () => {
    const ring = topo(
      [host("a", "10.0.1.11"), host("b", "10.0.1.12"), sw("s1"), sw("s2")],
      [
        link("a", "eth0", "s1", "p1"),
        link("b", "eth0", "s2", "p1"),
        link("s1", "p2", "s2", "p2"),
        link("s1", "p3", "s2", "p3"), // parallel links — a real L2 loop
      ],
    );
    const run = simulate(ring, "a", "10.0.1.12");
    expect(run.outcome).toMatchObject({ kind: "delivered", path: ["a", "s1", "s2", "b"] });
    // the second copy bounced back across the other link and died
    expect(run.drops.some((d) => d.reason === "broadcast-storm")).toBe(true);
  });
});

describe("router decisions", () => {
  // LAN-A 10.0.1.0/24 -- R1 -- transit 10.0.254.0/30 -- R2 -- LAN-C 10.0.3.0/24
  const twoRouters = (r2Routes = [{ dest: "10.0.1.0", prefix: 24, nextHop: "10.0.254.1" }]) =>
    topo(
      [
        host("a", "10.0.1.11", 24, "10.0.1.254"),
        rtr(
          "r1",
          {
            eth0: { ip: "10.0.1.254", prefix: 24 },
            eth1: { ip: "10.0.254.1", prefix: 30 },
          },
          [
            { dest: "10.0.3.0", prefix: 24, nextHop: "10.0.254.2" },
            { dest: "0.0.0.0", prefix: 0, nextHop: "10.0.254.2" },
          ],
        ),
        rtr(
          "r2",
          {
            eth0: { ip: "10.0.254.2", prefix: 30 },
            eth1: { ip: "10.0.3.254", prefix: 24 },
          },
          r2Routes,
        ),
        host("c", "10.0.3.15", 24, "10.0.3.254"),
      ],
      [
        link("a", "eth0", "r1", "eth0"),
        link("r1", "eth1", "r2", "eth0"),
        link("r2", "eth1", "c", "eth0"),
      ],
    );

  it("connected subnet wins directly; static route forwards via next hop", () => {
    const run = simulate(twoRouters(), "a", "10.0.3.15");
    expect(run.outcome).toMatchObject({
      kind: "delivered",
      path: ["a", "r1", "r2", "c"],
    });
    const r2row = run.trace.find((r) => r.node === "r2");
    expect(r2row?.note).toContain("直连");
  });

  it("missing return route drops the reply at R2 with no-route", () => {
    const run = simulate(twoRouters([]), "c", "10.0.1.11");
    expect(run.outcome).toMatchObject({ kind: "dropped", node: "r2", reason: "no-route" });
  });

  it("mutual defaults loop until TTL dies at a router", () => {
    const looped = twoRouters([
      { dest: "10.0.1.0", prefix: 24, nextHop: "10.0.254.1" },
      { dest: "0.0.0.0", prefix: 0, nextHop: "10.0.254.1" },
    ]);
    const run = simulate(looped, "a", "198.51.100.9");
    expect(run.outcome).toMatchObject({ kind: "dropped", reason: "ttl-exceeded" });
    expect(["r1", "r2"]).toContain((run.outcome as { node: string }).node);
  });

  it("dead next-hop route is skipped for the next-best match", () => {
    // The /24 route's next hop lives in a subnet R1 isn't on, so the
    // packet falls through to the default route via R2.
    const t = twoRouters();
    const r1 = t.nodes.find((n) => n.id === "r1")!;
    r1.routes = [
      { dest: "10.0.3.0", prefix: 24, nextHop: "192.0.2.1" },
      { dest: "0.0.0.0", prefix: 0, nextHop: "10.0.254.2" },
    ];
    const run = simulate(t, "a", "10.0.3.15");
    const r1row = run.trace.find((r) => r.node === "r1");
    expect(r1row?.note).toContain("默认路由");
    expect(r1row?.outs[0]).toEqual({ node: "r2", iface: "eth0" });
    expect(run.outcome).toMatchObject({ kind: "delivered", path: ["a", "r1", "r2", "c"] });
  });

  it("destination that is the router itself is delivered", () => {
    const run = simulate(twoRouters(), "a", "10.0.254.1");
    expect(run.outcome).toMatchObject({ kind: "delivered", path: ["a", "r1"] });
  });
});

describe("bounds", () => {
  it("identical inputs produce identical traces", () => {
    const t = topo(
      [host("a"), host("b"), sw("s")],
      [link("a", "eth0", "s", "p1"), link("b", "eth0", "s", "p2")],
    );
    const a = simulate(t, "a", "10.0.1.12");
    const b = simulate(t, "a", "10.0.1.12");
    expect(a.trace).toEqual(b.trace);
    expect(a.drops).toEqual(b.drops);
    expect(a.macTables).toEqual(b.macTables);
  });

  it("event budget stops runaway processing and marks reason=budget", () => {
    // a switch loop keeps copies circulating; the event cap ends it.
    const ring = topo(
      [host("a", "10.0.1.11"), host("b", "10.0.1.12"), sw("s1"), sw("s2")],
      [
        link("a", "eth0", "s1", "p1"),
        link("b", "eth0", "s2", "p1"),
        link("s1", "p2", "s2", "p2"),
        link("s1", "p3", "s2", "p3"),
      ],
    );
    const run = simulate(ring, "a", "10.0.1.12", { maxEvents: 6 });
    expect(run.reason).toBe("budget");
    // the pop that trips the cap is counted, mirroring is-sim
    expect(run.eventsUsed).toBe(7);
  });
});

describe("findContractIssues", () => {
  it("flags duplicate IPs and wired L3 ends on different subnets", () => {
    const t = topo(
      [host("a", "10.0.1.11"), host("b", "10.0.9.12")],
      [link("a", "eth0", "b", "eth0")],
    );
    const issues = findContractIssues(t);
    expect(issues.some((i) => i.includes("同一网段"))).toBe(true);
  });

  it("flags route next-hops outside every connected subnet", () => {
    const t = topo(
      [
        rtr("r", { eth0: { ip: "10.0.1.254", prefix: 24 } }, [
          { dest: "0.0.0.0", prefix: 0, nextHop: "8.8.8.8" },
        ]),
      ],
      [],
    );
    const issues = findContractIssues(t);
    expect(issues.some((i) => i.includes("直连网段"))).toBe(true);
  });
});

describe("enforceStageContract", () => {
  it("restores closed fields from the prefill and drops foreign nodes", () => {
    const { topology: prefill } = planFor(4, 42);
    const tampered = sanitizeTopology({
      nodes: [
        ...prefill.nodes.map((n) => (n.id === "R1" ? { ...n, routes: [] } : n)),
        { ...host("evil", "10.0.1.99") },
      ],
      links: [],
    });
    const stage = NET_STAGES.find((s) => s.index === 4)!;
    const fixed = enforceStageContract(tampered, prefill, stage.editable);
    const r1 = fixed.nodes.find((n) => n.id === "R1")!;
    // routes are editable in S4 — student-cleared routes stand
    expect(r1.routes).toEqual([]);
    // but wiring is not editable in S4 — prefill links return
    expect(fixed.links).toHaveLength(prefill.links.length);
    // the smuggled node is gone
    expect(fixed.nodes.find((n) => n.id === "evil")).toBeUndefined();
  });
});

describe("judgeNetCase assertions", () => {
  const s3ref = netReferenceFor(3, 42);
  const s3plan = planFor(3, 42).plan;

  it("path assertions compare the delivered copy's node sequence", () => {
    const verdict = judgeNetCase(s3ref, {
      name: "跨段",
      category: "gateway",
      src: "PC1",
      dst: "PC3",
      expect: { events: 24, path: ["PC1", "SW1", "R1", "SW2", "PC3"] },
    });
    expect(verdict.passed).toBe(true);
    const bad = judgeNetCase(s3ref, {
      name: "错路",
      category: "gateway",
      src: "PC1",
      dst: "PC3",
      expect: { events: 24, path: ["PC1", "R1", "PC3"] },
    });
    expect(bad.passed).toBe(false);
    expect(bad.pathDiff?.actual).toEqual(["PC1", "SW1", "R1", "SW2", "PC3"]);
  });

  it("dropped assertions tolerate at/reason lists", () => {
    const verdict = judgeNetCase(s3ref, {
      name: "未知目的",
      category: "negatives",
      src: "PC1",
      dst: s3plan.ghostIp,
      expect: { events: 24, dropped: { at: ["R1", "PC1"], reason: ["no-route", "no-such-host"] } },
    });
    expect(verdict.passed).toBe(true);
  });
});

describe("stage case sets", () => {
  for (const seed of [42, 7]) {
    it(`reference topologies pass every public and hidden case (seed ${seed})`, () => {
      for (const stage of NET_STAGES) {
        const { plan } = planFor(stage.index, seed);
        const reference = netReferenceFor(stage.index, seed);
        const cases = [...publicNetCases(stage.index, plan), ...hiddenNetCases(stage.index, plan)];
        expect(cases.length, `stage ${stage.index} has no cases`).toBeGreaterThan(0);
        for (const testCase of cases) {
          const verdict = judgeNetCase(reference, testCase, stage.maxEvents);
          expect(
            verdict.passed,
            `stage ${stage.index} seed ${seed} case "${testCase.name}": ${JSON.stringify({
              pathDiff: verdict.pathDiff,
              dropDiff: verdict.dropDiff,
              macDiff: verdict.macDiff,
              floodDiff: verdict.floodDiff,
              hopDiff: verdict.hopDiff,
              outcome: verdict.outcome,
            })}`,
          ).toBe(true);
        }
      }
    });
  }
});
