/**
 * Stage table for the lunch-shift lab. Four stages for one class period:
 * walk one order by hand → organize intake with hand-written dict/list
 * word tables → fix queueing by writing priority() (a function) → run
 * the whole restaurant with AI intake: need_confirm() learns to price
 * uncertainty on practice orders, then intake plus queueing run hidden
 * orders under a confirmation budget and a service deadline. Stage 5 is
 * an optional bonus that rides the stage-3 slot.
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
    task: "接单台靠四张词表把顾客的原话记成小票：dish_words 和 note_words 是字典（原话里的词 → 要记的值），calm_words 和 rush_words 是列表（原话命中列表里的词，时效就有答案）。下面 6 张订单的应记小票都印出来了，代码里留了 6 个 ____ 空——照着填上，6 张小票全对过关。",
    judgeNote:
      "服务器用同一套固定程序读你的四张词表，把 6 句原话重新记成小票：6 张全对才过关，每张错在哪个字段会直接标出来。",
    takeaway:
      "字典和列表让计算机按规则组织信息：词表认得出的记对，认不出的就记错——所以写死的词表只认写过的词，第四关会换成能听陌生说法的 AI。",
    hints: [
      "每个 ____ 是要换掉的占位符：字典右边填菜单上的菜名或备注，列表里填原话里出现的词。",
      '对着订单表填：W3 的「炒饭」在菜单上叫「蛋炒饭」，所以 dish_words 里 "炒饭" 要对应 "蛋炒饭"。',
      "W4 说「不急着吃」：只在 rush_words 补「急着」会把它误记成加急——calm_words 先查，得同时有「不急着」把它挡回普通单。",
    ],
  },
  {
    index: 3,
    id: "fix-queue",
    title: "修排队",
    task: "这一关小票都录对了。复习函数：写 priority(urgent, wait, cook)，返回值越大越先做。店里的排单规定：算算每张单还剩几拍就超时（加急单 9 拍、普通单 18 拍，减掉已经等的），剩下最少的先做；一样少就先来先做。这次先按剩余等待时间排单，制作时间 cook 这一关不参与计算。服务器拿 12 张排队情况卡判你的函数有没有把这条规定写对：每张卡给几张在等的单，答对 11 张过关，12 张全对加星。",
    judgeNote:
      "服务器把你的结果表带进 12 张情况卡逐张判：只看加急会饿死普通单，只认等待会饿死加急，两边都用上才够 11 张。",
    takeaway: "只认加急会饿死普通单，只认等待会饿死加急，最等不起的先做。",
    hints: [
      "加急的单，返回一个更大的数。",
      "第一行可以这样开头：if urgent: score = 1。",
      "店里的规定是谁剩得最少谁先做：加急剩 9−wait 拍，普通剩 18−wait 拍，一样多就先到先做。",
    ],
  },
  {
    index: 4,
    id: "ai-intake",
    title: "智能接单",
    task: "第二关的词表只认写过的词——「加钱走急单」这种说法它就跟不上。这一关换上 AI 接单台：浏览器里的本地模型直接听顾客的话记小票，还给两个把握度分数 similarity 和 margin。写 need_confirm(similarity, margin) 挑出拿不准的单让顾客再确认一遍：确认的单一定记对，但每单让接单台停 1 拍。先在带标准答案的练习订单上调好函数，再上 12 张正式订单：小票全对、确认不超过 4 次、记对且准时至少 11 张才过关。",
    judgeNote:
      "服务器把你标记确认的单按顾客复述记对（确认必对但停 1 拍），没确认的单用 AI 的结果，再把所有小票放进第三关的队列模拟：12 张全对、确认 ≤4 次且记对且准时 ≥11 张才过关。",
    takeaway:
      "词表只能认写过的词，AI 能听懂没见过的说法但会拿不准——现代信息系统靠把握度决定什么时候该再问一遍：多问一句要花钱，记错一张要出事。",
    hints: [
      "similarity 低说明 AI 拿不准，margin 小说明前两名差不多——先在练习订单上找出分数最低的那几单。",
      "第一行可以这样开头：if similarity < 0.75: return True。",
      "确认有预算：哪几单的分数最低？把确认留给它们，别浪费在 AI 本来就有把握的单上。",
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
 * AI-intake pass lines for stage 4, shared by the judge and the result
 * views. Confirmed orders always record correctly (the customer
 * restated) but cost one intake tick each. Measured on both order sets,
 * the clause-level model flags its misses at low similarity/margin, so
 * an honest need_confirm passes with 2–4 confirmations while
 * always-confirm (12) and never-confirm both fail. The pass additionally
 * requires the queue run to serve ≥11 tickets both correctly and on
 * time — confirmations stall intake and can cost a delivery.
 */
export const AI_PASS_CORRECT = 12;
export const AI_CONFIRM_BUDGET = 4;
export const AI_SERVED_MIN = 11;

/**
 * Stage-3 pass line: probes passed out of QUEUE_PROBES. One miss of
 * slack is allowed; single-axis tables can't reach it — urgent-first
 * wins only the 3 加急要快 probes, FIFO/wait-only win the 9 wait probes
 * but lose all 3 urgent ones (queueProbes.ts, locked by engine.test.ts).
 */
export const QUEUE_PASS = 11;

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
