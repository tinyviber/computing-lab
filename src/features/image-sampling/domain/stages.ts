/**
 * Stage contracts for the image-sampling lab.
 *
 * Every stage fixes a category, an axis mode (square vs free width/height),
 * an accuracy requirement, and a hard cell budget. A submission passes iff:
 *
 *   accuracy >= requiredAccuracy  AND  width * height <= cellBudget
 *
 * Both numbers are public and shown in the UI; only the hidden gallery seeds
 * (server-side) are private. Thresholds were picked from the calibration
 * curves in scripts/calibrate-sampling.ts so each stage has a reachable
 * knee — not a single magic answer.
 */

import type { Resolution } from "./downsample.ts";
import type { CategoryId } from "./sprites.ts";

/**
 * Axis constraint per stage:
 *  - "square": width must equal height — the core "how many cells" lesson.
 *  - "free":   width and height independent — direction matters.
 *  - "tall":   like free, plus height > width is required — the anisotropy
 *              lesson made explicit after stage 4 shows the x-axis case.
 */
export type AxisMode = "square" | "free" | "tall";

export type SamplingStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  category: CategoryId;
  mode: AxisMode;
  /** Fraction of the gallery that must stay uniquely identifiable (0–1). */
  requiredAccuracy: number;
  /** Hard cap on width*height; over budget fails regardless of accuracy. */
  cellBudget: number;
  /** Stage 1 shows the guided cell_value coding exercise first. */
  guided: boolean;
  description: string;
  hint: string;
  /** One-line concept recap shown when the stage passes. */
  takeaway: string;
  /** Resolutions offered as one-click probes in the sweep view. */
  probes: Resolution[];
};

const squareProbes = (sizes: number[]): Resolution[] => sizes.map((n) => ({ width: n, height: n }));

export const IMAGE_SAMPLING_STAGES: SamplingStageDef[] = [
  {
    index: 1,
    id: "first-samples",
    title: "多少个格子才够",
    englishTitle: "How Many Cells",
    category: "invader",
    mode: "square",
    requiredAccuracy: 1,
    cellBudget: 256,
    guided: true,
    description:
      "这组异星剪影长得几乎一样。给整组图片选一个统一的 n×n，让缩小之后每一张仍然独一无二——小了会撞车，大了会浪费格子。",
    hint: "先完成上面的格子实验理解多数覆盖，再从扫掠表里找刚好够用的 n。",
    takeaway:
      "采样把连续的图像变成离散的格子：每个格子代表原图的一整块区域，区域里图形过半才算 1。特征小于半个格子时，它就保不住了。",
    probes: squareProbes([4, 6, 8, 10, 12, 14, 16, 20, 24, 32]),
  },
  {
    index: 2,
    id: "robot-gallery",
    title: "机器人的细微差别",
    englishTitle: "Robot Gallery",
    category: "robot",
    mode: "square",
    requiredAccuracy: 1,
    cellBudget: 784,
    guided: false,
    description:
      "这组机器人只在触角、眼睛、嘴巴、腿部有细小差别。差别越小，就需要越多的格子才能保住它们。",
    hint: "留意眼睛间距和头顶小球的尺寸——这些局部特征最先消失。",
    takeaway:
      "需要的分辨率取决于图库里最细小的差异特征：差异越小，格子就要越密才能保住它。没有脱离任务的“正确分辨率”。",
    probes: squareProbes([8, 12, 16, 20, 22, 24, 26, 28, 32]),
  },
  {
    index: 3,
    id: "sigil-plates",
    title: "打孔印记",
    englishTitle: "Punched Plates",
    category: "sigil",
    mode: "square",
    requiredAccuracy: 1,
    cellBudget: 800,
    guided: false,
    description: "这组金属牌只在打孔位置和缺口上有区别。孔洞是最容易被格子平均掉的特征。",
    hint: "孔洞只有半个格子大小时就会被“磨平”——数一数孔洞占几个格子。",
    takeaway:
      "孔洞、缺口这类“空的部分”也是信息：它们和凸起一样会被多数覆盖磨平。信息丢失不区分特征的形状。",
    probes: squareProbes([8, 12, 16, 20, 22, 24, 26, 28, 32]),
  },
  {
    index: 4,
    id: "wide-ridges",
    title: "宽与高不是一回事",
    englishTitle: "Wide Ridges",
    category: "ridge",
    mode: "free",
    requiredAccuracy: 1,
    cellBudget: 240,
    guided: false,
    description:
      "这组山脊图的区别全部在水平方向：凸起的左右位置。现在可以分别选宽和高——同样的格子总数，横着放和竖着放结果可能完全不同。",
    hint: "比较一下 16×8 和 8×16：格子数一样，但只有一个方向采得够密。",
    takeaway: "格子总数相同不等于保留的信息相同：差异在哪一个方向，采样密度就该花在哪个方向。",
    probes: [
      { width: 16, height: 8 },
      { width: 8, height: 16 },
      { width: 16, height: 16 },
      { width: 24, height: 8 },
      { width: 8, height: 24 },
      { width: 20, height: 8 },
      { width: 8, height: 20 },
      { width: 12, height: 16 },
      { width: 16, height: 12 },
      { width: 12, height: 12 },
      { width: 20, height: 12 },
      { width: 12, height: 20 },
    ],
  },
  {
    index: 5,
    id: "tall-pillars",
    title: "换个方向试试",
    englishTitle: "Tall Pillars",
    category: "pillar",
    mode: "tall",
    requiredAccuracy: 1,
    cellBudget: 240,
    guided: false,
    description:
      "这组立柱的区别全部在垂直方向：成对细缝的上下位置。本关要求高度大于宽度——两个方向上的采样密度不再相同，找出预算内刚好够用的细长比。",
    hint: "细缝是成对出现的：行数太少时两条缝会糊成一团。先把高度推到能分开它们，再压宽度。",
    takeaway:
      "采样密度可以按方向分配：这一关差异在垂直方向，所以行数比列数更值钱。分辨率是两个数字，不是一个。",
    probes: [
      { width: 10, height: 16 },
      { width: 8, height: 16 },
      { width: 12, height: 20 },
      { width: 8, height: 20 },
      { width: 10, height: 20 },
      { width: 8, height: 24 },
      { width: 10, height: 24 },
      { width: 12, height: 16 },
    ],
  },
];

export function getSamplingStage(index: number): SamplingStageDef | undefined {
  return IMAGE_SAMPLING_STAGES.find((s) => s.index === index);
}

export function samplingStageCount(): number {
  return IMAGE_SAMPLING_STAGES.length;
}

/** Stages unlock in order: stage 1 is open, each later stage needs the previous pass. */
export function samplingStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getSamplingStage(index);
  if (!stage) return false;
  return index === 1 || passedStages.includes(index - 1);
}

/** Next stage to work on: first unpassed index, capped past the last stage. */
export function nextSamplingStage(passedStages: readonly number[]): number {
  for (const stage of IMAGE_SAMPLING_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return IMAGE_SAMPLING_STAGES.length;
}
