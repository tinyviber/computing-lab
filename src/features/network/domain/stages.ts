/**
 * Stage contract for 网络模拟器 (issue #56). MVP ships C1–C4 plus the X1
 * loop challenge. Topologies are fixed per stage; the per-user seed only
 * moves the subnet blocks, so two students never share the same numbers
 * to copy.
 *
 *   C1 同一个网段     PC1—PC2，IP/掩码可编辑
 *   C2 交换机先看表   PC1..PC3—SW1，地址只读，看泛洪→单播
 *   C3 默认网关       LAN-A—R1—LAN-B，主机网关待填
 *   C4 路由表         接入层—R1—R2—LAN-C，去程/回程都要配
 *   X1 成环           预置互相甩锅的静态路由，TTL 耗尽
 */

import { formatCidr, formatIp } from "./addressing.ts";
import type { NetEdit } from "./scenario.ts";
import { makeRng, seedFor } from "./rng.ts";
import { NET_LAB_ID, macFor, type NetLink, type NetNode, type NetTopology } from "./topology.ts";

export type NetStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  track: "core" | "challenge";
  description: string;
  task: string;
  hint: string;
  judgeNote: string;
  takeaway: string;
  edit: NetEdit;
  unlockAfter?: number[];
  build: (plan: NetPlan) => NetTopology;
  required: (plan: NetPlan) => [string, string][];
};

/** Per-user address plan drawn from the seed. */
export type NetPlan = {
  /** Second octet shared by this user's lab networks: 10.{a}.x.x */
  a: number;
  lanA: string; // "10.a.1.0/24"
  lanC: string; // "10.a.2.0/24"
  transit: string; // "10.a.255.0/30"
  bogus: string; // "10.a.9.0/24" — dead segment for X1's loop
};

export function netPlan(seed: number): NetPlan {
  const rng = makeRng(seed);
  const a = 1 + Math.floor(rng() * 200);
  return {
    a,
    lanA: `10.${a}.1.0/24`,
    lanC: `10.${a}.2.0/24`,
    transit: `10.${a}.255.0/30`,
    bogus: `10.${a}.9.0/24`,
  };
}

export function planForStage(userId: string, stageIndex: number): NetPlan {
  return netPlan(seedFor(userId, NET_LAB_ID, stageIndex));
}

const ip = (net: string, host: number) => {
  const base = net.slice(0, net.indexOf("/")).split(".").map(Number);
  return formatIp(((base[0] << 24) | (base[1] << 16) | (base[2] << 8) | host) >>> 0);
};
const maskOf = (net: string) => `/${net.slice(net.indexOf("/") + 1)}`;

function hostNode(
  id: string,
  label: string,
  x: number,
  y: number,
  address?: string,
  mask?: string,
  gateway?: string,
): NetNode {
  return {
    id,
    label,
    kind: "host",
    x,
    y,
    fixed: true,
    ports: [
      {
        id: "eth0",
        mac: macFor(id, "eth0"),
        ...(address ? { ip: address } : {}),
        ...(mask ? { mask } : {}),
      },
    ],
    ...(gateway ? { gateway } : {}),
  };
}

function switchNode(id: string, label: string, x: number, y: number): NetNode {
  return {
    id,
    label,
    kind: "switch",
    x,
    y,
    fixed: true,
    ports: ["p1", "p2", "p3", "p4"].map((p) => ({ id: p })),
  };
}

function routerNode(
  id: string,
  label: string,
  x: number,
  y: number,
  ports: { id: string; ip: string; mask: string }[],
  routes: { prefix: string; nextHop: string }[] = [],
): NetNode {
  return {
    id,
    label,
    kind: "router",
    x,
    y,
    fixed: true,
    ports: ports.map((p) => ({ ...p, mac: macFor(id, p.id) })),
    routes,
  };
}

const link = (aNode: string, aPort: string, bNode: string, bPort: string): NetLink => ({
  a: { node: aNode, port: aPort },
  b: { node: bNode, port: bPort },
});

/* ---------------- C1: same-segment pair ---------------- */

const c1: NetStageDef = {
  index: 1,
  id: "same-subnet",
  title: "同一个网段",
  englishTitle: "Same subnet",
  track: "core",
  description:
    "两台主机一根直连线。给它们配上同一网段的地址，包就能一步到达；不配网关也到不了的地方，会被直接丢下。",
  task: "给 PC1、PC2 配上同一网段（画布标签上写着要求）内的地址和正确掩码，然后互发探针。",
  hint: "同一网段 = 两边「IP ∧ 掩码」得到同一个网络号。主机没配网关时，网段外的目标在源端就会被丢弃。",
  judgeNote: "地址必须在指定网段内、是可用主机地址（不能是网段号或广播号），掩码连续且符合要求。",
  takeaway: "主机先看对方在不在自己网段里：在，直发；不在，交给网关；没网关，丢。",
  edit: { address: true, gateway: false, routes: false },
  build: (_p) => ({
    nodes: [hostNode("pc1", "PC1", 0, 0), hostNode("pc2", "PC2", 2, 0)],
    links: [link("pc1", "eth0", "pc2", "eth0")],
  }),
  required: (p) => [
    ["pc1/eth0", p.lanA],
    ["pc2/eth0", p.lanA],
  ],
};

/* ---------------- C2: switch learns MACs ---------------- */

const c2: NetStageDef = {
  index: 2,
  id: "switch-learns",
  title: "交换机先看 MAC 表",
  englishTitle: "Switch learns MACs",
  track: "core",
  description:
    "三台主机接在一台交换机上。第一笔 ping 出去时 MAC 表是空的，只能泛洪；等它学到了目的端口，第二笔就变成单播。",
  task: "地址已配好且只读。反复发同一个探针，打开 SW1 的 MAC 表看「学到 → 单播」的变化。",
  hint: "交换机只认 MAC：每个进来的帧都把「源 MAC → 入端口」记进表；查不到才泛洪。",
  judgeNote: "拓扑与地址固定，观察即可；隐藏用例从空 MAC 表起跑。",
  takeaway: "交换机的决定 = 查 MAC 表：学到就单播，没学到就泛洪（入端口除外）。",
  edit: { address: false, gateway: false, routes: false },
  build: (p) => ({
    nodes: [
      hostNode("pc1", "PC1", 0, 0, ip(p.lanA, 11), maskOf(p.lanA)),
      hostNode("pc2", "PC2", 0, 1, ip(p.lanA, 12), maskOf(p.lanA)),
      switchNode("sw1", "SW1", 1, 0),
      hostNode("pc3", "PC3", 2, 0, ip(p.lanA, 13), maskOf(p.lanA)),
    ],
    links: [
      link("pc1", "eth0", "sw1", "p1"),
      link("pc2", "eth0", "sw1", "p2"),
      link("pc3", "eth0", "sw1", "p3"),
    ],
  }),
  required: (p) => [
    ["pc1/eth0", p.lanA],
    ["pc2/eth0", p.lanA],
    ["pc3/eth0", p.lanA],
  ],
};

/* ---------------- C3: default gateway ---------------- */

const c3: NetStageDef = {
  index: 3,
  id: "default-gateway",
  title: "默认网关",
  englishTitle: "Default gateway",
  track: "core",
  description:
    "两个网段靠一台路由器搭桥。主机的地址已经配好，但「出本网段找谁」还没说——把默认网关填对，跨网段的包才出得去、回得来。",
  task: "给 PC1、PC2、PC3 填默认网关：本网段那台路由器接口的地址。然后发跨网段探针看路径。",
  hint: "网关必须和主机在同一个网段里，否则主机自己就会拒绝。R1 的两个接口分属两个网段。",
  judgeNote:
    "网关要等于本侧 R1 接口地址；漏填会丢在源端（no-gateway），填别的网段会丢在源端（gateway-offlink）。",
  takeaway: "主机的下一跳由谁决定：同网段直发；不同网段，交给默认网关。",
  edit: { address: false, gateway: true, routes: false },
  build: (p) => ({
    nodes: [
      hostNode("pc1", "PC1", 0, 0, ip(p.lanA, 11), maskOf(p.lanA)),
      hostNode("pc2", "PC2", 0, 1, ip(p.lanA, 12), maskOf(p.lanA)),
      switchNode("sw1", "SW1", 1, 0),
      routerNode("r1", "R1", 2, 0, [
        { id: "g0", ip: ip(p.lanA, 1), mask: maskOf(p.lanA) },
        { id: "g1", ip: ip(p.lanC, 1), mask: maskOf(p.lanC) },
      ]),
      switchNode("sw2", "SW2", 3, 0),
      hostNode("pc3", "PC3", 3, 1, ip(p.lanC, 11), maskOf(p.lanC)),
    ],
    links: [
      link("pc1", "eth0", "sw1", "p1"),
      link("pc2", "eth0", "sw1", "p2"),
      link("sw1", "p3", "r1", "g0"),
      link("r1", "g1", "sw2", "p1"),
      link("sw2", "p2", "pc3", "eth0"),
    ],
  }),
  required: (p) => [
    ["pc1/eth0", p.lanA],
    ["pc2/eth0", p.lanA],
    ["pc3/eth0", p.lanC],
    ["r1/g0", p.lanA],
    ["r1/g1", p.lanC],
  ],
};

/* ---------------- C4: static routes both ways ---------------- */

const c4Build = (p: NetPlan): NetTopology => ({
  nodes: [
    hostNode("pc1", "PC1", 0, 0, ip(p.lanA, 11), maskOf(p.lanA), ip(p.lanA, 1)),
    hostNode("pc2", "PC2", 0, 1, ip(p.lanA, 12), maskOf(p.lanA), ip(p.lanA, 1)),
    switchNode("sw1", "SW1", 1, 0),
    routerNode(
      "r1",
      "R1",
      1,
      1,
      [
        { id: "g0", ip: ip(p.lanA, 1), mask: maskOf(p.lanA) },
        { id: "g1", ip: ip(p.transit, 1), mask: maskOf(p.transit) },
      ],
      [{ prefix: p.lanC, nextHop: ip(p.transit, 2) }],
    ),
    routerNode("r2", "R2", 2, 1, [
      { id: "g0", ip: ip(p.transit, 2), mask: maskOf(p.transit) },
      { id: "g1", ip: ip(p.lanC, 1), mask: maskOf(p.lanC) },
    ]),
    switchNode("sw2", "SW2", 3, 1),
    hostNode("pc3", "PC3", 3, 0, ip(p.lanC, 11), maskOf(p.lanC), ip(p.lanC, 1)),
  ],
  links: [
    link("pc1", "eth0", "sw1", "p1"),
    link("pc2", "eth0", "sw1", "p2"),
    link("sw1", "p3", "r1", "g0"),
    link("r1", "g1", "r2", "g0"),
    link("r2", "g1", "sw2", "p1"),
    link("sw2", "p2", "pc3", "eth0"),
  ],
});

const c4: NetStageDef = {
  index: 4,
  id: "static-routes",
  title: "路由表只配了去程",
  englishTitle: "Static routes, both ways",
  track: "core",
  description:
    "两个网段中间隔着两台路由器。R1 已经知道往 LAN-C 怎么走，但 R2 还不知道回程——ping 能到对面，应答却回不来。",
  task: "在 R2 上补一条回程路由（LAN-A 网段 → 下一跳是 R1 的直连地址），让探针往返都通。别给 R1 加默认路由——发往未分配网段的包应该被丢在 R1。",
  hint: "路由器先查直连网段，再按最长前缀匹配路由表，最后才是默认路由；都没有就丢。回程是另一条独立的路。",
  judgeNote: "请求与应答两段都判；未分配网段必须在 R1 无匹配路由被丢弃。",
  takeaway:
    "路由器的决定 = 直连 → 最长前缀匹配 → 默认 → 丢弃。ping 是两条路：去程和回程各查一次表。",
  edit: { address: false, gateway: false, routes: true },
  build: c4Build,
  required: (p) => [
    ["pc1/eth0", p.lanA],
    ["pc2/eth0", p.lanA],
    ["pc3/eth0", p.lanC],
    ["r1/g0", p.lanA],
    ["r1/g1", p.transit],
    ["r2/g0", p.transit],
    ["r2/g1", p.lanC],
  ],
};

/* ---------------- X1: routing loop ---------------- */

const x1: NetStageDef = {
  index: 5,
  id: "routing-loop",
  title: "转圈圈的包",
  englishTitle: "Routing loop",
  track: "challenge",
  description:
    "同样的拓扑，但两台路由器上留着一笔互相甩锅的静态路由：都以为对方能到一个早已不存在的网段。发一个探针，看它转到 TTL 耗尽。",
  task: "先向「幽灵网段」发一笔看轨迹里的环路，再把 R1、R2 上那两条错误路由删掉，让探针干净地在 R1 被丢弃（而不是继续转圈）。",
  hint: "打开探针轨迹数跳数：同一个包在 R1、R2 之间来回就是环路。删掉两条指向幽灵网段的路由即可。",
  judgeNote: "修好后：正常流量照走，幽灵网段在 R1 以 no-route 丢弃。",
  takeaway: "TTL 是环路的保险丝：路由表错了不会让包无限转下去，只会让每一跳白白消耗 TTL。",
  edit: { address: false, gateway: false, routes: true },
  unlockAfter: [4],
  build: (p) => {
    const net = c4Build(p);
    const r1 = net.nodes.find((n) => n.id === "r1")!;
    const r2 = net.nodes.find((n) => n.id === "r2")!;
    r1.routes = [...(r1.routes ?? []), { prefix: p.bogus, nextHop: ip(p.transit, 2) }];
    r2.routes = [
      { prefix: p.lanA, nextHop: ip(p.transit, 1) },
      { prefix: p.bogus, nextHop: ip(p.transit, 1) },
    ];
    return net;
  },
  required: (p) => [
    ["pc1/eth0", p.lanA],
    ["pc2/eth0", p.lanA],
    ["pc3/eth0", p.lanC],
    ["r1/g0", p.lanA],
    ["r1/g1", p.transit],
    ["r2/g0", p.transit],
    ["r2/g1", p.lanC],
  ],
};

export const NET_STAGES: NetStageDef[] = [c1, c2, c3, c4, x1];
export const NET_CORE_STAGES = NET_STAGES.filter((s) => s.track === "core");
export const NET_STAGE_COUNT = NET_STAGES.length;

export function getNetStage(index: number): NetStageDef | undefined {
  return NET_STAGES.find((s) => s.index === index);
}

export function netStageUnlocked(stage: NetStageDef, passedStages: readonly number[]): boolean {
  if (!stage.unlockAfter || stage.unlockAfter.length === 0) {
    return stage.index === 1 || passedStages.includes(stage.index - 1);
  }
  return stage.unlockAfter.every((i) => passedStages.includes(i));
}

export function netPrefill(stage: NetStageDef, seed: number): NetTopology {
  return stage.build(netPlan(seed));
}

export function netRequiredMap(stage: NetStageDef, seed: number): Map<string, string> {
  return new Map(stage.required(netPlan(seed)));
}

export { formatCidr };
