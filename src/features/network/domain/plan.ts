/**
 * Seeded per-stage addressing plan (issue #56 must-fix #5): every
 * student's lab uses the same node ids and layout but the third octet of
 * each subnet is derived from `seedFor(userId, "network", stage)` — a
 * copied config lands in the wrong subnet for anyone else.
 *
 * `planFor` produces the stage's prefilled topology plus the named
 * addresses hidden/public cases reference. Two probe literals are part
 * of every plan:
 * - `ghostIp` — inside the lab's address family but assigned to nobody
 *   ("目标不存在" probes);
 * - `foreignIp` — RFC 5737 TEST-NET-3, outside every student subnet
 *   ("没有路由/没有网关" probes).
 */

import { formatIpv4, parseIpv4 } from "./addressing.ts";
import type { NetAddress, NetLink, NetNode, NetRoute, NetTopology } from "./model.ts";
import { makeRng } from "./rng.ts";

export type NetPlan = {
  /** Seeded third octet shared by this stage's 10.x subnets. */
  octet: number;
  lanA: { ip: string; prefix: number };
  lanB: { ip: string; prefix: number };
  lanC: { ip: string; prefix: number };
  transit: { ip: string; prefix: number };
  isp: { ip: string; prefix: number };
  pc1: NetAddress;
  pc2: NetAddress;
  pc3: NetAddress;
  pc5: NetAddress;
  svr: NetAddress;
  /** R1's LAN-A interface. */
  r1a: NetAddress;
  /** R1's second interface — LAN-B side in S3, transit side in S4/X5. */
  r1b: NetAddress;
  r2t: NetAddress;
  r2c: NetAddress;
  r2isp: NetAddress;
  foreignIp: string;
  ghostIp: string;
};

function planOf(seed: number): NetPlan {
  const rng = makeRng(seed);
  const octet = 1 + Math.floor(rng() * 60); // 1..60 — keeps 10.{o}.x.y readable
  const k = 17 + Math.floor(rng() * 200);
  const lan = (n: number) => ({ ip: `10.${octet}.${n}.0`, prefix: 24 });
  return {
    octet,
    lanA: lan(1),
    lanB: lan(2),
    lanC: lan(3),
    transit: { ip: `10.${octet}.254.0`, prefix: 30 },
    isp: { ip: `172.16.${octet}.0`, prefix: 24 },
    pc1: { ip: `10.${octet}.1.11`, prefix: 24 },
    pc2: { ip: `10.${octet}.1.12`, prefix: 24 },
    pc3: { ip: `10.${octet}.2.13`, prefix: 24 },
    pc5: { ip: `10.${octet}.3.15`, prefix: 24 },
    svr: { ip: `172.16.${octet}.9`, prefix: 24 },
    r1a: { ip: `10.${octet}.1.254`, prefix: 24 },
    r1b: { ip: `10.${octet}.2.254`, prefix: 24 },
    r2t: { ip: `10.${octet}.254.2`, prefix: 30 },
    r2c: { ip: `10.${octet}.3.254`, prefix: 24 },
    r2isp: { ip: `172.16.${octet}.254`, prefix: 24 },
    foreignIp: `203.0.113.${k}`,
    ghostIp: `10.${octet}.77.7`,
  };
}

const N = (
  id: string,
  kind: NetNode["kind"],
  label: string,
  x: number,
  y: number,
  extras: Partial<Pick<NetNode, "addresses" | "gateway" | "routes">> = {},
): NetNode => ({
  id,
  kind,
  label,
  x,
  y,
  fixed: true,
  addresses: extras.addresses ?? {},
  gateway: extras.gateway,
  routes: extras.routes ?? [],
});

const addr = (a: NetAddress): Record<string, NetAddress> => ({ eth0: a });

const link = (aNode: string, aIface: string, bNode: string, bIface: string): NetLink => ({
  a: { node: aNode, iface: aIface },
  b: { node: bNode, iface: bIface },
});

const route = (dest: string, prefix: number, nextHop: string): NetRoute => ({
  dest,
  prefix,
  nextHop,
});

/**
 * The stage's prefilled topology: which nodes exist, their addresses and
 * route rows, and which links arrive already wired. `broken` mutates the
 * plan for stages whose lesson is a planted misconfiguration.
 */
export function planFor(
  stageIndex: number,
  seed: number,
): { topology: NetTopology; plan: NetPlan } {
  const plan = planOf(seed);
  const tR1 = `10.${plan.octet}.254.1`; // R1's transit address (S4/X5)

  switch (stageIndex) {
    // S1 — direct link, PC2 deliberately on the wrong subnet.
    case 1:
      return {
        plan,
        topology: {
          nodes: [
            N("PC1", "host", "PC1", 0, 1, { addresses: addr(plan.pc1) }),
            N("PC2", "host", "PC2", 3, 1, {
              addresses: { eth0: { ip: `10.${plan.octet}.9.12`, prefix: 24 } },
            }),
          ],
          links: [link("PC1", "eth0", "PC2", "eth0")],
        },
      };

    // S2 — three hosts, one switch, addresses preset, no wires.
    case 2:
      return {
        plan,
        topology: {
          nodes: [
            N("PC1", "host", "PC1", 0, 0, {
              addresses: addr({ ip: `10.${plan.octet}.2.11`, prefix: 24 }),
            }),
            N("PC2", "host", "PC2", 0, 1, {
              addresses: addr({ ip: `10.${plan.octet}.2.12`, prefix: 24 }),
            }),
            N("PC3", "host", "PC3", 0, 2, {
              addresses: addr({ ip: `10.${plan.octet}.2.13`, prefix: 24 }),
            }),
            N("SW1", "switch", "SW1", 3, 1),
          ],
          links: [],
        },
      };

    // S3 — two subnets through one router; gateways left blank.
    case 3:
      return {
        plan,
        topology: {
          nodes: [
            N("PC1", "host", "PC1", 0, 0, { addresses: addr(plan.pc1) }),
            N("PC2", "host", "PC2", 0, 1, { addresses: addr(plan.pc2) }),
            N("SW1", "switch", "SW1", 1, 0),
            N("R1", "router", "R1", 3, 0, {
              addresses: { eth0: plan.r1a, eth1: plan.r1b },
            }),
            N("SW2", "switch", "SW2", 5, 0),
            N("PC3", "host", "PC3", 6, 0, { addresses: addr(plan.pc3) }),
          ],
          links: [],
        },
      };

    // S4 — two routers, three segments; R1 knows the outbound way but
    // the return route on R2 and R1's default route are missing.
    case 4:
    case 5:
      return {
        plan,
        topology: {
          nodes: [
            N("PC1", "host", "PC1", 0, 0, {
              addresses: addr(plan.pc1),
              gateway: plan.r1a.ip,
            }),
            N("PC2", "host", "PC2", 0, 1, {
              addresses: addr(plan.pc2),
              gateway: plan.r1a.ip,
            }),
            N("SW1", "switch", "SW1", 1, 0),
            N("R1", "router", "R1", 3, 0, {
              addresses: {
                eth0: plan.r1a,
                eth1: { ip: tR1, prefix: 30 },
              },
              routes:
                stageIndex === 4
                  ? [route(plan.lanC.ip, 24, plan.r2t.ip)]
                  : [route(plan.lanC.ip, 24, plan.r2t.ip), route("0.0.0.0", 0, plan.r2t.ip)],
            }),
            N("R2", "router", "R2", 5, 0, {
              addresses: {
                eth0: plan.r2t,
                eth1: plan.r2c,
                eth2: plan.r2isp,
              },
              routes:
                stageIndex === 4
                  ? []
                  : [
                      route(plan.lanA.ip, 24, tR1),
                      // The planted bug: R2's default points back at R1,
                      // so unknown destinations loop R1⇄R2 until TTL dies.
                      route("0.0.0.0", 0, tR1),
                    ],
            }),
            N("PC5", "host", "PC5", 6, 0, {
              addresses: addr(plan.pc5),
              gateway: plan.r2c.ip,
            }),
            N("SVR", "host", "SVR", 6, 1, {
              addresses: addr(plan.svr),
              gateway: plan.r2isp.ip,
            }),
          ],
          links: [
            link("PC1", "eth0", "SW1", "p1"),
            link("PC2", "eth0", "SW1", "p2"),
            link("SW1", "p8", "R1", "eth0"),
            link("R1", "eth1", "R2", "eth0"),
            link("R2", "eth1", "PC5", "eth0"),
            link("R2", "eth2", "SVR", "eth0"),
          ],
        },
      };

    default:
      return { plan, topology: { nodes: [], links: [] } };
  }
}

/** Convenience: a host/router interface's normalized ip text. */
export function addrText(a: NetAddress): string {
  return `${a.ip}/${a.prefix}`;
}

/** Numeric ip of a plan address — for case builders that need arithmetic. */
export function planIp(a: NetAddress): number {
  return parseIpv4(a.ip)!;
}

export { formatIpv4 };
