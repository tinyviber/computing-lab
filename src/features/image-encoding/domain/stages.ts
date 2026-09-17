export type StageTrack = "core" | "challenge";

export type ImageStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  description: string;
  track: StageTrack;
  timeBudgetMin: number;
};

export const IMAGE_STAGES: ImageStageDef[] = [
  {
    index: 1,
    id: "convention",
    title: "约定决定意义",
    englishTitle: "Bits need a convention",
    description:
      "亲手把一行像素编成 bit，再换一张约定表解码同一串 bit：bit 本身没有意义，解码器就是约定。",
    track: "core",
    timeBudgetMin: 8,
  },
  {
    index: 2,
    id: "budget",
    title: "在预算内保存",
    englishTitle: "Save within a budget",
    description:
      "只有原图八分之一的 bit 可用。选分辨率档和颜色档“存下”这张照片，让牌子上的数字还能认出来。",
    track: "core",
    timeBudgetMin: 12,
  },
  {
    index: 3,
    id: "collision",
    title: "丢掉的信息回不来",
    englishTitle: "Information does not come back",
    description:
      "改原图，让编码完全不变：哪些像素算数、哪些被直接丢掉？再把你的“老照片”普通放大，看哪些细节回不来。",
    track: "core",
    timeBudgetMin: 12,
  },
  {
    index: 4,
    id: "restore",
    title: "AI 修复",
    englishTitle: "AI restore",
    description:
      "同一张老照片：原图 / 你的编码 / 普通放大 / AI 修复，四张并排。AI 给出的细节从哪里来？",
    track: "challenge",
    timeBudgetMin: 0,
  },
  {
    index: 5,
    id: "hallucination",
    title: "抓幻觉",
    englishTitle: "Catch the hallucination",
    description: "AI 修复“看起来合理”的细节，输入里并没有证据。在修复图上点出你认为它修错的地方。",
    track: "challenge",
    timeBudgetMin: 0,
  },
];

export function getStage(index: number): ImageStageDef | undefined {
  return IMAGE_STAGES.find((stage) => stage.index === index);
}

export function coreStages(): ImageStageDef[] {
  return IMAGE_STAGES.filter((stage) => stage.track === "core");
}

export function challengeStages(): ImageStageDef[] {
  return IMAGE_STAGES.filter((stage) => stage.track === "challenge");
}

export function stageCount(): number {
  return IMAGE_STAGES.length;
}

export function isStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getStage(index);
  if (!stage) return false;
  if (stage.track === "core") return true;
  return coreStages().every((core) => passedStages.includes(core.index));
}
