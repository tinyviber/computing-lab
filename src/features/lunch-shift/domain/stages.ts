/**
 * Stage table for the lunch-shift lab. Four stages for one class period:
 * walk one order by hand → fix intake by editing word tables (dicts and
 * lists) → fix queueing by writing priority() (a function) → AI semantic
 * intake on hidden orders, where need_confirm() prices uncertainty.
 * Stage 5 is an optional bonus that rides the stage-3 slot in the rail.
 *
 * Each stage keeps one task sentence. The judging method and the takeaway
 * are only shown after the stage is passed; `hints` are the three
 * self-opened levels (direction → first code line → observation question).
 */

export type LunchStageDef = {
  index: number;
  id: string;
  title: string;
  task: string;
  judgeNote: string;
  takeaway: string;
  /** Self-opened hint levels — omitted where the task needs none. */
  hints?: [string, string, string];
};

export const LUNCH_STAGES: LunchStageDef[] = [
  {
    index: 1,
    id: "order-journey",
    title: "订单旅程",
    task: "把顾客的话记成小票，选好先做哪张，再把餐送到正确的桌。",
    judgeNote: "服务器核对小票四个字段、先做哪张和送到的桌号，全对才算过。",
    takeaway: "小票是数据：一旦系统中某个环节出错，后面的流程全部跟着错。",
  },
  {
    index: 2,
    id: "fix-intake",
    title: "修接单",
    task: "有 12 句顾客原话。用字典和列表写死的信号词表（复习一下这两个数据结构），让 12 张小票全部记对。",
    judgeNote: "服务器拿你算出的四张词表重新读这 12 张原话，小票全对才过关。",
    takeaway: "认得全比背得多重要，通用词才盖得住没见过的说法。",
  },
  {
    index: 3,
    id: "fix-queue",
    title: "修排队",
    task: "这一关小票都录对了。复习函数：写 priority(urgent, wait, cook)，返回值越大越先做；加急单等满 9 拍、普通单等满 18 拍还没送到就算超时，至少 10 张准时过关。",
    judgeNote: "服务器拿你的结果表重排每一拍的选择：准时 10 张过关，12 张加星。",
    takeaway: "只认加急会饿死普通单，等太久的也该优先。",
    hints: [
      "加急的单，返回一个更大的数。",
      "第一行可以这样开头：if urgent: score = 1。",
      "超时的是加急单还是普通单？它等了几拍？加急给几分、等太久给几分，谁该更大？",
    ],
  },
  {
    index: 4,
    id: "ai-intake",
    title: "智能接单",
    task: "光一个付费加急就有「要加急」「付费加快」「加钱走急单」好几种说法，第二关写死的词表到了这批新订单就跟不上。这次换成 AI 语义接单：本地模型直接听顾客的话，给出小票和两个把握度分数。写 need_confirm(similarity, margin) 决定哪几单要让顾客再确认一遍：确认的单一定记对，但每张都让接单台停 1 拍。至少记对 11 张、确认 1～4 次过关。",
    judgeNote:
      "服务器把你标记确认的单按顾客复述记对（确认必对），没确认的单用 AI 的结果，再把所有小票放进第三关的队列模拟：小票正确数 ≥11 且确认次数在 1～4 之间才过关。",
    takeaway:
      "写死的词表永远追不上新的说法，现代信息系统用语义模型听懂没见过的表达，但要会为不确定性买单。",
    hints: [
      "similarity 低说明 AI 拿不准，margin 小说明前两名差不多，两个数一起看，先找出最没把握的单。",
      "第一行可以这样开头：if similarity < 0.75: return True。",
      "确认有预算：哪几单的分数最低？把确认留给他们，别浪费在 AI 本来就有把握的单上。",
    ],
  },
  {
    index: 5,
    id: "compensate",
    title: "附加挑战",
    task: "晚高峰 20 单按先来先做跑完，有的单送晚了、有的没送到。写 compensate(urgent, overtime, delivered, price) 给每张出问题的单选补偿：0 不补偿、1 送小食（2 元）、2 退款（送到的退一半，没送到的全退）。照店里的差评率表估计，预计差评不超过 4 单、补偿花费不超过 70 元才过关。",
    judgeNote:
      "服务器用同一套先来先做的跑法找出 11 张问题单，按你的结果表逐张查差评率和花费：两条线都压住才算过。",
    takeaway: "信息系统不只执行规则，也在做权衡：补偿太少伤顾客，补偿太多伤成本。",
    hints: [
      "差评率最高的是「没送到」的单，但全退一张牛肉面要 22 元，预算装不下几张。",
      "第一行可以这样开头：if not delivered and price <= 12: return 2。",
      "送到的单退款只要半价：比一比「每元降多少差评」，退哪几张最划算？",
    ],
  },
];

export function getLunchStage(index: number): LunchStageDef | undefined {
  return LUNCH_STAGES.find((stage) => stage.index === index);
}

/**
 * Stage-4 pass line, shared by the judge and the result view. Confirmed
 * orders always record correctly (the customer restated) but cost one
 * intake tick each. Measured on the hidden set, the clause-level model
 * lands 11–12 correct and flags its misses at low similarity/margin, so
 * an honest need_confirm passes with 2–4 confirmations while
 * always-confirm (12) and never-confirm (0) both fail.
 */
export const AI_PASS_CORRECT = 11;
export const AI_CONFIRM_BUDGET = 4;
export const AI_CONFIRM_MIN = 1;

/** Linear unlock: a stage opens once the previous one passed. */
export function lunchStageUnlocked(passedStages: readonly number[], index: number): boolean {
  // 附加挑战 rides alongside the formal challenge: passing priority is
  // all it needs.
  if (index === 5) return passedStages.includes(3);
  return index === 1 || passedStages.includes(index - 1);
}

export function nextLunchStage(passedStages: readonly number[]): number {
  for (const stage of LUNCH_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return LUNCH_STAGES.length + 1;
}
