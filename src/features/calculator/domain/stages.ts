/**
 * Stage contracts for the Calculator Lab (progression 1–7).
 *
 * These are the PUBLIC contract of each stage: which named pins a correct
 * circuit must expose, which primitives are on the palette, and which
 * component name gets unlocked on a full pass. Hidden test vectors live
 * server-side only (server/judge/testcases.ts); public debug cases live in
 * the lesson layer.
 */

import type { GateKind } from "./graph.ts";

/** A group of pins read together as one binary number, MSB first. */
export type BusDef = {
  /** Display label, e.g. "A" or "真实和（5 位）". */
  name: string;
  /** Pin names, MSB first. Every entry must be a declared pin of the stage. */
  pins: string[];
  role: "input" | "output";
  /** Also show the two's-complement reading next to the unsigned one. */
  signed: boolean;
};

export type StageTrack = "core" | "challenge";

export type StageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  description: string;
  /** "core" stages are the in-class main line; "challenge" is optional. */
  track: StageTrack;
  /** Pin groups shown as whole binary numbers in the UI. */
  buses: BusDef[];
  /** Required named input pins (order = display order). */
  inputs: string[];
  /** Required named output pins. */
  outputs: string[];
  /** Primitive gates on the palette for this stage. */
  primitives: GateKind[];
  /** Component name unlocked for later stages on full pass. */
  unlocks: string | null;
  hint: string;
};

const ALL_GATES: GateKind[] = ["and", "or", "xor", "not", "nand", "nor", "buffer"];

const nib = (prefix: string) => [`${prefix}3`, `${prefix}2`, `${prefix}1`, `${prefix}0`];
const byte = (prefix: string) => [
  `${prefix}7`,
  `${prefix}6`,
  `${prefix}5`,
  `${prefix}4`,
  `${prefix}3`,
  `${prefix}2`,
  `${prefix}1`,
  `${prefix}0`,
];

export const CALCULATOR_STAGES: StageDef[] = [
  {
    index: 1,
    id: "half-adder",
    title: "半加器",
    englishTitle: "Half Adder",
    description: "用逻辑门实现 1 位加法：Sum = A ⊕ B，Carry = A ∧ B。",
    track: "core",
    buses: [{ name: "结果（2 位）", pins: ["Carry", "Sum"], role: "output", signed: false }],
    inputs: ["A", "B"],
    outputs: ["Sum", "Carry"],
    primitives: ALL_GATES,
    unlocks: "HalfAdder",
    hint: "Sum 只在两个输入不同时为 1；Carry 只在都为 1 时为 1。",
  },
  {
    index: 2,
    id: "full-adder",
    title: "全加器",
    englishTitle: "Full Adder",
    description: "加入进位输入 Cin：三个 1 位相加，输出 Sum 与 Cout。",
    track: "core",
    buses: [{ name: "结果（2 位）", pins: ["Cout", "Sum"], role: "output", signed: false }],
    inputs: ["A", "B", "Cin"],
    outputs: ["Sum", "Cout"],
    primitives: ALL_GATES,
    unlocks: "FullAdder",
    hint: "可以用两个 HalfAdder 级联：先加 A+B，再加 Cin；两次进位取或。",
  },
  {
    index: 3,
    id: "add4",
    title: "4 位加法器",
    englishTitle: "4-bit Addition",
    description: "把四个全加器串成进位链，计算 A + B（4 位无符号）。",
    track: "core",
    buses: [
      { name: "A", pins: nib("A"), role: "input", signed: false },
      { name: "B", pins: nib("B"), role: "input", signed: false },
      {
        name: "真实和（5 位）",
        pins: ["Cout", "S3", "S2", "S1", "S0"],
        role: "output",
        signed: false,
      },
      { name: "存进 4 位字的结果", pins: nib("S"), role: "output", signed: false },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: [...nib("S"), "Cout"],
    primitives: ALL_GATES,
    unlocks: "Add4",
    hint: "第 0 位的 Cin 接常量 0；进位像波浪一样从低位传到高位。",
  },
  {
    index: 4,
    id: "negate4",
    title: "求补码",
    englishTitle: "Negation",
    description: "计算 -A（二进制补码）：按位取反再加 1。",
    track: "core",
    buses: [
      { name: "A", pins: nib("A"), role: "input", signed: false },
      { name: "R", pins: nib("R"), role: "output", signed: true },
    ],
    inputs: nib("A"),
    outputs: nib("R"),
    primitives: ALL_GATES,
    unlocks: "Neg4",
    hint: "NOT 每个输入位，然后把结果当作加数送进 Add4，另一个加数是常量 1。",
  },
  {
    index: 5,
    id: "sub4",
    title: "4 位减法器",
    englishTitle: "Subtraction",
    description: "计算 A − B（模 16 环绕）：A + (−B)。",
    track: "core",
    buses: [
      { name: "A", pins: nib("A"), role: "input", signed: false },
      { name: "B", pins: nib("B"), role: "input", signed: false },
      { name: "R", pins: nib("R"), role: "output", signed: true },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: nib("R"),
    primitives: ALL_GATES,
    unlocks: "Sub4",
    hint: "Neg4 求出 −B，再用 Add4 相加。减法就是加上补码。",
  },
  {
    index: 6,
    id: "mul4",
    title: "4 位乘法器",
    englishTitle: "Multiplication",
    description:
      "计算 A × B，输出 8 位乘积 P。工作量很大：参考实现约 35 个元件、近百根连线，适合课后或社团时间挑战，不是课堂必做。",
    track: "challenge",
    buses: [
      { name: "A", pins: nib("A"), role: "input", signed: false },
      { name: "B", pins: nib("B"), role: "input", signed: false },
      { name: "P（8 位）", pins: byte("P"), role: "output", signed: false },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: byte("P"),
    primitives: ALL_GATES,
    unlocks: "Mul4",
    hint: "每个 B 位与 A 做 AND 得到部分积，左移后用 FullAdder 逐位累加；Add4 没有进位输入，不能直接级联。",
  },
  {
    index: 7,
    id: "calculator",
    title: "完整计算器",
    englishTitle: "Final Calculator",
    description:
      "用 Op1、Op0 选择运算：00 加、01 减、10 乘（低 4 位）、11 按位异或。工作量比第 6 关还大，适合课后或社团时间挑战，不是课堂必做。",
    track: "challenge",
    buses: [
      { name: "A", pins: nib("A"), role: "input", signed: false },
      { name: "B", pins: nib("B"), role: "input", signed: false },
      { name: "R", pins: nib("R"), role: "output", signed: true },
    ],
    inputs: [...nib("A"), ...nib("B"), "Op1", "Op0"],
    outputs: nib("R"),
    primitives: ALL_GATES,
    unlocks: null,
    hint: "算出全部结果，再用 Op 位做选择器（MUX）逐位挑选输出。",
  },
];

export function getStage(index: number): StageDef | undefined {
  return CALCULATOR_STAGES.find((s) => s.index === index);
}

/** In-class main line: stages 1–5. */
export function coreStages(): StageDef[] {
  return CALCULATOR_STAGES.filter((s) => s.track === "core");
}

/** Optional challenges: unlock once every core stage is passed. */
export function challengeStages(): StageDef[] {
  return CALCULATOR_STAGES.filter((s) => s.track === "challenge");
}

export function stageCount(): number {
  return CALCULATOR_STAGES.length;
}
