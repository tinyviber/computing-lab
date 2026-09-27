/**
 * Stage ladder for the greenhouse lab. MVP ships the first three core
 * stages only (issue §4/§9 first batch):
 *
 *   C1 大棚会自己变 — a canned setpoint controller; the learner only
 *       moves the target temperature and watches the loop run.
 *   C2 开关规则我写 — the rule table opens: condition → actuator rows,
 *       first hit wins, no hit = hold.
 *   C3 风机别抖 — same editor, but the judge also charges switchCount:
 *       zero dead zone means the actuator chatters itself to death.
 *
 * C4/C5 and X1–X3 are a second batch; the stage array deliberately
 * contains exactly these three.
 */

import type { ActuatorId, SensorId } from "./model.ts";
import type { GhDraft } from "./protocol.ts";

export type GhStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  track: "core" | "challenge";
  /** Optional explicit prerequisite list; absent = linear unlock (n-1). */
  unlockAfter?: number[];
  /** "setpoint" = C1's canned controller; "rules" = the editable table. */
  control: "setpoint" | "rules";
  /** Sensors a rule condition may reference in this stage. */
  sensors: readonly SensorId[];
  /** Actuators a rule row may drive in this stage. */
  actuators: readonly ActuatorId[];
  maxRules: number;
  /** Starting draft for a fresh stage (deep-copied on first entry). */
  prefill: GhDraft;
  description: string;
  task: string;
  hint: string;
  judgeNote: string;
  takeaway: string;
};

export const GREENHOUSE_STAGES: GhStageDef[] = [
  {
    index: 1,
    id: "watch-it-run",
    title: "大棚会自己变",
    englishTitle: "Setpoint",
    track: "core",
    control: "setpoint",
    sensors: ["airTemp"],
    actuators: ["heater", "fan"],
    maxRules: 0,
    prefill: { setpoint: 22 },
    description:
      "一座智慧大棚里，气温每 15 分钟更新一拍：白天外界在升温、夜里在降温，加热器和风扇试着拉住它。先读懂「传感器 → 控制器 → 执行器 → 环境」这个环怎么转。",
    task: "大棚内置了「设定值控制器」：你只调目标温度（16–28°C）。先预测再验证——设定值拉到 28°C，寒潮夜能守住下限吗？调好设定值后按「试运行」看一天的温度曲线。",
    hint: "系统手册：加热器每拍 +1.8°C，风扇每拍 −1.2°C；环境每拍向外界回摆约 1/12。控制器自带 1.5°C 死区——低于设定值 1.5°C 才加热，高于 1.5°C 才开风扇。",
    judgeNote:
      "服务器会在多组「外界天气 × 初始温度」场景里跑全天仿真，要求大部分时间落在目标带内；贴边的设定值会在极端天气里崩盘。",
    takeaway:
      "下一刻的环境 = 外界扰动 + 执行器动作 + 惯性——设定值只是告诉环要去哪，路还得一步一步走。",
  },
  {
    index: 2,
    id: "write-the-rules",
    title: "开关规则我写",
    englishTitle: "Rule Table",
    track: "core",
    control: "rules",
    sensors: ["airTemp"],
    actuators: ["heater", "fan"],
    maxRules: 4,
    prefill: {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">=", value: 270 },
          actuator: "fan",
          set: "on",
        },
      ],
    },
    description:
      "现在控制器交给你写：一行 =「当 读数 满足条件 时，让 执行器 开/关」。每拍按行从上往下找，每台执行器执行第一条命中的行；一行都没命中，执行器就保持原状。",
    task: "用不超过 4 行规则，让大棚全天守住 18–28°C。注意：写了「加热器 开」，还得告诉它什么时候「关」——不写关，它就一直开着。",
    hint: "先把预置的「风扇 开」补上「风扇 关」，再写两条加热器的规则。右侧会回显每一行的白话含义，以及「现在 T=… 时你的规则会怎么做」。",
    judgeNote:
      "隐藏场景约 12 组，都带升温也有回落——只写开不写关的规则必挂，死活不动作的规则同样过不了。",
    takeaway: "规则的唯一输入是读数；「无命中 = 保持」意味着每一拍的决定都建立在上一次的基础上。",
  },
  {
    index: 3,
    id: "stop-the-chatter",
    title: "风机别抖",
    englishTitle: "Hysteresis",
    track: "core",
    control: "rules",
    sensors: ["airTemp"],
    actuators: ["heater", "fan"],
    maxRules: 6,
    prefill: {
      rules: [
        {
          when: { kind: "leaf", sensor: "airTemp", op: ">=", value: 270 },
          actuator: "fan",
          set: "on",
        },
        {
          when: { kind: "leaf", sensor: "airTemp", op: "<", value: 270 },
          actuator: "fan",
          set: "off",
        },
      ],
    },
    description:
      "同一套编辑器，同一个大棚——但这次的天气专挑阈值线附近慢慢晃。一条「≥27 开、<27 关」的规则会让风机来回跳：开、关、开、关……温度是稳了，设备寿命被磨光了。",
    task: "把开关阈值拆成两行（例如 ≥28.0 才开、≤24.5 才关），让风机和加热器每天启停各不超过 8 次，同时仍守住温度带。",
    hint: "两条条件之间留出的「死区」越宽，切换越少、温度带越松。先照抄上一关的阈值，再把它们慢慢拉开。",
    judgeNote:
      "隐藏场景约 16 组缓摆天气，同时卡「在带率」和「切换次数」——死区为 0 的写法会在临界线上抖到超时。",
    takeaway:
      "「不动作」也是控制决策：死区用一点精度换执行器寿命——空调不是到 26° 就关、27° 又开的。",
  },
];

export const GREENHOUSE_CORE_STAGES = GREENHOUSE_STAGES.filter((s) => s.track === "core");

export function getGhStage(index: number): GhStageDef | undefined {
  return GREENHOUSE_STAGES.find((s) => s.index === index);
}

/** Core stages unlock linearly. */
export function greenhouseStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getGhStage(index);
  if (!stage) return false;
  if (stage.unlockAfter) return stage.unlockAfter.every((i) => passedStages.includes(i));
  return index === 1 || passedStages.includes(index - 1);
}

/** The mainline pointer: first unpassed stage by index. */
export function nextGreenhouseStage(passedStages: readonly number[]): number {
  for (const stage of GREENHOUSE_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return GREENHOUSE_STAGES.length + 1;
}
