/**
 * Stage definitions for the network lab. Four core stages walk the
 * "下一跳由谁决定" thread — host self-delivery, switch MAC learning,
 * the gateway handoff, router tables + default route — and one
 * challenge stage plants a mutual-default loop for TTL to catch.
 *
 * Topologies live in `planFor(stage, seed)` rather than here: the
 * address blocks are per-user seeded so copied configs don't transfer.
 * `editable` lists which fields the stage opens to the student; the
 * judge re-asserts every closed field from the prefill before running
 * cases (wire data is never trusted).
 */

export type NetEditCapability = "wire" | "address" | "gateway" | "routes" | "label";

export type NetStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  track: "core" | "challenge";
  railAfter?: number;
  unlockAfter?: number[];
  /** Fields the student may edit in this stage. */
  editable: NetEditCapability[];
  maxEvents: number;
  description: string;
  task: string;
  hint: string;
  judgeNote: string;
  takeaway: string;
};

export const NET_STAGES: NetStageDef[] = [
  {
    index: 1,
    id: "same-subnet",
    title: "同一网段才直接投递",
    englishTitle: "Same Subnet",
    track: "core",
    editable: ["address", "label"],
    maxEvents: 32,
    description: "两台主机一条线。能不能通，全看 IP 地址和子网掩码——同一网段，才谈得上「直接」。",
    task: "PC2 的地址配错了网段。把它改到和 PC1 同一网段，让两台主机互相 ping 通。",
    hint: "同网段判定：拿目的 IP 和自己的掩码做比较——网络号相同才算同段。改 IP 或者放宽掩码（比如都改成 /16）都可以。",
    judgeNote: "隐藏用例要求两个方向都能送达，并且发往网段外地址的包在源主机就被丢弃。",
    takeaway: "主机自己判同网段：同段直接投，跨段才需要帮手。",
  },
  {
    index: 2,
    id: "mac-table",
    title: "交换机先看 MAC 表",
    englishTitle: "Learning Switch",
    track: "core",
    editable: ["wire", "label"],
    maxEvents: 64,
    description: "三台主机一台交换机。第一个包交换机会「问所有人」，学过之后才知道往哪儿送。",
    task: "把三台主机分别接到 SW1 的空闲端口上（eth0 对任意 p 口），让任意两机互 ping 都通。",
    hint: "点主机卡上的 eth0，再点交换机上任意一个空口就完成一根线。主机地址本关已配好，只管连线。",
    judgeNote: "隐藏用例先看泛洪、再看学习后的单播，还会检查 MAC 表项落在哪台端口上。",
    takeaway: "交换机只认 MAC：表里没有就泛洪，学到之后走单播。",
  },
  {
    index: 3,
    id: "default-gateway",
    title: "跨网段交给网关",
    englishTitle: "Default Gateway",
    track: "core",
    editable: ["wire", "gateway", "label"],
    maxEvents: 64,
    description: "两个网段中间隔着一台路由器。主机的「默认网关」，就是它跨段时的第一跳。",
    task: "接好线（PC→交换机→R1→交换机→PC3），再给三台主机填默认网关：LAN-A 侧填 R1 的 LAN-A 地址，LAN-B 侧填 R1 的 LAN-B 地址。",
    hint: "网关必须是主机本网段里的地址——填到别的网段，主机自己就会拒绝（gateway-offlink）。",
    judgeNote: "隐藏用例覆盖：同段不绕路、跨段走 R1、双向都能通，以及发往无路由地址时的丢弃。",
    takeaway: "跨网段的下一跳不由主机决定，而是由网关接管——三层从这里开始。",
  },
  {
    index: 4,
    id: "routing-table",
    title: "路由表与默认网关",
    englishTitle: "Routing Tables",
    track: "core",
    editable: ["routes", "label"],
    maxEvents: 96,
    description: "两台路由器接力。每台路由器只看自己的路由表：直连网段 → 静态路由 → 默认路由兜底。",
    task: "检查员只配了去程：给 R2 补一条回 LAN-A 的路由，再给 R1 配一条指向 R2 的默认路由，让内外网都通。",
    hint: "路由写法：目的网段/前缀 + 下一跳。下一跳必须落在自己某个直连网段里（对端接口的地址）。",
    judgeNote: "隐藏用例检查去程、回程、默认路由兜底，以及发往未分配网段时应丢弃的负例。",
    takeaway: "路由是每跳独立决策：只配去程不配回程，一样不通。",
  },
  {
    index: 5,
    id: "ttl-loop",
    title: "TTL 耗尽：环路",
    englishTitle: "TTL & Loops",
    track: "challenge",
    railAfter: 4,
    unlockAfter: [4],
    editable: ["routes", "label"],
    maxEvents: 128,
    description: "挑战关：有人把 R1、R2 的默认路由互相指——发给未知地址的分组会永远打转。",
    task: "找出并删掉那条成环的默认路由，让未知目的在「无路由」处被正常丢弃，而不是耗尽 TTL。",
    hint: "跟着轨迹看：分组在 R1、R2 之间来回弹跳直到 TTL 归零的那一段，就是环路所在。",
    judgeNote: "隐藏用例要求正常地址照常送达、未知地址死于 no-route 而不是 ttl-exceeded。",
    takeaway: "TTL 是网络的自救机制：配置错了，它兜住无限循环的代价。",
  },
];

export const NET_CORE_STAGES = NET_STAGES.filter((s) => s.track === "core");

export function getNetStage(index: number): NetStageDef | undefined {
  return NET_STAGES.find((s) => s.index === index);
}

export function isNetStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getNetStage(index);
  if (!stage) return false;
  if (stage.unlockAfter) return stage.unlockAfter.every((i) => passedStages.includes(i));
  return index === 1 || passedStages.includes(index - 1);
}

export function nextNetStage(passedStages: readonly number[]): number {
  for (const stage of NET_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return NET_STAGES.length + 1;
}
