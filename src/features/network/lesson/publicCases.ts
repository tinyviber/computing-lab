/**
 * Public test sets for the network lab — the cases the student can run
 * and read in full. Server hidden cases share this stage table (one
 * assert-family coverage per stage) and add the seeded mystery set.
 *
 * Addresses are expressed as node ids / plan literals, so the same
 * table works for every user's seeded addressing.
 */

import type { NetPlan } from "../domain/plan.ts";
import type { NetCase } from "../domain/scenario.ts";

export function publicNetCases(stageIndex: number, plan: NetPlan): NetCase[] {
  switch (stageIndex) {
    case 1:
      return [
        {
          name: "PC1 → PC2",
          category: "reachability",
          src: "PC1",
          dst: "PC2",
          expect: { events: 8, path: ["PC1", "PC2"] },
        },
        {
          name: "PC2 → PC1",
          category: "reachability",
          src: "PC2",
          dst: "PC1",
          expect: { events: 8, path: ["PC2", "PC1"] },
        },
        {
          name: "网段外地址应被拒",
          category: "negatives",
          src: "PC1",
          dst: plan.foreignIp,
          expect: { events: 8, dropped: { at: "PC1", reason: "no-gateway" } },
        },
      ];

    case 2:
      return [
        {
          name: "第一次发送：交换机泛洪",
          category: "flooding",
          src: "PC1",
          dst: "PC2",
          expect: { events: 16, path: ["PC1", "SW1", "PC2"], flood: true },
        },
        {
          name: "反向先学过一次：直接单播",
          category: "flooding",
          warmup: [{ src: "PC3", dst: "PC1" }],
          src: "PC1",
          dst: "PC3",
          expect: {
            events: 16,
            path: ["PC1", "SW1", "PC3"],
            unicast: true,
            learnedMac: [{ host: "PC3", at: "SW1" }],
          },
        },
        {
          name: "双方都已学习：仍是单播",
          category: "learning",
          warmup: [
            { src: "PC2", dst: "PC3" },
            { src: "PC1", dst: "PC3" },
          ],
          src: "PC2",
          dst: "PC1",
          expect: { events: 16, path: ["PC2", "SW1", "PC1"], unicast: true },
        },
      ];

    case 3:
      return [
        {
          name: "同网段不绕路",
          category: "gateway",
          src: "PC1",
          dst: "PC2",
          expect: { events: 24, path: ["PC1", "SW1", "PC2"] },
        },
        {
          name: "跨网段经 R1",
          category: "gateway",
          src: "PC1",
          dst: "PC3",
          expect: { events: 24, path: ["PC1", "SW1", "R1", "SW2", "PC3"] },
        },
        {
          name: "反向也通",
          category: "gateway",
          src: "PC3",
          dst: "PC1",
          expect: { events: 24, path: ["PC3", "SW2", "R1", "SW1", "PC1"] },
        },
        {
          name: "未知网段死在路由表",
          category: "negatives",
          src: "PC1",
          dst: plan.ghostIp,
          expect: { events: 24, dropped: { at: "R1", reason: "no-route" } },
        },
      ];

    case 4:
      return [
        {
          name: "去程：PC1 → PC5",
          category: "routing",
          src: "PC1",
          dst: "PC5",
          expect: { events: 40, path: ["PC1", "SW1", "R1", "R2", "PC5"] },
        },
        {
          name: "回程：PC5 → PC1",
          category: "routing",
          src: "PC5",
          dst: "PC1",
          expect: { events: 40, path: ["PC5", "R2", "R1", "SW1", "PC1"] },
        },
        {
          name: "默认路由上互联网",
          category: "routing",
          src: "PC1",
          dst: "SVR",
          expect: { events: 40, path: ["PC1", "SW1", "R1", "R2", "SVR"] },
        },
        {
          name: "未分配的网段应丢弃",
          category: "negatives",
          src: "PC1",
          dst: plan.ghostIp,
          expect: {
            events: 40,
            dropped: { at: ["R1", "R2"], reason: "no-route" },
          },
        },
      ];

    case 5:
      return [
        {
          name: "正常地址照常送达",
          category: "loop",
          src: "PC1",
          dst: "SVR",
          expect: { events: 48, path: ["PC1", "SW1", "R1", "R2", "SVR"] },
        },
        {
          name: "未知地址死于无路由",
          category: "loop",
          src: "PC1",
          dst: plan.ghostIp,
          expect: {
            events: 48,
            dropped: { at: ["R1", "R2"], reason: "no-route" },
          },
        },
        {
          name: "反向未知地址同样",
          category: "loop",
          src: "PC5",
          dst: plan.foreignIp,
          expect: {
            events: 48,
            dropped: { at: ["R1", "R2"], reason: "no-route" },
          },
        },
      ];

    default:
      return [];
  }
}
