/**
 * Stage definitions for the information-system lab. Five core stages
 * walk the book-lending scenario from "wire one sensor to a db" up to a
 * human-in-the-loop approval and a threshold-triggered actuator; one
 * challenge stage adds fault injection with a fan-out replica.
 *
 * Prefill nodes are `fixed` furniture — scenarios reference them by id
 * in `script` entries, so ids here are part of the case contract.
 * Sensors that the script drives carry `fixedParams` so students can't
 * retune a calibrated device; everything else stays editable.
 */

import type { IsNode, IsNodeKind, IsTopology } from "./model.ts";
import { defaultParamsFor } from "./model.ts";

export type IsStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  track: "core" | "challenge";
  railAfter?: number;
  unlockAfter?: number[];
  /** Device kinds the palette offers in this stage. */
  devices: IsNodeKind[];
  maxDevices: number;
  maxEvents: number;
  prefill: IsTopology;
  description: string;
  task: string;
  hint: string;
  judgeNote: string;
  takeaway: string;
};

const N = (
  id: string,
  kind: IsNodeKind,
  label: string,
  x: number,
  y: number,
  params: IsNode["params"] = {},
  fixedParams = false,
): IsNode => ({
  id,
  kind,
  label,
  x,
  y,
  fixed: true,
  fixedParams: fixedParams || undefined,
  params: { ...defaultParamsFor(kind), ...params },
});

const S1_PREFILL: IsTopology = {
  nodes: [
    N("scan", "sensor", "扫码枪", 0, 0, { interval: 0 }, true),
    N("books", "db", "书目库", 3, 0),
  ],
  links: [],
};

const S2_PREFILL: IsTopology = {
  nodes: [
    N("scan-a", "sensor", "扫码枪 A", 0, 0, { interval: 0 }, true),
    N("scan-b", "sensor", "扫码枪 B", 0, 1, { interval: 0 }, true),
    N("books", "db", "书目库", 3, 0),
  ],
  links: [],
};

const S3_PREFILL: IsTopology = {
  nodes: [
    N("scan", "sensor", "扫码枪", 0, 0, { interval: 0 }, true),
    N("books", "db", "书目库", 2, 0),
    N("desk", "dashboard", "服务台", 3, 0),
  ],
  links: [],
};

const S4_PREFILL: IsTopology = {
  nodes: [
    N("scan-borrow", "sensor", "借书扫码", 0, 0, { interval: 0 }, true),
    N("scan-return", "sensor", "还书扫码", 0, 1, { interval: 0 }, true),
    N("librarian", "human", "管理员", 2, 1, { workDelay: 2 }),
    N("books", "db", "书目库", 3, 0),
  ],
  links: [],
};

const S5_PREFILL: IsTopology = {
  nodes: [
    N("temp", "sensor", "温度传感器", 0, 0, { interval: 0, base: 0, noise: 0 }, true),
    N("sprinkler", "actuator", "喷淋", 2, 0, { threshold: 80 }),
    N("board", "dashboard", "大棚看板", 3, 0),
  ],
  links: [],
};

const X6_PREFILL: IsTopology = {
  nodes: [
    N("scan", "sensor", "扫码枪", 0, 0, { interval: 0 }, true),
    N("gw", "gateway", "汇聚网关", 1, 0),
    N("db-main", "db", "主库", 2, 0),
    N("db-copy", "db", "副本库", 3, 0),
  ],
  links: [],
};

export const IS_SIM_STAGES: IsStageDef[] = [
  {
    index: 1,
    id: "first-contact",
    title: "让数据流起来",
    englishTitle: "First Contact",
    track: "core",
    devices: ["sensor", "db"],
    maxDevices: 8,
    maxEvents: 128,
    prefill: S1_PREFILL,
    description: "一个小型信息系统从一条数据链路开始：采集点产生事件，数据库把它记下来。",
    task: "把「扫码枪」的输出口连到「书目库」的写入口，让每一次扫码都成为一条借阅记录。",
    hint: "先在画布上选中扫码枪，再选它的「输出」口，点选书目库的「写入」口即可完成连线。",
    judgeNote: "隐藏用例会发送多笔借阅事件，并要求一条都不丢。",
    takeaway: "数据链路 = 产生 → 传输 → 入库，这是信息系统的最小骨架。",
  },
  {
    index: 2,
    id: "merge-two-sensors",
    title: "两台扫码枪要汇流",
    englishTitle: "Merge",
    track: "core",
    devices: ["sensor", "gateway", "db"],
    maxDevices: 8,
    maxEvents: 128,
    prefill: S2_PREFILL,
    description: "图书馆新添了一台扫码枪。但数据库的写入口只接受一条线——多源数据需要先汇合。",
    task: "从调色板加入一台「网关」，把两台扫码枪分别接到网关的 a、b 口，再把网关输出接到书目库写入。",
    hint: "每个输入口只能接一根线；如果两台扫码枪都直接连写入口，其中一台的数据会丢。",
    judgeNote: "隐藏用例会让两台扫码枪各发若干笔，书目库必须一笔不少。",
    takeaway: "网关是多源汇聚点：n 条输入，1 条输出。",
  },
  {
    index: 3,
    id: "receipt",
    title: "给读者一个回执",
    englishTitle: "Receipt",
    track: "core",
    devices: ["sensor", "gateway", "db", "dashboard"],
    maxDevices: 8,
    maxEvents: 128,
    prefill: S3_PREFILL,
    description: "写完数据库，读者怎么知道借成功了？数据库的「结果」口会回执写入后的记录数。",
    task: "连好扫码链路，再把「书目库」的结果口接到「服务台」看板，让每笔借阅都有回执。",
    hint: "看板是只读节点——它只显示收到的数据，不会再往外发。",
    judgeNote: "隐藏用例要求看板收到的回执数与写入笔数一致。",
    takeaway: "可观测性：给用户看得见的反馈，是信息系统闭环的一部分。",
  },
  {
    index: 4,
    id: "human-approval",
    title: "还书要人工核准",
    englishTitle: "Human in the Loop",
    track: "core",
    devices: ["sensor", "gateway", "db", "dashboard", "human"],
    maxDevices: 8,
    maxEvents: 256,
    prefill: S4_PREFILL,
    description: "借书自动入账，但删除书目记录必须经过管理员确认——不是每条链路都应该全自动。",
    task: "借书扫码 → 书目库写入；还书扫码 → 管理员 → 书目库删除口。缺了人工位，就是绕过审批。",
    hint: "管理员是串行的：一件一件处理，耗时由「处理耗时」决定；排队太多会积压。",
    judgeNote: "隐藏用例同时检查：未经人工的删除会被判违规，积压未处理的请求也算失败。",
    takeaway: "信息系统要分清：哪些环节能自动化，哪些必须留给人。",
  },
  {
    index: 5,
    id: "greenhouse",
    title: "大棚要会自己调温",
    englishTitle: "Feedback",
    track: "core",
    devices: ["sensor", "gateway", "actuator", "dashboard"],
    maxDevices: 8,
    maxEvents: 256,
    prefill: S5_PREFILL,
    description: "智慧大棚里，温度传感器持续上报读数；超过阈值时喷淋应当自动启动——感知驱动执行。",
    task: "温度读数 ≥ 60 时喷淋启动。把温度传感器接到「喷淋」的输入口、喷淋输出接到看板，并把喷淋的触发阈值改为 60（当前是 80）。",
    hint: "执行器规则：读数 ≥ 阈值时发出「动作」，回落后发出「复位」。阈值在设备卡片上设置。",
    judgeNote: "隐藏用例用不同温度序列检查阈值是否恰好生效——偏高偏低都算错。",
    takeaway: "感知 → 判定 → 执行：这是物联网反馈回路的最小形态。",
  },
  {
    index: 6,
    id: "failover-replica",
    title: "主库宕机，副本顶上",
    englishTitle: "Failover",
    track: "challenge",
    railAfter: 5,
    unlockAfter: [5],
    devices: ["sensor", "gateway", "db", "actuator", "dashboard", "human"],
    maxDevices: 8,
    maxEvents: 256,
    prefill: X6_PREFILL,
    description: "挑战关：写入进行到一半，主库宕机。好在系统有副本——前提是同一笔数据写进了两个库。",
    task: "扫码枪 → 网关；网关的输出同时扇出到主库和副本库的写入口。",
    hint: "一个输出口可以连多条线（广播）；只有输入口才要求唯一驱动。",
    judgeNote: "隐藏用例会在中途宕掉主库或剪断它的线，副本库必须收齐全部记录。",
    takeaway: "冗余副本 + 扇出写入，是最朴素的容错设计。",
  },
];

export const IS_SIM_CORE_STAGES = IS_SIM_STAGES.filter((s) => s.track === "core");

export function getIsStage(index: number): IsStageDef | undefined {
  return IS_SIM_STAGES.find((s) => s.index === index);
}

/**
 * Core stages unlock linearly; the challenge (stage 6) needs its explicit
 * prerequisite in unlockAfter.
 */
export function isSimStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getIsStage(index);
  if (!stage) return false;
  if (stage.unlockAfter) return stage.unlockAfter.every((i) => passedStages.includes(i));
  return index === 1 || passedStages.includes(index - 1);
}

/**
 * The mainline pointer: first unpassed stage by index — after the core
 * line is done it points at the challenge, then one past the last stage.
 */
export function nextIsSimStage(passedStages: readonly number[]): number {
  for (const stage of IS_SIM_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return IS_SIM_STAGES.length + 1;
}
