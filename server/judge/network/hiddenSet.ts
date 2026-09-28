/**
 * Hidden judgement cases for the network lab. Every case starts from an
 * EMPTY switch MAC table (warmup is unscored); concrete subnet numbers
 * come from the same per-user seed as the student's prefill, so the
 * graded topology is the one they practiced on — while two students'
 * literal addresses never match.
 */

import { formatIp, parseIp } from "../../../src/features/network/domain/addressing.ts";
import type { NetCase, NetProbeSpec } from "../../../src/features/network/domain/scenario.ts";
import { netPlan } from "../../../src/features/network/domain/stages.ts";

const OUTSIDE = "203.0.113.9"; // TEST-NET-3, outside every lab subnet

function ipAt(cidr: string, host: number): string {
  const base = parseIp(cidr.slice(0, cidr.indexOf("/"))) ?? 0;
  return formatIp((base + host) >>> 0);
}

const probe = (src: string, dst: string, expect: NetProbeSpec["expect"]): NetProbeSpec => ({
  src,
  dst,
  expect,
});

const BUILDERS: Record<number, (seed: number) => NetCase[]> = {
  // C1: same-segment pair — direct delivery, off-segment drop, ghost host.
  1: (seed) => {
    const plan = netPlan(seed);
    return [
      {
        name: "PC1 直发 PC2",
        category: "连通",
        probes: [probe("pc1", "@pc2", { kind: "path", path: ["PC1", "PC2"] })],
      },
      {
        name: "PC2 反向直发",
        category: "连通",
        probes: [probe("pc2", "@pc1", { kind: "path", path: ["PC2", "PC1"] })],
      },
      {
        name: "网段内没人认领的地址",
        category: "丢弃",
        probes: [
          probe("pc1", ipAt(plan.lanA, 77), { kind: "dropped", at: "", reason: "no-response" }),
        ],
      },
      {
        name: "网段外、未配网关",
        category: "丢弃",
        probes: [
          probe("pc1", OUTSIDE, { kind: "dropped", at: "PC1", reason: "no-gateway" }),
          probe("pc2", OUTSIDE, { kind: "dropped", at: "PC2", reason: "no-gateway" }),
        ],
      },
      {
        name: "发给本网段广播地址",
        category: "丢弃",
        probes: [
          probe("pc1", ipAt(plan.lanA, 255), { kind: "dropped", at: "", reason: "no-response" }),
        ],
      },
    ];
  },

  // C2: switch learning — empty-table flood, learned unicast, MAC bookkeeping.
  2: (_seed) => {
    return [
      {
        name: "表空时的第一笔",
        category: "学习",
        probes: [probe("pc1", "@pc3", { kind: "flood" })],
      },
      {
        name: "学过之后的第二笔",
        category: "学习",
        warmup: [{ src: "pc1", dst: "@pc3" }],
        probes: [probe("pc1", "@pc3", { kind: "unicast" })],
      },
      {
        name: "MAC 表记下了 PC3",
        category: "学习",
        warmup: [{ src: "pc3", dst: "@pc1" }],
        probes: [
          probe("pc1", "@pc3", { kind: "unicast" }),
          probe("pc1", "@pc2", { kind: "learned", switch: "sw1", host: "pc3", via: "p3" }),
        ],
      },
      {
        name: "PC2 的首笔同样泛洪",
        category: "学习",
        probes: [probe("pc2", "@pc1", { kind: "flood" })],
      },
      {
        name: "串行学到双向都单播",
        category: "学习",
        warmup: [{ src: "pc1", dst: "@pc2" }],
        probes: [
          probe("pc2", "@pc1", { kind: "unicast" }),
          probe("pc1", "@pc2", { kind: "unicast" }),
        ],
      },
    ];
  },

  // C3: gateways — cross-subnet both ways, same-segment bypass, off-table drop.
  3: (seed) => {
    const plan = netPlan(seed);
    const lanBHost = "@pc3";
    return [
      {
        name: "PC1 经网关到 LAN-B",
        category: "连通",
        probes: [
          probe("pc1", lanBHost, {
            kind: "path",
            path: ["PC1", "SW1", "R1", "SW2", "PC3"],
            replyPath: ["PC3", "SW2", "R1", "SW1", "PC1"],
          }),
        ],
      },
      {
        name: "PC3 反向经网关到 LAN-A",
        category: "连通",
        probes: [
          probe("pc3", "@pc1", {
            kind: "path",
            path: ["PC3", "SW2", "R1", "SW1", "PC1"],
            replyPath: ["PC1", "SW1", "R1", "SW2", "PC3"],
          }),
        ],
      },
      {
        name: "同网段不打扰路由器",
        category: "连通",
        probes: [probe("pc1", "@pc2", { kind: "path", path: ["PC1", "SW1", "PC2"] })],
      },
      {
        name: "PC2 跨网段",
        category: "连通",
        probes: [
          probe("pc2", lanBHost, {
            kind: "path",
            path: ["PC2", "SW1", "R1", "SW2", "PC3"],
            replyPath: ["PC3", "SW2", "R1", "SW1", "PC2"],
          }),
        ],
      },
      {
        name: "出网段但路由表没有",
        category: "丢弃",
        probes: [probe("pc1", OUTSIDE, { kind: "dropped", at: "R1", reason: "no-route" })],
      },
      {
        name: "LAN-B 内不存在的地址",
        category: "丢弃",
        probes: [
          probe("pc1", ipAt(plan.lanC, 66), {
            kind: "dropped",
            at: "",
            reason: "no-response",
          }),
        ],
      },
    ];
  },

  // C4: static routes — round trips both ways, unassigned segments dropped at R1.
  4: (seed) => {
    const plan = netPlan(seed);
    const bogusHost = ipAt(plan.bogus, 9);
    return [
      {
        name: "PC1↔PC3 往返",
        category: "连通",
        probes: [
          probe("pc1", "@pc3", {
            kind: "path",
            path: ["PC1", "SW1", "R1", "R2", "SW2", "PC3"],
            replyPath: ["PC3", "SW2", "R2", "R1", "SW1", "PC1"],
          }),
        ],
      },
      {
        name: "PC3↔PC1 往返",
        category: "连通",
        probes: [
          probe("pc3", "@pc1", {
            kind: "path",
            path: ["PC3", "SW2", "R2", "R1", "SW1", "PC1"],
            replyPath: ["PC1", "SW1", "R1", "R2", "SW2", "PC3"],
          }),
        ],
      },
      {
        name: "PC2↔PC3 往返",
        category: "连通",
        probes: [
          probe("pc2", "@pc3", {
            kind: "path",
            path: ["PC2", "SW1", "R1", "R2", "SW2", "PC3"],
            replyPath: ["PC3", "SW2", "R2", "R1", "SW1", "PC2"],
          }),
        ],
      },
      {
        name: "未分配网段丢在 R1",
        category: "丢弃",
        probes: [
          probe("pc1", OUTSIDE, { kind: "dropped", at: "R1", reason: "no-route" }),
          probe("pc1", bogusHost, { kind: "dropped", at: "R1", reason: "no-route" }),
        ],
      },
      {
        name: "同网段旁路",
        category: "连通",
        probes: [probe("pc1", "@pc2", { kind: "path", path: ["PC1", "SW1", "PC2"] })],
      },
    ];
  },

  // X1: the loop — after removing the stale mutual routes the ghost
  // segment must fail cleanly at R1, and real traffic must still flow.
  5: (seed) => {
    const plan = netPlan(seed);
    const bogusHost = ipAt(plan.bogus, 9);
    return [
      {
        name: "幽灵网段在 R1 丢弃",
        category: "排障",
        probes: [
          probe("pc1", bogusHost, { kind: "dropped", at: "R1", reason: "no-route" }),
          probe("pc2", ipAt(plan.bogus, 40), { kind: "dropped", at: "R1", reason: "no-route" }),
        ],
      },
      {
        name: "正常流量往返",
        category: "连通",
        probes: [
          probe("pc1", "@pc3", {
            kind: "path",
            path: ["PC1", "SW1", "R1", "R2", "SW2", "PC3"],
            replyPath: ["PC3", "SW2", "R2", "R1", "SW1", "PC1"],
          }),
        ],
      },
      {
        name: "反向流量往返",
        category: "连通",
        probes: [
          probe("pc3", "@pc2", {
            kind: "path",
            path: ["PC3", "SW2", "R2", "R1", "SW1", "PC2"],
            replyPath: ["PC2", "SW1", "R1", "R2", "SW2", "PC3"],
          }),
        ],
      },
    ];
  },
};

export function hiddenNetCases(stageIndex: number, seed: number): NetCase[] {
  return BUILDERS[stageIndex]?.(seed) ?? [];
}
