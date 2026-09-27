/**
 * ai-eval corpus: the synthetic campus fact table the responder "retrieves"
 * from, plus the question type. The public half ships in the bundle for the
 * practice sandbox; the judge pool and planted-defect metadata stay
 * server-side in `server/judge/ai-eval/hiddenBank.ts`.
 *
 * All data is synthetic — the lab teaches black-box evaluation of a
 * retrieval-style responder, not real campus information.
 */

/** Semantic slot kinds a fact entry can carry. */
export type SlotKey = "time" | "place" | "num" | "name" | "item";

export const SLOT_KEYS: readonly SlotKey[] = ["time", "place", "num", "name", "item"];

export const SLOT_LABELS: Record<SlotKey, string> = {
  time: "时间",
  place: "地点",
  num: "数量",
  name: "负责人",
  item: "条目",
};

export type FactEntry = {
  id: string;
  /** Display grouping, e.g. "图书馆". */
  topic: string;
  /** Retrieval keywords the responder matches the probe text against. */
  keywords: string[];
  /** Ground-truth slot values; `fieldId` = `${id}.${slotKey}`. */
  slots: Partial<Record<SlotKey, string>>;
  /**
   * Answer templates containing `{slot}` placeholders. The responder picks
   * one per draw (`renderVariant`) so the same entry can surface different
   * wordings; placeholders interpolate as `⟦i⟧` chip markers.
   */
  templates: string[];
  /** Human-readable fact sentence shown by the verify/FactTable view. */
  fact: string;
};

export type EvalQuestion = {
  id: string;
  /** Business category label, e.g. "图书馆服务" — display + C4 routing label. */
  category: string;
  /** Canonical question text (base phrasing). */
  text: string;
  /** The entry a correct retrieval should land on. */
  targetEntryId: string;
  /** Retrieval-critical substring of `text` (used by synonym/drop-core dims). */
  coreTerm: string;
  /** Replacement used by the "synonym" phrasing dim. */
  synonym?: string;
};

export type EvalBank = { corpus: FactEntry[]; questions: EvalQuestion[] };

export function fieldIdOf(entryId: string, slot: SlotKey): string {
  return `${entryId}.${slot}`;
}

export function parseFieldId(fieldId: string): { entryId: string; slot: SlotKey } | null {
  const dot = fieldId.lastIndexOf(".");
  if (dot <= 0) return null;
  const entryId = fieldId.slice(0, dot);
  const slot = fieldId.slice(dot + 1) as SlotKey;
  return SLOT_KEYS.includes(slot) ? { entryId, slot } : null;
}

export function entryOf(corpus: readonly FactEntry[], id: string): FactEntry | undefined {
  return corpus.find((entry) => entry.id === id);
}

/** Ground-truth value of a fieldId, or null when the field does not exist. */
export function truthOf(corpus: readonly FactEntry[], fieldId: string): string | null {
  const parsed = parseFieldId(fieldId);
  if (!parsed) return null;
  const entry = entryOf(corpus, parsed.entryId);
  if (!entry) return null;
  return entry.slots[parsed.slot] ?? null;
}

export function questionOf(bank: EvalBank, id: string): EvalQuestion | undefined {
  return bank.questions.find((q) => q.id === id);
}

/* ------------------------------------------------------------------ */
/* Public corpus — ships in the bundle; the sandbox draws against it.  */
/* ------------------------------------------------------------------ */

export const PUBLIC_CORPUS: FactEntry[] = [
  {
    id: "lib-close",
    topic: "图书馆",
    keywords: ["图书馆", "闭馆", "开放", "几点", "时间"],
    slots: { time: "20:30", place: "东楼三层" },
    templates: [
      "图书馆本周开放到 {time}，自习区在{place}。",
      "本周图书馆 {time} 闭馆，自习区在{place}。",
    ],
    fact: "图书馆本学期开放到 20:30，自习区在东楼三层。",
  },
  {
    id: "lib-borrow",
    topic: "图书馆",
    keywords: ["借书", "上限", "几本", "最多", "册"],
    slots: { num: "5" },
    templates: ["每人最多可借 {num} 册。", "借阅上限是 {num} 册，借期 30 天。"],
    fact: "每人最多同时借 5 册图书，借期 30 天。",
  },
  {
    id: "lib-return",
    topic: "图书馆",
    keywords: ["还书", "哪里", "地点", "归还"],
    slots: { place: "一楼自助还书箱" },
    templates: ["还书请放到{place}。", "图书归还点在{place}。"],
    fact: "还书统一投进一楼大厅的自助还书箱。",
  },
  {
    id: "lib-read",
    topic: "图书馆",
    keywords: ["阅览室", "关门", "几点", "自习"],
    slots: { time: "21:00", place: "西楼二层" },
    templates: ["阅览室 {time} 关门，在{place}。", "西楼阅览室开到 {time}，在{place}。"],
    fact: "西楼阅览室 21:00 关门，位置在西楼二层。",
  },
  {
    id: "study-room",
    topic: "自习室",
    keywords: ["自习室", "座位", "预约", "几次"],
    slots: { num: "3", place: "南楼自习室" },
    templates: [
      "自习室座位要提前约，每天最多 {num} 次，在{place}。",
      "去{place}自习要预约，每天最多约 {num} 次。",
    ],
    fact: "南楼自习室座位需在班级群预约，每人每天最多约 3 次。",
  },
  {
    id: "rule-phone",
    topic: "校规",
    keywords: ["手机", "上课", "放在", "管理"],
    slots: { place: "班级收纳柜" },
    templates: ["上课期间手机统一放{place}。", "按规定，上课手机要放进{place}。"],
    fact: "上课期间手机统一放入班级收纳柜保管。",
  },
  {
    id: "rule-leave",
    topic: "校规",
    keywords: ["请假", "手续", "找谁", "报备"],
    slots: { name: "班主任" },
    templates: ["请假先找{name}报备。", "请假手续：先向{name}报备，家长再电话确认。"],
    fact: "请假须先向班主任报备，再由家长电话确认。",
  },
  {
    id: "course-pe",
    topic: "课程作息",
    keywords: ["体育课", "什么时候", "在哪", "操场"],
    slots: { time: "周二第四节", place: "西操场" },
    templates: ["体育课在{time}，地点{place}。", "{time}上体育课，在{place}集合。"],
    fact: "体育课每周二第四节，在西操场上。",
  },
  {
    id: "course-it",
    topic: "课程作息",
    keywords: ["信息技术", "机房", "在哪", "教室"],
    slots: { place: "实验楼402" },
    templates: ["信息技术课在{place}上。", "机房在{place}。"],
    fact: "信息技术课在实验楼 402 机房上。",
  },
  {
    id: "course-morning",
    topic: "课程作息",
    keywords: ["早读", "几点", "开始", "早上"],
    slots: { time: "7:40" },
    templates: ["早读 {time} 开始。", "早上 {time} 开始早读。"],
    fact: "早读 7:40 开始。",
  },
  {
    id: "club-robot",
    topic: "社团活动",
    keywords: ["机器人社", "社团活动", "几点", "在哪"],
    slots: { time: "周五16:30", place: "科创教室" },
    templates: ["机器人社{time}活动，在{place}。", "机器人社活动在{place}，{time}开始。"],
    fact: "机器人社每周五 16:30 在科创教室活动。",
  },
  {
    id: "club-join",
    topic: "社团活动",
    keywords: ["社团", "招新", "报名", "什么时候"],
    slots: { time: "9月10日", place: "体育馆门口" },
    templates: ["社团招新{time}，在{place}报名。", "{time}社团招新，报名点在{place}。"],
    fact: "社团招新在 9 月 10 日，体育馆门口现场报名。",
  },
  {
    id: "canteen-lunch",
    topic: "食堂",
    keywords: ["食堂", "午饭", "几点", "开饭"],
    slots: { time: "11:40" },
    templates: ["午饭 {time} 开餐。", "食堂午餐 {time} 开始供应。"],
    fact: "食堂午餐 11:40 开始供应。",
  },
  {
    id: "canteen-fri",
    topic: "食堂",
    keywords: ["食堂", "周五", "特色菜", "吃什么"],
    slots: { item: "红烧牛肉面" },
    templates: ["周五特色菜是{item}。", "这周五的特色窗口卖{item}。"],
    fact: "食堂周五特色菜是红烧牛肉面。",
  },
  {
    id: "lost-found",
    topic: "校园服务",
    keywords: ["失物", "招领", "丢了", "在哪"],
    slots: { place: "门卫室旁" },
    templates: ["失物招领处在{place}。", "丢了东西去{place}的失物招领处。"],
    fact: "失物招领处在门卫室旁。",
  },
  {
    id: "event-meet",
    topic: "活动安排",
    keywords: ["运动会", "哪天", "什么时候", "开幕"],
    slots: { time: "10月15日", place: "田径场" },
    templates: ["运动会{time}开幕，在{place}。", "{time}在{place}办运动会。"],
    fact: "秋季运动会 10 月 15 日在田径场举行。",
  },
];

/**
 * Public question pool for the sandbox. Includes one entry-ambiguous pair
 * (自习室 vs 阅览室类问法) and out-of-domain questions so the practice area
 * shows the same flip/confabulation behaviours as the judged bank.
 */
export const PUBLIC_QUESTIONS: EvalQuestion[] = [
  {
    id: "pq-lib-close",
    category: "图书馆服务",
    text: "图书馆本周几点闭馆？",
    targetEntryId: "lib-close",
    coreTerm: "闭馆",
    synonym: "关门",
  },
  {
    id: "pq-lib-borrow",
    category: "图书馆服务",
    text: "借书最多能借几册？",
    targetEntryId: "lib-borrow",
    coreTerm: "几册",
  },
  {
    id: "pq-study-room",
    category: "校园服务",
    text: "自习室座位要预约吗？",
    targetEntryId: "study-room",
    coreTerm: "预约",
    synonym: "订",
  },
  {
    id: "pq-lib-read",
    category: "图书馆服务",
    text: "阅览室几点关门？",
    targetEntryId: "lib-read",
    coreTerm: "关门",
  },
  {
    id: "pq-phone",
    category: "校规咨询",
    text: "上课的时候手机要放在哪里？",
    targetEntryId: "rule-phone",
    coreTerm: "手机",
  },
  {
    id: "pq-pe",
    category: "课程作息",
    text: "体育课什么时候在哪上？",
    targetEntryId: "course-pe",
    coreTerm: "体育课",
  },
  {
    id: "pq-lunch",
    category: "食堂服务",
    text: "食堂午饭几点开饭？",
    targetEntryId: "canteen-lunch",
    coreTerm: "午饭",
    synonym: "午餐",
  },
  {
    id: "pq-lost",
    category: "校园服务",
    text: "东西丢了去哪找？",
    targetEntryId: "lost-found",
    coreTerm: "丢了",
  },
  {
    id: "pq-club",
    category: "社团活动",
    text: "社团招新什么时候报名？",
    targetEntryId: "club-join",
    coreTerm: "招新",
  },
  {
    id: "pq-ood-history",
    category: "活动安排",
    text: "校史馆的讲座几点结束？",
    targetEntryId: "",
    coreTerm: "讲座",
  },
  {
    id: "pq-ood-pool",
    category: "校园服务",
    text: "游泳馆门票多少钱一张？",
    targetEntryId: "",
    coreTerm: "门票",
  },
];

export const PUBLIC_BANK: EvalBank = { corpus: PUBLIC_CORPUS, questions: PUBLIC_QUESTIONS };
