/**
 * Public probe cases per stage — the ones the student can run before
 * submitting. They are seeded by the same per-user plan as the prefill,
 * so the labels stay readable while the concrete subnets differ.
 */

import { formatIp, parseIp } from "../domain/addressing.ts";
import type { NetCase } from "../domain/scenario.ts";
import { netPlan } from "../domain/stages.ts";

/** TEST-NET-3 (RFC 5737): guaranteed outside every required lab subnet. */
const OUTSIDE = "203.0.113.9";

export function publicNetCases(stageIndex: number, seed: number): NetCase[] {
  const plan = netPlan(seed);
  const bogusHost = ipAt(plan.bogus, 9);
  switch (stageIndex) {
    case 1:
      return [
        {
          name: "同网段直发",
          category: "连通",
          probes: [{ src: "pc1", dst: "@pc2", expect: { kind: "path", path: ["PC1", "PC2"] } }],
        },
        {
          name: "网段外没有网关",
          category: "丢弃",
          probes: [
            {
              src: "pc1",
              dst: OUTSIDE,
              expect: { kind: "dropped", at: "PC1", reason: "no-gateway" },
            },
          ],
        },
        {
          name: "发给网段里没人用的地址",
          category: "丢弃",
          probes: [
            {
              src: "pc1",
              dst: ipAt(plan.lanA, 200),
              expect: { kind: "dropped", at: "", reason: "no-response" },
            },
          ],
        },
      ];
    case 2:
      return [
        {
          name: "第一笔 ping（MAC 表是空的）",
          category: "学习",
          probes: [{ src: "pc1", dst: "@pc3", expect: { kind: "flood" } }],
        },
        {
          name: "第二笔 ping（已学到）",
          category: "学习",
          warmup: [{ src: "pc1", dst: "@pc3" }],
          probes: [{ src: "pc1", dst: "@pc3", expect: { kind: "unicast" } }],
        },
        {
          name: "MAC 表记住了谁",
          category: "学习",
          warmup: [{ src: "pc3", dst: "@pc1" }],
          probes: [
            { src: "pc1", dst: "@pc3", expect: { kind: "unicast" } },
            {
              src: "pc1",
              dst: "@pc2",
              expect: { kind: "learned", switch: "sw1", host: "pc3", via: "p3" },
            },
          ],
        },
      ];
    case 3:
      return [
        {
          name: "跨网段走网关",
          category: "连通",
          probes: [
            {
              src: "pc1",
              dst: "@pc3",
              expect: {
                kind: "path",
                path: ["PC1", "SW1", "R1", "SW2", "PC3"],
                replyPath: ["PC3", "SW2", "R1", "SW1", "PC1"],
              },
            },
          ],
        },
        {
          name: "同网段不过路由",
          category: "连通",
          probes: [
            { src: "pc1", dst: "@pc2", expect: { kind: "path", path: ["PC1", "SW1", "PC2"] } },
          ],
        },
        {
          name: "出网段但无路可走",
          category: "丢弃",
          probes: [
            { src: "pc1", dst: OUTSIDE, expect: { kind: "dropped", at: "R1", reason: "no-route" } },
          ],
        },
      ];
    case 4:
      return [
        {
          name: "往返都要通",
          category: "连通",
          probes: [
            {
              src: "pc1",
              dst: "@pc3",
              expect: {
                kind: "path",
                path: ["PC1", "SW1", "R1", "R2", "SW2", "PC3"],
                replyPath: ["PC3", "SW2", "R2", "R1", "SW1", "PC1"],
              },
            },
          ],
        },
        {
          name: "反方向也通",
          category: "连通",
          probes: [
            {
              src: "pc3",
              dst: "@pc1",
              expect: {
                kind: "path",
                path: ["PC3", "SW2", "R2", "R1", "SW1", "PC1"],
                replyPath: ["PC1", "SW1", "R1", "R2", "SW2", "PC3"],
              },
            },
          ],
        },
        {
          name: "未分配网段丢弃在 R1",
          category: "丢弃",
          probes: [
            { src: "pc1", dst: OUTSIDE, expect: { kind: "dropped", at: "R1", reason: "no-route" } },
          ],
        },
      ];
    case 5:
      return [
        {
          name: "幽灵网段不再转圈",
          category: "排障",
          probes: [
            {
              src: "pc1",
              dst: bogusHost,
              expect: { kind: "dropped", at: "R1", reason: "no-route" },
            },
          ],
        },
        {
          name: "正常流量不受影响",
          category: "连通",
          probes: [
            {
              src: "pc1",
              dst: "@pc3",
              expect: {
                kind: "path",
                path: ["PC1", "SW1", "R1", "R2", "SW2", "PC3"],
                replyPath: ["PC3", "SW2", "R2", "R1", "SW1", "PC1"],
              },
            },
          ],
        },
      ];
    default:
      return [];
  }
}

function ipAt(cidr: string, host: number): string {
  const base = parseIp(cidr.slice(0, cidr.indexOf("/"))) ?? 0;
  return formatIp((base + host) >>> 0);
}
