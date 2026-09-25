/**
 * Hidden scenarios for the network lab — the seeded side of the
 * per-stage contract. The address plan arrives already seeded by the
 * caller (`planFor(stage, seedFor(userId, "network", stage))`), so the
 * same node ids resolve to different subnets per student: a config
 * copied from a classmate lands in the wrong subnet.
 *
 * Coverage per stage mirrors the public set's assert families plus the
 * edge probes the public set can't reveal:
 * - reachability in both directions (teachers check handover symmetry);
 * - MAC-table state evolution (warmup → learned unicast);
 * - next-hop choice at each router;
 * - negative sends: ghost IPs inside the lab family, and TEST-NET-3
 *   probes outside every subnet.
 *
 * Bound per issue #56: ≤32 hidden cases per stage.
 */

import { planFor, type NetPlan } from "../../../src/features/network/domain/plan.ts";
import type { NetCase } from "../../../src/features/network/domain/scenario.ts";

export function hiddenNetCases(stageIndex: number, plan: NetPlan): NetCase[] {
  const foreign = plan.foreignIp;
  const ghost = plan.ghostIp;
  switch (stageIndex) {
    case 1:
      return [
        {
          name: "hidden-反向直投",
          category: "hidden-reachability",
          src: "PC2",
          dst: "PC1",
          expect: { events: 8, path: ["PC2", "PC1"] },
        },
        {
          name: "hidden-外网探针应被拒",
          category: "hidden-negatives",
          src: "PC2",
          dst: foreign,
          expect: { events: 8, dropped: { at: "PC2", reason: "no-gateway" } },
        },
        {
          name: "hidden-族内空洞地址",
          category: "hidden-negatives",
          src: "PC1",
          dst: ghost,
          expect: {
            events: 8,
            dropped: { at: "PC1", reason: ["no-gateway", "no-such-host"] },
          },
        },
      ];

    case 2:
      return [
        {
          name: "hidden-冷启动泛洪",
          category: "hidden-flood",
          src: "PC2",
          dst: "PC3",
          expect: { events: 16, path: ["PC2", "SW1", "PC3"], flood: true },
        },
        {
          name: "hidden-学习后单播",
          category: "hidden-learning",
          warmup: [{ src: "PC2", dst: "PC1" }],
          src: "PC1",
          dst: "PC2",
          expect: {
            events: 16,
            path: ["PC1", "SW1", "PC2"],
            unicast: true,
            learnedMac: [{ host: "PC2", at: "SW1" }],
          },
        },
        {
          name: "hidden-两侧都学过后仍单播",
          category: "hidden-learning",
          warmup: [
            { src: "PC3", dst: "PC2" },
            { src: "PC1", dst: "PC2" },
          ],
          src: "PC3",
          dst: "PC1",
          expect: {
            events: 16,
            path: ["PC3", "SW1", "PC1"],
            unicast: true,
            learnedMac: [
              { host: "PC1", at: "SW1" },
              { host: "PC3", at: "SW1" },
            ],
          },
        },
        {
          name: "hidden-自学一次即成表项",
          category: "hidden-learning",
          src: "PC1",
          dst: "PC3",
          expect: {
            events: 16,
            learnedMac: [{ host: "PC1", at: "SW1" }],
          },
        },
      ];

    case 3:
      return [
        {
          name: "hidden-LAN-B 回 LAN-A",
          category: "hidden-reachability",
          src: "PC3",
          dst: "PC2",
          expect: { events: 24, path: ["PC3", "SW2", "R1", "SW1", "PC2"] },
        },
        {
          name: "hidden-同段走交换机不绕路",
          category: "hidden-gateway",
          src: "PC2",
          dst: "PC1",
          expect: { events: 24, path: ["PC2", "SW1", "PC1"] },
        },
        {
          name: "hidden-B 侧未知目的死在路由",
          category: "hidden-negatives",
          src: "PC3",
          dst: ghost,
          expect: { events: 24, dropped: { at: "R1", reason: "no-route" } },
        },
        {
          name: "hidden-外网探针死在路由",
          category: "hidden-negatives",
          src: "PC2",
          dst: foreign,
          expect: { events: 24, dropped: { at: "R1", reason: "no-route" } },
        },
        {
          name: "hidden-R1 从 eth1 送出",
          category: "hidden-nexthop",
          src: "PC2",
          dst: "PC3",
          expect: {
            events: 24,
            path: ["PC2", "SW1", "R1", "SW2", "PC3"],
            nextHop: [{ node: "R1", iface: "eth1" }],
          },
        },
      ];

    case 4:
      return [
        {
          name: "hidden-去程经 R1→R2",
          category: "hidden-routing",
          src: "PC2",
          dst: "PC5",
          expect: {
            events: 40,
            path: ["PC2", "SW1", "R1", "R2", "PC5"],
            nextHop: [{ node: "R1", iface: "eth1" }],
          },
        },
        {
          name: "hidden-回程经 R2→R1",
          category: "hidden-routing",
          src: "PC5",
          dst: "PC2",
          expect: {
            events: 40,
            path: ["PC5", "R2", "R1", "SW1", "PC2"],
            nextHop: [{ node: "R2", iface: "eth0" }],
          },
        },
        {
          name: "hidden-服务器回 LAN-A",
          category: "hidden-routing",
          src: "SVR",
          dst: "PC1",
          expect: { events: 40, path: ["SVR", "R2", "R1", "SW1", "PC1"] },
        },
        {
          name: "hidden-同网段服务器互访",
          category: "hidden-routing",
          src: "PC5",
          dst: "SVR",
          expect: { events: 40, path: ["PC5", "R2", "SVR"] },
        },
        {
          name: "hidden-族内空洞死在 R2",
          category: "hidden-negatives",
          src: "PC5",
          dst: ghost,
          expect: { events: 40, dropped: { at: "R2", reason: "no-route" } },
        },
        {
          name: "hidden-外网探针死于默认路由之后",
          category: "hidden-negatives",
          src: "PC1",
          dst: ghost,
          expect: { events: 40, dropped: { at: ["R1", "R2"], reason: "no-route" } },
        },
        {
          name: "hidden-C 侧外网无路由",
          category: "hidden-negatives",
          src: "PC5",
          dst: foreign,
          expect: { events: 40, dropped: { at: "R2", reason: "no-route" } },
        },
      ];

    case 5:
      return [
        {
          name: "hidden-修好后去程照常",
          category: "hidden-loop",
          src: "PC2",
          dst: "SVR",
          expect: { events: 48, path: ["PC2", "SW1", "R1", "R2", "SVR"] },
        },
        {
          name: "hidden-修好后回程照常",
          category: "hidden-loop",
          src: "SVR",
          dst: "PC2",
          expect: { events: 48, path: ["SVR", "R2", "R1", "SW1", "PC2"] },
        },
        {
          name: "hidden-未知目的死于无路由而非 TTL",
          category: "hidden-loop",
          src: "PC1",
          dst: ghost,
          expect: { events: 48, dropped: { at: ["R1", "R2"], reason: "no-route" } },
        },
        {
          name: "hidden-反向未知目的同样",
          category: "hidden-loop",
          src: "SVR",
          dst: ghost,
          expect: { events: 48, dropped: { at: ["R1", "R2"], reason: "no-route" } },
        },
        {
          name: "hidden-外网探针死于无路由",
          category: "hidden-loop",
          src: "PC2",
          dst: foreign,
          expect: { events: 48, dropped: { at: ["R1", "R2"], reason: "no-route" } },
        },
      ];

    default:
      return [];
  }
}

/** Convenience for the domain sweep test and the judge. */
export function hiddenNetCasesForSeed(stageIndex: number, seed: number): NetCase[] {
  return hiddenNetCases(stageIndex, planFor(stageIndex, seed).plan);
}
