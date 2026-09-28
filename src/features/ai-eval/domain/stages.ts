/**
 * ai-eval stage ladder — MVP core C1–C3 (issue #61 §4 first batch).
 *
 *   C1 问三遍        — same question asked N times: measure stability
 *   C2 换个问法试试   — phrasing sensitivity matrix, predict-first
 *   C3 它会一本正经地编 — hallucination adjudication with a verify quota
 *
 * Honesty framing (graded): the intro states plainly that 校园百事通 is a
 * scripted retrieval responder with planted defects; the closing copy frames
 * every conclusion as applying to retrieval-style responders — ≠ 真 LLM.
 */

export type AiEvalStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  track: "core";
  description: string;
  task: string;
  hint: string;
  judgeNote: string;
  takeaway: string;
};

export const AI_EVAL_STAGES: AiEvalStageDef[] = [
  {
    index: 1,
    id: "ask-three-times",
    title: "问三遍",
    englishTitle: "Same question, three times",
    track: "core",
    description:
      "「校园百事通」是一段脚本化的检索应答程序：它把学生的问题与一张校园事实表做关键词匹配，再套模板回答——表里还埋了缺陷。评测它的第一步：同一个问题连问几遍，看答案稳不稳。",
    task: "对你的 4 道题各连问几次（最多 8 次），把作答收进证据，然后给每题选档：稳定 / 摇摆 / 多变。",
    hint: "判定看「槽值」而不是字面措辞——时间、地点、数字这些硬信息变了才算变。判「稳定」需要至少 6 次相同观测；摇摆/多变至少 3 次。",
    judgeNote:
      "判分会重放你的证据：每条 drawId 都会在同seed下重新作答核对，观测次数不足或全选同一档会被拦下。",
    takeaway: "连问几遍是同一件事的最低成本体检——答案今天这个明天那个的系统，不能直接接进业务。",
  },
  {
    index: 2,
    id: "phrasing",
    title: "换个问法试试",
    englishTitle: "Same question, other words",
    track: "core",
    description:
      "用户不会都照标准句式提问。这一关你要先预测每种问法会不会改变答案，再跑变体矩阵验证——先猜后验，才是评测而不是看热闹。",
    task: "先勾选你对 5 种问法变体的预测（保存后才发题），然后对「原句 + 5 种变体」各跑 3 次，观察哪一列最先变了答案。",
    hint: "改动分两类：只动说法的（语序、敬语、限定词）多半不伤检索；动关键词的（同义替换、删关键词）最危险。预测要在抽题前落库，抽完再改就算作弊了。",
    judgeNote: "判分会核对预测落库时间早于首次抽题，并复算每格答案找出「最敏感维度」。",
    takeaway:
      "检索式应答对关键词敏感、对客套话不敏感——测出来的敏感维度，就是将来给用户写提示语的清单。",
  },
  {
    index: 3,
    id: "confabulation",
    title: "它会一本正经地编",
    englishTitle: "It confabulates, fluently",
    track: "core",
    description:
      "问出语料库之外的问题，它不会说「不知道」——它会流利地编。这一关系统按序发 10 条回答，你要逐条裁决：可信 / 存疑（须附查证过的字段）/ 拿不准交人工。查证配额有限，不能每条都验。",
    task: "申领并裁决 10 条回答。点槽值芯片可查真值（配额 8 次）；判「存疑」必须引用一个你查证过、且与事实不符的字段。",
    hint: "域外问题（事实表没有的）几乎必编；域内回答偶尔被改掉一个槽值。配额有限——优先验那些「看起来像答案但其实没把握」的。",
    judgeNote:
      "判分按混淆矩阵算：召回 ≥75%、误伤 ≤34%、交人工 ≤30%。存疑字段必须来自 /verify，不能凭空填。",
    takeaway:
      "记住：这些结论只适用于检索式应答器。真正的大模型更会编、编得更圆——这里练的是「留证据、认配额、敢兜底」的评测姿势，不是 LLM 本身。",
  },
];

/** Every ai-eval stage is core-track; kept as a separate export to mirror is-sim. */
export const AI_EVAL_CORE_STAGES = AI_EVAL_STAGES;

export function getAiEvalStage(index: number): AiEvalStageDef | undefined {
  return AI_EVAL_STAGES.find((stage) => stage.index === index);
}

/** Linear unlock: stage 1 open, others need the previous stage passed. */
export function aiEvalStageUnlocked(passedStages: readonly number[], index: number): boolean {
  return index === 1 || passedStages.includes(index - 1);
}

export function nextAiEvalStage(passedStages: readonly number[]): number {
  for (const stage of AI_EVAL_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return AI_EVAL_STAGES[AI_EVAL_STAGES.length - 1].index;
}
