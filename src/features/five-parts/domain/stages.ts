/**
 * Stage contracts for the five-parts lab — four pages:
 *   1 observe  五大部件如何合作算出 a + b（四步演示）
 *   2 think    谁指挥运算器？
 *   3 storage  内存与外存：断电后各剩下什么，CPU 从哪里拿数据
 *   4 phone    手机拍照时的五大部件：触摸屏既能输入也能输出
 *
 * Questions ship WITHOUT a correct flag and without verdict copy: the
 * server judge owns both, so the answer never reaches the client bundle.
 */

export type FivePartsStageId = "observe" | "think" | "storage" | "phone";

export type FivePartsQuestion = {
  prompt: string;
  options: readonly { id: string; label: string }[];
};

export type FivePartsStageDef = {
  index: number;
  id: FivePartsStageId;
  title: string;
  englishTitle: string;
  /** The page's one server-judged question; the observe page has none. */
  question?: FivePartsQuestion;
};

export const FIVE_PARTS_STAGES: FivePartsStageDef[] = [
  {
    index: 1,
    id: "observe",
    title: "让计算机把两个数字相加",
    englishTitle: "Add Two Numbers",
  },
  {
    index: 2,
    id: "think",
    title: "观察与思考",
    englishTitle: "Observe and Think",
    question: {
      prompt: "如果运算器只负责计算，那么是谁指挥它进行加法的？",
      options: [
        { id: "memory", label: "存储器" },
        { id: "controller", label: "控制器" },
        { id: "output", label: "输出设备" },
      ],
    },
  },
  {
    index: 3,
    id: "storage",
    title: "内存与外存：断电会怎样？",
    englishTitle: "Memory and Storage",
    question: {
      prompt: "断电以后，为什么刚写、还没保存的那句不见了，而保存过的内容还在？",
      options: [
        { id: "ram-cleared", label: "那句只在内存里，内存一断电就清空" },
        { id: "auto-delete", label: "断电时，电脑会自动删掉最后写的一句" },
        { id: "disk-full", label: "外存太小，放不下新写的那句" },
      ],
    },
  },
  {
    index: 4,
    id: "phone",
    title: "手机里的五大部件",
    englishTitle: "Parts in a Phone",
    question: {
      prompt: "拍照时，触摸屏属于哪一类设备？",
      options: [
        { id: "input", label: "只是输入设备" },
        { id: "output", label: "只是输出设备" },
        { id: "both", label: "既是输入设备，也是输出设备" },
      ],
    },
  },
];

export function getFivePartsStage(index: number): FivePartsStageDef | undefined {
  return FIVE_PARTS_STAGES.find((s) => s.index === index);
}

/**
 * Once the observation is recorded every later page opens — the questions
 * never gate each other, so a wrong pick cannot lock a student out.
 */
export function fivePartsStageUnlocked(passedStages: readonly number[], index: number): boolean {
  if (!getFivePartsStage(index)) return false;
  return index === 1 || passedStages.includes(1);
}

export function nextFivePartsStage(passedStages: readonly number[]): number {
  for (const stage of FIVE_PARTS_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return FIVE_PARTS_STAGES.length + 1;
}
