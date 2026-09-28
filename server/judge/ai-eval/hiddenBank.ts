/**
 * ai-eval hidden bank — server-only. The judge corpus, question pools and
 * the C3 defect plan live here; the bundle only ever ships the public
 * sandbox pool (`PUBLIC_BANK` in domain/corpus.ts).
 *
 * Question pools are crafted against the scoring function:
 *   - C1 stable  : unique-keyword questions, wide top1 margin, temp 0
 *   - C1 wobbly  : sibling entries tied within eps(0.3) → draws flip
 *   - C1 volatile: shared-keyword triples at temp 0.8 → flip + corruption
 *   - C2         : each question has exactly one sensitive phrasing dim
 *                  (verified by hiddenBank tests + the judge's replay)
 *   - C3         : OOD questions confabulate; seeded in-domain draws carry a
 *                  planted slot corruption
 */

import type { DatabaseSync } from "node:sqlite";
import { seedFor } from "../../../src/shared/rng.ts";
import {
  truthOf,
  type EvalBank,
  type EvalQuestion,
  type FactEntry,
} from "../../../src/features/ai-eval/domain/corpus.ts";
import {
  drawIdOf,
  makeDrawRng,
  MATRIX_COLUMNS,
  MAX_REPEAT,
  PHRASING_DIMS,
  type Probe,
} from "../../../src/features/ai-eval/domain/probe.ts";
import {
  ask,
  defectFieldIds,
  plantCorruption,
  type Temp,
} from "../../../src/features/ai-eval/domain/responder.ts";
import { toDrawPayload } from "../../../src/features/ai-eval/domain/fixtures.ts";
import {
  C3_DRAW_COUNT,
  MAX_ISSUED,
  VERIFY_QUOTA,
  emptyAiEvalDraft,
  type AiEvalDraft,
  type AiEvalQuestionBrief,
  type DrawPayload,
  type IssuedDraw,
  type ServerDraftMarks,
} from "../../../src/features/ai-eval/domain/protocol.ts";
import type { ProjectRow } from "../pipeline.ts";
import { saveStageDraft, type LabJudgeError } from "../pipeline.ts";

/* ------------------------------ hidden corpus ------------------------ */

/**
 * Server-only fact table. Keyword sets are tuned so the C1/C2 pools produce
 * their labelled profiles — check the hiddenBank tests before editing.
 */
export const HIDDEN_CORPUS: FactEntry[] = [
  // 图书馆 sibling pair — wobbly probes hit both identically.
  {
    id: "h-lib-hours",
    topic: "图书馆",
    keywords: ["总馆", "闭馆", "几点", "时间", "熄灯"],
    slots: { time: "21:30", place: "东楼" },
    templates: [
      "总馆 {time} 闭馆，自习区在{place}。",
      "图书馆总馆开到 {time}，自习区{place}熄灯。",
    ],
    fact: "图书馆总馆 21:30 闭馆，自习区在东楼。",
  },
  {
    id: "h-lib-room",
    topic: "图书馆",
    keywords: ["分馆", "闭馆", "几点", "时间", "空调"],
    slots: { time: "22:00", place: "北楼二层" },
    templates: ["分馆 {time} 闭馆，在{place}。", "北楼分馆开到 {time}，在{place}。"],
    fact: "图书馆分馆 22:00 闭馆，在北楼二层。",
  },
  {
    id: "h-lib-fine",
    topic: "图书馆",
    keywords: ["逾期", "罚款", "每天", "多少钱"],
    slots: { num: "0.5" },
    templates: ["逾期每天罚 {num} 元。", "超期图书每天收 {num} 元。"],
    fact: "图书逾期每天罚款 0.5 元。",
  },
  {
    id: "h-lib-renew",
    topic: "图书馆",
    keywords: ["续借", "几次", "网上", "操作"],
    slots: { num: "2" },
    templates: ["最多可续借 {num} 次。", "续借 {num} 次，网上图书馆可操作。"],
    fact: "每册最多续借 2 次，在图书系统里操作。",
  },
  // 校门/宿舍 gate pair — wobbly probes share "几点/关门/进出".
  {
    id: "h-rule-gate",
    topic: "校规",
    keywords: ["校门", "几点", "关门", "进出"],
    slots: { time: "22:30" },
    templates: ["校门 {time} 关门。", "大门 {time} 关，之后凭卡进出。"],
    fact: "校门 22:30 关闭，之后刷卡进出。",
  },
  {
    id: "h-dorm-gate",
    topic: "校规",
    keywords: ["宿舍楼", "几点", "关门", "进出"],
    slots: { time: "23:00" },
    templates: ["宿舍门禁 {time}。", "宿舍 {time} 关门禁，晚归要登记。"],
    fact: "宿舍楼门禁 23:00，晚归需登记。",
  },
  {
    id: "h-rule-card",
    topic: "校园服务",
    keywords: ["学生证", "补办", "在哪", "找谁"],
    slots: { place: "行政楼学生处", name: "王老师" },
    templates: ["补办学生证去{place}，找{name}。", "学生证丢了到{place}补办，经办人{name}。"],
    fact: "学生证在行政楼学生处补办，经办人王老师。",
  },
  {
    id: "h-rule-bike",
    topic: "校规",
    keywords: ["自行车", "停放", "哪里", "车棚"],
    slots: { place: "东门车棚" },
    templates: ["自行车统一停{place}。", "校内自行车停放在{place}。"],
    fact: "自行车统一停放在东门车棚。",
  },
  {
    id: "h-course-evening",
    topic: "课程作息",
    keywords: ["晚自习", "几点", "开始", "在哪"],
    slots: { time: "18:30", place: "各班教室" },
    templates: ["晚自习 {time} 开始，在{place}。", "{time} 开始晚自习，地点{place}。"],
    fact: "晚自习 18:30 开始，在各班教室。",
  },
  {
    id: "h-course-exam",
    topic: "课程作息",
    keywords: ["周测", "周考", "什么时候", "安排", "每周"],
    slots: { time: "周五上午" },
    templates: ["周测安排在{time}。", "每周周测是{time}。"],
    fact: "周测安排在每周五上午。",
  },
  {
    id: "h-course-art",
    topic: "课程作息",
    keywords: ["美术课", "在哪", "教室", "上课"],
    slots: { place: "艺术楼201" },
    templates: ["美术课在{place}上。", "美术课教室是{place}。"],
    fact: "美术课在艺术楼 201 上。",
  },
  // 社团 sibling pair — wobbly probes share "几点/在哪/活动".
  {
    id: "h-club-debate",
    topic: "社团活动",
    keywords: ["辩论社", "几点", "在哪", "活动"],
    slots: { time: "周三16:00", place: "阶梯教室B" },
    templates: ["辩论社{time}活动，在{place}。", "辩论社活动在{place}，{time}。"],
    fact: "辩论社每周三 16:00 在阶梯教室 B 活动。",
  },
  {
    id: "h-club-photo",
    topic: "社团活动",
    keywords: ["摄影社", "几点", "在哪", "活动"],
    slots: { time: "周四17:00", place: "美术楼暗房" },
    templates: ["摄影社{time}活动，在{place}。", "摄影社活动在{place}，{time}。"],
    fact: "摄影社每周四 17:00 在美术楼暗房活动。",
  },
  {
    id: "h-canteen-dinner",
    topic: "食堂",
    keywords: ["食堂", "晚饭", "晚餐", "几点", "开餐"],
    slots: { time: "17:20" },
    templates: ["晚饭 {time} 开餐。", "食堂晚餐 {time} 供应。"],
    fact: "食堂晚餐 17:20 开始供应。",
  },
  {
    id: "h-canteen-breakfast",
    topic: "食堂",
    keywords: ["食堂", "早饭", "几点", "供应"],
    slots: { time: "6:50" },
    templates: ["早饭 {time} 开始供应。", "食堂早餐 {time} 供应。"],
    fact: "食堂早餐 6:50 开始供应。",
  },
  {
    id: "h-canteen-card",
    topic: "食堂",
    keywords: ["饭卡", "充值", "在哪", "窗口"],
    slots: { place: "食堂一楼3号窗口" },
    templates: ["饭卡充值在{place}。", "饭卡去{place}充值。"],
    fact: "饭卡充值在食堂一楼 3 号窗口办理。",
  },
  {
    id: "h-svc-print",
    topic: "校园服务",
    keywords: ["打印", "在哪", "多少钱", "一张"],
    slots: { place: "图文店", num: "0.2" },
    templates: ["打印在{place}，一张 {num} 元。", "{place}能打印，一张 {num} 元。"],
    fact: "打印在校内图文店，一张 0.2 元。",
  },
  {
    id: "h-svc-med",
    topic: "校园服务",
    keywords: ["医务室", "校医室", "在哪", "看病", "几点"],
    slots: { place: "综合楼一层", name: "校医" },
    templates: ["医务室在{place}，{name}坐诊。", "看病去{place}的医务室找{name}。"],
    fact: "医务室在综合楼一层，校医坐诊。",
  },
  {
    id: "h-svc-counsel",
    topic: "校园服务",
    keywords: ["心理", "咨询", "几点", "预约"],
    slots: { time: "周三下午", place: "综合楼305" },
    templates: ["心理咨询{time}开放，在{place}。", "心理咨询室在{place}，{time}开放。"],
    fact: "心理咨询周三下午开放，地点综合楼 305，需预约。",
  },
  {
    id: "h-svc-express",
    topic: "校园服务",
    keywords: ["快递", "在哪", "取件", "驿站"],
    slots: { place: "南门快递柜" },
    templates: ["快递在{place}取。", "取件去{place}。"],
    fact: "快递统一放在南门快递柜。",
  },
  {
    id: "h-event-lecture",
    topic: "活动安排",
    keywords: ["专家讲座", "什么时候", "报告厅"],
    slots: { time: "周四下午", place: "报告厅" },
    templates: ["专家讲座{time}，在{place}。", "{time}有专家讲座，地点{place}。"],
    fact: "专家讲座周四下午在报告厅举行。",
  },
  {
    id: "h-event-reading",
    topic: "活动安排",
    keywords: ["读书节", "阅读节", "哪天", "举办", "活动"],
    slots: { time: "4月23日", place: "图书馆" },
    templates: ["读书节{time}，主场地在{place}。", "{time}是读书节，活动在{place}。"],
    fact: "读书节 4 月 23 日，主场地在图书馆。",
  },
  // Route triple — volatile probes hit all three identically.
  {
    id: "h-route-lab",
    topic: "校园路线",
    keywords: ["实验楼", "在哪", "怎么走", "方位"],
    slots: { place: "东校区北侧" },
    templates: ["实验楼在{place}。", "实验楼在{place}，进东门直走。"],
    fact: "实验楼在东校区北侧。",
  },
  {
    id: "h-route-office",
    topic: "校园路线",
    keywords: ["行政楼", "在哪", "怎么走", "方位"],
    slots: { place: "校门左侧" },
    templates: ["行政楼在{place}。", "行政楼：{place}。"],
    fact: "行政楼在校门左侧。",
  },
  {
    id: "h-route-dorm",
    topic: "校园路线",
    keywords: ["宿舍楼", "在哪", "怎么走", "方位"],
    slots: { place: "生活区西侧" },
    templates: ["宿舍楼在{place}。", "宿舍楼：{place}，穿过食堂就是。"],
    fact: "宿舍楼在生活区西侧。",
  },
  {
    id: "h-lib-ebook",
    topic: "图书馆",
    keywords: ["电子书", "电子资源", "在哪", "平台"],
    slots: { place: "校园网图书馆平台" },
    templates: ["电子书在{place}看。", "电子资源走{place}。"],
    fact: "电子书在校园网图书馆平台。",
  },
  // Flip targets for C2 synonym-sensitive questions. "保健" nests inside
  // "保健室" so the synonym replacement lands two keyword hits at once.
  {
    id: "h-svc-nurse",
    topic: "校园服务",
    keywords: ["保健", "保健室", "在哪", "外伤"],
    slots: { place: "体育馆旁平房" },
    templates: ["保健室在{place}。", "外伤处理去{place}的保健室。"],
    fact: "保健室在体育馆旁平房。",
  },
  {
    id: "h-event-drift",
    topic: "活动安排",
    keywords: ["图书漂流", "漂流", "图书", "哪天", "活动"],
    slots: { time: "周三午休", place: "图书馆大厅" },
    templates: ["图书漂流{time}办，在{place}。", "图书漂流活动在{place}，{time}。"],
    fact: "图书漂流周三午休在图书馆大厅办。",
  },
  {
    id: "h-svc-lost",
    topic: "校园服务",
    keywords: ["挂失", "登记", "校园卡", "校园", "后勤"],
    slots: { place: "后勤服务大厅" },
    templates: ["挂失登记在{place}。", "校园卡挂失去{place}登记。"],
    fact: "校园卡挂失登记在后勤服务大厅办理。",
  },
];

/* ------------------------------ question pools ----------------------- */

/** C1 stable pool — unique keywords, wide margin (temp 0). */
const C1_STABLE: EvalQuestion[] = [
  {
    id: "c1s-card",
    category: "校园服务",
    text: "学生证丢了去哪补办？",
    targetEntryId: "h-rule-card",
    coreTerm: "学生证",
  },
  {
    id: "c1s-bike",
    category: "校规咨询",
    text: "自行车应该停放在哪里？",
    targetEntryId: "h-rule-bike",
    coreTerm: "自行车",
  },
  {
    id: "c1s-print",
    category: "校园服务",
    text: "打印一张纸多少钱，在哪儿打？",
    targetEntryId: "h-svc-print",
    coreTerm: "打印",
  },
  {
    id: "c1s-counsel",
    category: "校园服务",
    text: "心理咨询几点开放，怎么预约？",
    targetEntryId: "h-svc-counsel",
    coreTerm: "咨询",
  },
  {
    id: "c1s-fine",
    category: "图书馆服务",
    text: "逾期还书每天罚款多少钱？",
    targetEntryId: "h-lib-fine",
    coreTerm: "罚款",
  },
  {
    id: "c1s-art",
    category: "课程作息",
    text: "美术课在哪间教室上？",
    targetEntryId: "h-course-art",
    coreTerm: "美术课",
  },
];

/** C1 wobbly pool — sibling entries tie within eps(0.3) (temp 0.3). */
const C1_WOBBLY: EvalQuestion[] = [
  {
    id: "c1w-lib",
    category: "图书馆服务",
    text: "几点闭馆，什么时间熄灯？",
    targetEntryId: "h-lib-hours",
    coreTerm: "闭馆",
  },
  {
    id: "c1w-club",
    category: "社团活动",
    text: "社团活动几点开始，在哪办？",
    targetEntryId: "h-club-debate",
    coreTerm: "活动",
  },
  {
    id: "c1w-gate",
    category: "校规咨询",
    text: "几点关门，之后还能进出吗？",
    targetEntryId: "h-rule-gate",
    coreTerm: "关门",
  },
];

/**
 * C1 volatile pool — shared-keyword triples at temp 0.8: the flip zone plus
 * a high halluRate scatter draws across several distinct answers.
 */
const C1_VOLATILE: EvalQuestion[] = [
  {
    id: "c1v-route",
    category: "校园服务",
    text: "那个地方在什么方位，怎么走？",
    targetEntryId: "h-route-lab",
    coreTerm: "方位",
  },
  {
    id: "c1v-route2",
    category: "校园服务",
    text: "方位在哪，怎么走能到？",
    targetEntryId: "h-route-office",
    coreTerm: "方位",
  },
  {
    id: "c1v-med",
    category: "校园服务",
    text: "几点开门，在哪看病？",
    targetEntryId: "h-svc-med",
    coreTerm: "几点",
  },
];

export type C1Item = { question: EvalQuestion; temp: Temp };

function shuffled<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Per-user C1 assignment: 2 stable + 1 wobbly + 1 volatile, shuffled. */
export function c1Plan(seed: number): C1Item[] {
  const rng = makeDrawRng(seed, { questionId: "c1-plan", phrasing: [], k: 0 });
  const pool = <T>(arr: readonly T[], n: number): T[] => shuffled(arr, rng).slice(0, n);
  return shuffled(
    [
      ...pool(C1_STABLE, 2).map((question) => ({ question, temp: 0 as Temp })),
      ...pool(C1_WOBBLY, 1).map((question) => ({ question, temp: 0.3 as Temp })),
      ...pool(C1_VOLATILE, 1).map((question) => ({ question, temp: 0.8 as Temp })),
    ],
    rng,
  );
}

/**
 * C2 pool — every question is built so exactly one phrasing dim changes the
 * answer (asserted by hiddenBank tests): either `drop-core` (the term carries
 * the retrieval) or `synonym` (the replacement lands on a different entry).
 */
const C2_QUESTIONS: EvalQuestion[] = [
  // --- drop-core sensitive: text = {coreTerm + one shared helper} so the
  // residual falls below θ once the term is gone; the synonym is itself a
  // keyword of the same entry (closed loop → unchanged).
  {
    id: "c2-med",
    category: "校园服务",
    text: "医务室在哪儿？",
    targetEntryId: "h-svc-med",
    coreTerm: "医务室",
    synonym: "校医室",
  },
  {
    id: "c2-exam",
    category: "课程作息",
    text: "周测什么时候？",
    targetEntryId: "h-course-exam",
    coreTerm: "周测",
    synonym: "周考",
  },
  {
    id: "c2-reading",
    category: "活动安排",
    text: "读书节哪天？",
    targetEntryId: "h-event-reading",
    coreTerm: "读书节",
    synonym: "阅读节",
  },
  {
    id: "c2-dinner",
    category: "食堂服务",
    text: "晚饭几点？",
    targetEntryId: "h-canteen-dinner",
    coreTerm: "晚饭",
    synonym: "晚餐",
  },
  // --- synonym sensitive: the replacement double-hits a sibling entry's
  // nested keywords (保健 ⊂ 保健室, 校园 ⊂ 校园卡, 图书 ⊂ 图书漂流), flipping
  // top1 strictly; dropping the term leaves the target safely on top.
  {
    id: "c2-nurse",
    category: "校园服务",
    text: "医务室在哪看病？",
    targetEntryId: "h-svc-med",
    coreTerm: "医务室",
    synonym: "保健室",
  },
  {
    id: "c2-card",
    category: "校园服务",
    text: "学生证在哪补办找谁，挂失登记怎么办？",
    targetEntryId: "h-rule-card",
    coreTerm: "学生证",
    synonym: "校园卡",
  },
  {
    id: "c2-drift",
    category: "活动安排",
    text: "读书节哪天举办活动？",
    targetEntryId: "h-event-reading",
    coreTerm: "读书节",
    synonym: "图书漂流",
  },
];

export function c2Question(seed: number): EvalQuestion {
  const rng = makeDrawRng(seed, { questionId: "c2-pick", phrasing: [], k: 0 });
  return C2_QUESTIONS[Math.floor(rng() * C2_QUESTIONS.length)];
}

/** Out-of-domain questions — no corpus match → the responder confabulates. */
const C3_OOD: EvalQuestion[] = [
  {
    id: "c3-ood-history",
    category: "活动安排",
    text: "校史馆讲座几点结束？",
    targetEntryId: "",
    coreTerm: "讲座",
  },
  {
    id: "c3-ood-pool",
    category: "校园服务",
    text: "游泳馆要门票吗？",
    targetEntryId: "",
    coreTerm: "门票",
  },
  {
    id: "c3-ood-roof",
    category: "校园服务",
    text: "天文台开放日是哪天？",
    targetEntryId: "",
    coreTerm: "开放日",
  },
  {
    id: "c3-ood-park",
    category: "校园服务",
    text: "访客停车位怎么预约？",
    targetEntryId: "",
    coreTerm: "停车位",
  },
  {
    id: "c3-ood-laundry",
    category: "校园服务",
    text: "宿舍洗衣机要投币吗？",
    targetEntryId: "",
    coreTerm: "洗衣机",
  },
  {
    id: "c3-ood-post",
    category: "校园服务",
    text: "邮局几点下班？",
    targetEntryId: "",
    coreTerm: "邮局",
  },
];

/** In-domain C3 questions — clean or carrying a planted corruption. */
const C3_INDOMAIN: EvalQuestion[] = [
  {
    id: "c3-in-card",
    category: "校园服务",
    text: "学生证补办在哪办？",
    targetEntryId: "h-rule-card",
    coreTerm: "补办",
  },
  {
    id: "c3-in-dinner",
    category: "食堂服务",
    text: "食堂晚饭几点开餐？",
    targetEntryId: "h-canteen-dinner",
    coreTerm: "晚饭",
  },
  {
    id: "c3-in-exam",
    category: "课程作息",
    text: "周测什么时候安排？",
    targetEntryId: "h-course-exam",
    coreTerm: "周测",
  },
  {
    id: "c3-in-art",
    category: "课程作息",
    text: "美术课在哪间教室上？",
    targetEntryId: "h-course-art",
    coreTerm: "美术课",
  },
  {
    id: "c3-in-express",
    category: "校园服务",
    text: "快递在哪取件？",
    targetEntryId: "h-svc-express",
    coreTerm: "快递",
  },
  {
    id: "c3-in-lecture",
    category: "活动安排",
    text: "专家讲座什么时候，在哪？",
    targetEntryId: "h-event-lecture",
    coreTerm: "讲座",
  },
  {
    id: "c3-in-renew",
    category: "图书馆服务",
    text: "图书能续借几次，怎么操作？",
    targetEntryId: "h-lib-renew",
    coreTerm: "续借",
  },
  {
    id: "c3-in-breakfast",
    category: "食堂服务",
    text: "食堂早饭几点供应？",
    targetEntryId: "h-canteen-breakfast",
    coreTerm: "早饭",
  },
  {
    id: "c3-in-bike",
    category: "校规咨询",
    text: "自行车要停放在哪里？",
    targetEntryId: "h-rule-bike",
    coreTerm: "停放",
  },
  {
    id: "c3-in-ebook",
    category: "图书馆服务",
    text: "电子书在哪看？",
    targetEntryId: "h-lib-ebook",
    coreTerm: "电子书",
  },
  {
    id: "c3-in-recharge",
    category: "食堂服务",
    text: "饭卡在哪充值？",
    targetEntryId: "h-canteen-card",
    coreTerm: "饭卡",
  },
  {
    id: "c3-in-reading",
    category: "活动安排",
    text: "读书节哪天办活动？",
    targetEntryId: "h-event-reading",
    coreTerm: "读书节",
  },
];

export type C3PlanItem = { question: EvalQuestion; force: "clean" | "confab" | "corrupt" };

/**
 * The 10-dispense C3 plan: ≥2 confabulated (OOD questions) + ≥2 corrupted
 * (planted on in-domain ones), the rest clean; order seeded per user.
 */
export function c3Plan(seed: number): C3PlanItem[] {
  const rng = makeDrawRng(seed, { questionId: "c3-plan", phrasing: [], k: 0 });
  const pool = <T>(arr: readonly T[], n: number): T[] => shuffled(arr, rng).slice(0, n);
  const items: C3PlanItem[] = [
    ...pool(C3_OOD, 2).map((question) => ({ question, force: "confab" as const })),
    ...pool(C3_INDOMAIN, 8).map((question, i) => ({
      question,
      force: (i < 2 ? "corrupt" : "clean") as C3PlanItem["force"],
    })),
  ];
  return shuffled(items, rng).slice(0, C3_DRAW_COUNT);
}

/* ------------------------------- draw core ---------------------------- */

export const HIDDEN_BANK: EvalBank = {
  corpus: HIDDEN_CORPUS,
  questions: [
    ...C1_STABLE,
    ...C1_WOBBLY,
    ...C1_VOLATILE,
    ...C2_QUESTIONS,
    ...C3_OOD,
    ...C3_INDOMAIN,
  ],
};

export function stageSeedFor(userId: string, stageIndex: number): number {
  return seedFor(userId, "ai-eval", stageIndex);
}

/** C3 probes use the dispense cursor `*` — the plan supplies the question. */
export const C3_CURSOR = "*";

type ResolvedProbe = {
  question: EvalQuestion;
  temp: Temp;
  force: C3PlanItem["force"] | null;
};

function resolveProbe(seed: number, stageIndex: number, probe: Probe): ResolvedProbe | null {
  if (stageIndex === 1) {
    const item = c1Plan(seed).find((i) => i.question.id === probe.questionId);
    if (!item || probe.phrasing.length > 0 || probe.k >= MAX_REPEAT) return null;
    return { question: item.question, temp: item.temp, force: null };
  }
  if (stageIndex === 2) {
    const question = c2Question(seed);
    const dims = new Set<string>(PHRASING_DIMS.map((d) => d.id));
    const validPhrasing = probe.phrasing.length <= 1 && probe.phrasing.every((d) => dims.has(d));
    if (question.id !== probe.questionId || !validPhrasing || probe.k >= 3) return null;
    return { question, temp: 0, force: null };
  }
  if (stageIndex === 3) {
    if (probe.questionId !== C3_CURSOR || probe.phrasing.length > 0) return null;
    const item = c3Plan(seed)[probe.k];
    if (!item) return null;
    return { question: item.question, temp: 0.3, force: item.force };
  }
  return null;
}

/**
 * The pure draw: `(userId, stage, probe) → payload`. Deterministic — the
 * judge replays it verbatim when replaying transcripts, and /verify replays
 * it to resolve a slot's fieldId.
 */
export function produceDraw(userId: string, stageIndex: number, probe: Probe): DrawPayload | null {
  const seed = stageSeedFor(userId, stageIndex);
  const resolved = resolveProbe(seed, stageIndex, probe);
  if (!resolved) return null;
  const rng = makeDrawRng(seed, probe);
  const answer = ask(
    { ...probe, questionId: resolved.question.id },
    HIDDEN_BANK,
    resolved.temp,
    rng,
  );
  if (resolved.force === "corrupt" && defectFieldIds(answer, HIDDEN_CORPUS).length === 0) {
    plantCorruption(answer, HIDDEN_CORPUS, rng);
  }
  return toDrawPayload(probe, resolved.question, answer, drawIdOf(seed, probe));
}

/* ------------------------- issued / verify ledger --------------------- */

function marksOf(draft: AiEvalDraft | undefined): ServerDraftMarks {
  return draft?._srv ?? { seq: 0, issued: [], firstDrawSeq: null };
}

function brief(question: EvalQuestion): AiEvalQuestionBrief {
  return { id: question.id, text: question.text, category: question.category };
}

/** Questions the client may render for a stage (from GET /project extras). */
export function projectExtras(project: ProjectRow<AiEvalDraft>): Record<string, unknown> {
  const seed1 = stageSeedFor(project.userId, 1);
  const seed2 = stageSeedFor(project.userId, 2);
  return {
    aiEval: {
      stages: {
        "1": { questions: c1Plan(seed1).map((i) => brief(i.question)) },
        "2": { question: brief(c2Question(seed2)), columns: MATRIX_COLUMNS },
        "3": { quota: VERIFY_QUOTA, drawCount: C3_DRAW_COUNT },
      },
    },
  };
}

/** Key-order-insensitive comparison — same mapping is not a change. */
function predictionsEqual(a: AiEvalDraft["predictions"], b: AiEvalDraft["predictions"]): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (a[k as keyof typeof a] !== b[k as keyof typeof b]) return false;
  }
  return true;
}

/** Stamp `predictedAt` when the stored C2 predictions change. */
export function stampPredictionChange(
  draft: AiEvalDraft,
  prior: AiEvalDraft | undefined,
): AiEvalDraft {
  if (predictionsEqual(draft.predictions, prior?.predictions ?? {})) {
    return draft;
  }
  const srv = { seq: 0, issued: [] as IssuedDraw[], firstDrawSeq: null, ...draft._srv };
  srv.seq += 1;
  return { ...draft, predictedAt: srv.seq, _srv: srv };
}

/**
 * POST /draws: validate probes against the stage's plan, issue new draws
 * into the draft's `_srv.issued` ledger (idempotent — a re-sent probe returns
 * its original draw), and return the payloads.
 */
export function issueDraws(
  db: DatabaseSync,
  project: ProjectRow<AiEvalDraft>,
  stageIndex: number,
  probes: Probe[],
): { draws: DrawPayload[] } | LabJudgeError {
  const stored = project.drafts[String(stageIndex)];

  // C2: predictions must be persisted before the first draw is issued.
  if (stageIndex === 2 && Object.keys(stored?.predictions ?? {}).length === 0) {
    return { error: "prediction-required", status: 409 };
  }

  const srv = marksOf(stored);
  const issued = [...srv.issued];
  let seq = srv.seq;
  let firstDrawSeq = srv.firstDrawSeq;

  const draws: DrawPayload[] = [];
  for (const probe of probes) {
    const payload = produceDraw(project.userId, stageIndex, probe);
    if (!payload) return { error: "invalid-probe", status: 400 };
    if (!issued.some((i) => i.drawId === payload.drawId)) {
      if (issued.length >= MAX_ISSUED) return { error: "draw-exhausted", status: 409 };
      // C3 is a sequential dispense: a new draw's k must be the cursor.
      if (stageIndex === 3 && probe.k !== issued.length) {
        return { error: "invalid-probe", status: 400 };
      }
      seq += 1;
      issued.push({ probe, drawId: payload.drawId, seq });
      if (firstDrawSeq === null) firstDrawSeq = seq;
    }
    draws.push(payload);
  }

  const merged: AiEvalDraft = {
    ...(stored ?? emptyAiEvalDraft()),
    _srv: { seq, issued, firstDrawSeq },
  };
  saveStageDraft(db, project, stageIndex, merged);
  return { draws };
}

/**
 * POST /reset-predictions: clear persisted C2 predictions + predictedAt so a
 * misclick isn't a permanent seal. Only legal before the first draw of the
 * stage — once `firstDrawSeq` exists the prediction→draw ordering is
 * evidence and must stay on file.
 */
export function resetPredictions(
  db: DatabaseSync,
  project: ProjectRow<AiEvalDraft>,
  stageIndex: number,
): { ok: true } | LabJudgeError {
  if (stageIndex !== 2) return { error: "invalid-stage", status: 400 };
  const stored = project.drafts[String(stageIndex)];
  const srv = marksOf(stored);
  if (srv.firstDrawSeq !== null || srv.issued.length > 0) {
    return { error: "draws-issued", status: 409 };
  }
  saveStageDraft(db, project, stageIndex, {
    ...(stored ?? emptyAiEvalDraft()),
    predictions: {},
    predictedAt: null,
  });
  return { ok: true };
}

/**
 * POST /verify: reveal the truth of one slot of an issued draw. Counts a
 * per-(user,lab,stage) quota of VERIFY_QUOTA calls and appends the fieldId
 * to the draft's verifyLog — the judge only accepts cited fieldIds from it.
 */
export function verifySlot(
  db: DatabaseSync,
  project: ProjectRow<AiEvalDraft>,
  stageIndex: number,
  drawId: string,
  slotIndex: number,
): { fieldId: string; truth: string | null; quotaLeft: number } | LabJudgeError {
  const stored = project.drafts[String(stageIndex)];
  const srv = marksOf(stored);
  const issuedEntry = srv.issued.find((i) => i.drawId === drawId);
  if (!issuedEntry) return { error: "unknown-draw", status: 400 };

  const verifyLog = stored?.verifyLog ?? [];
  if (verifyLog.length >= VERIFY_QUOTA) return { error: "quota-exceeded", status: 409 };

  const payload = produceDraw(project.userId, stageIndex, issuedEntry.probe);
  const slot = payload?.slots[slotIndex];
  if (!payload || !slot) return { error: "invalid-slot", status: 400 };

  const truth = truthOf(HIDDEN_CORPUS, slot.fieldId);
  const merged: AiEvalDraft = {
    ...(stored ?? emptyAiEvalDraft()),
    verifyLog: [...verifyLog, slot.fieldId],
    _srv: { ...srv, seq: srv.seq + 1 },
  };
  saveStageDraft(db, project, stageIndex, merged);
  return { fieldId: slot.fieldId, truth, quotaLeft: VERIFY_QUOTA - verifyLog.length - 1 };
}
