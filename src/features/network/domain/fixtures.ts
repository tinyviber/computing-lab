/**
 * Reference topologies: one known-good draft per stage, built on the
 * same seeded plan the cases use. The domain sweep test asserts each
 * reference passes the full public + hidden sets for its stage (and a
 * second seed), so a case that no correct configuration can satisfy
 * fails loudly in `bun run test:run` instead of in front of a student.
 */

import type { NetLink, NetTopology } from "./model.ts";
import { planFor } from "./plan.ts";

const link = (aNode: string, aIface: string, bNode: string, bIface: string): NetLink => ({
  a: { node: aNode, iface: aIface },
  b: { node: bNode, iface: bIface },
});

export function netReferenceFor(stageIndex: number, seed: number): NetTopology {
  const { topology, plan } = planFor(stageIndex, seed);
  const tR1 = `10.${plan.octet}.254.1`;

  switch (stageIndex) {
    // S1: fix PC2 onto PC1's subnet.
    case 1:
      return {
        nodes: topology.nodes.map((n) =>
          n.id === "PC2" ? { ...n, addresses: { eth0: { ...plan.pc2 } } } : n,
        ),
        links: topology.links,
      };

    // S2: wire each host to a switch port.
    case 2:
      return {
        nodes: topology.nodes,
        links: [
          link("PC1", "eth0", "SW1", "p1"),
          link("PC2", "eth0", "SW1", "p2"),
          link("PC3", "eth0", "SW1", "p3"),
        ],
      };

    // S3: wire the two segments and fill every host's gateway.
    case 3:
      return {
        nodes: topology.nodes.map((n) => {
          if (n.id === "PC1" || n.id === "PC2") return { ...n, gateway: plan.r1a.ip };
          if (n.id === "PC3") return { ...n, gateway: plan.r1b.ip };
          return n;
        }),
        links: [
          link("PC1", "eth0", "SW1", "p1"),
          link("PC2", "eth0", "SW1", "p2"),
          link("SW1", "p8", "R1", "eth0"),
          link("R1", "eth1", "SW2", "p8"),
          link("PC3", "eth0", "SW2", "p1"),
        ],
      };

    // S4: prefill links as shipped; R1 gains the default route, R2 gains
    // the return route to LAN-A.
    case 4:
      return {
        nodes: topology.nodes.map((n) => {
          if (n.id === "R1") {
            return {
              ...n,
              routes: [...n.routes, { dest: "0.0.0.0", prefix: 0, nextHop: plan.r2t.ip }],
            };
          }
          if (n.id === "R2") {
            return { ...n, routes: [{ dest: plan.lanA.ip, prefix: 24, nextHop: tR1 }] };
          }
          return n;
        }),
        links: topology.links,
      };

    // X5: the fix = delete R2's planted default route back at R1.
    case 5:
      return {
        nodes: topology.nodes.map((n) =>
          n.id === "R2" ? { ...n, routes: n.routes.filter((r) => r.prefix > 0) } : n,
        ),
        links: topology.links,
      };

    default:
      return topology;
  }
}
