/**
 * The five-parts demo model — pure data and arithmetic, no React.
 *
 * Teaching claim, and the only one the lab makes: a computer is five parts
 * (input devices, memory, controller, arithmetic unit, output devices) and
 * work flows 输入 → 存储/组织 → 处理 → 输出. The demo is a concept animation
 * of one addition, NOT a simulation of real timing or wiring — the page
 * itself says so.
 */

export type PartId = "input" | "memory" | "controller" | "alu" | "output";

export type Part = {
  id: PartId;
  /** Display name — plain words, no architecture jargon. */
  title: string;
  englishTitle: string;
  /** One line about what the part is for, shown inside its card. */
  role: string;
};

export const FIVE_PARTS: Part[] = [
  {
    id: "input",
    title: "输入设备",
    englishTitle: "Input",
    role: "把数字交给计算机",
  },
  {
    id: "memory",
    title: "存储器",
    englishTitle: "Memory",
    role: "保存输入的数字和程序",
  },
  {
    id: "controller",
    title: "控制器",
    englishTitle: "Controller",
    role: "按照程序指挥各部件",
  },
  {
    id: "alu",
    title: "运算器",
    englishTitle: "Arithmetic unit",
    role: "执行实际的计算",
  },
  {
    id: "output",
    title: "输出设备",
    englishTitle: "Output",
    role: "把结果呈现出来",
  },
];

export type DemoStep = {
  /** 0-based: 0 is the idle state before the first run-through. */
  index: number;
  /** Which card lights up at this step; null = nothing highlighted yet. */
  highlight: PartId | null;
  /** Caption under the diagram for this step. */
  caption: string;
};

/**
 * The run is exactly four demonstrated steps; index 0 is "not started".
 * Step copy is fixed teaching text — never a live timing description.
 */
export const DEMO_STEPS: DemoStep[] = [
  {
    index: 0,
    highlight: null,
    caption: "输入两个数字，然后按「执行下一步」看计算机怎么算。",
  },
  {
    index: 1,
    highlight: "memory",
    caption: "把输入的两个数字保存在存储器里",
  },
  {
    index: 2,
    highlight: "controller",
    caption: "控制器按照程序发出计算命令",
  },
  {
    index: 3,
    highlight: "alu",
    caption: "运算器执行加法，算出结果",
  },
  {
    index: 4,
    highlight: "output",
    caption: "输出设备显示计算结果",
  },
];

export const STEP_COUNT = DEMO_STEPS.length - 1;

/** Digits only, 0–9 — the domain boundary clamps, never trusts the UI. */
export function clampDigit(raw: unknown): number {
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(9, Math.trunc(value)));
}

export function sum(a: number, b: number): number {
  return clampDigit(a) + clampDigit(b);
}
