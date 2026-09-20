/**
 * Stage contracts for the Calculator Lab (progression 1–8).
 *
 * These are the PUBLIC contract of each stage: which named pins a correct
 * circuit must expose, which primitives are on the palette, and which
 * component name gets unlocked on a full pass. Hidden test vectors live
 * server-side only (server/judge/testcases.ts); public debug cases live in
 * the lesson layer.
 */

import type { GateKind } from "./graph.ts";

/** How the implied sign bit of a low-bits bus is derived from input pins. */
export type ImplicitSign =
  /** Always 0: the bus holds a non-negative operand. */
  | { kind: "zero" }
  /** 1 iff any listed pin is 1 — e.g. −A is negative whenever A ≠ 0. */
  | { kind: "nonzero"; pins: string[] }
  /** 1 iff the MSB-first number on `left` is less than the one on `right`. */
  | { kind: "lt"; left: string[]; right: string[] };

/** A group of pins read together as one binary number, MSB first. */
export type BusDef = {
  /** Display label, e.g. "A" or "真实和（5 位）". */
  name: string;
  /** Pin names, MSB first. Every entry must be a declared pin of the stage. */
  pins: string[];
  role: "input" | "output";
  /** Also show the two's-complement reading next to the unsigned one. */
  signed: boolean;
  /**
   * Marks the bus as the low bits of a wider two's-complement value whose
   * sign bit is implied by the inputs rather than driven by the circuit.
   * Readings then prepend a virtual sign bit of weight −2^pins.length.
   */
  implicitSign?: ImplicitSign;
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
  /** Gates kept available under “更多元件” — usable, but not suggested. */
  extraPrimitives?: GateKind[];
  /** Show 常量 0/1 chips. Introduced when carry chains first need them. */
  constants?: boolean;
  /** Deeper math/spec notes behind a “为什么？” disclosure. */
  details?: string;
  /** Component name unlocked for later stages on full pass. */
  unlocks: string | null;
  hint: string;
};

const ALL_GATES: GateKind[] = ["and", "or", "xor", "not", "nand", "nor", "buffer"];

/** Visual pin order: the least-significant bit is the top pin. */
const nib = (prefix: string) => [`${prefix}0`, `${prefix}1`, `${prefix}2`, `${prefix}3`];
const byte = (prefix: string) => [
  `${prefix}0`,
  `${prefix}1`,
  `${prefix}2`,
  `${prefix}3`,
  `${prefix}4`,
  `${prefix}5`,
  `${prefix}6`,
  `${prefix}7`,
];

/** Numeric readouts stay MSB first even though canvas pins run low to high. */
const busNib = (prefix: string) => [...nib(prefix)].reverse();
const busByte = (prefix: string) => [...byte(prefix)].reverse();

export const CALCULATOR_STAGES: StageDef[] = [
  {
    index: 1,
    id: "wire",
    title: "连接导线",
    englishTitle: "First Wire",
    description: "用一根导线把输入 A 连到输出 Y：接好后，Y 会实时跟着 A 变。",
    track: "core",
    buses: [],
    inputs: ["A"],
    outputs: ["Y"],
    primitives: [],
    unlocks: null,
    hint: "点击 A 右边的输出圆点，再点击 Y 左边的输入圆点。",
  },
  {
    index: 2,
    id: "half-adder",
    title: "半加器",
    englishTitle: "Half Adder",
    description: "用逻辑门实现 1 位加法：输入 A 和 B，输出和位 Sum 与进位 Carry。",
    track: "core",
    buses: [{ name: "结果（2 位）", pins: ["Carry", "Sum"], role: "output", signed: false }],
    inputs: ["A", "B"],
    outputs: ["Sum", "Carry"],
    primitives: ["xor", "and"],
    extraPrimitives: ["or", "not", "nand", "nor", "buffer"],
    unlocks: "HalfAdder",
    hint: "Sum 只在两个输入不同时为 1；Carry 只在都为 1 时为 1。",
  },
  {
    index: 3,
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
    index: 4,
    id: "add4",
    title: "4 位加法器",
    englishTitle: "4-bit Addition",
    description: "把四个全加器串成进位链，计算 A + B（4 位无符号）。",
    track: "core",
    buses: [
      { name: "A", pins: busNib("A"), role: "input", signed: false },
      { name: "B", pins: busNib("B"), role: "input", signed: false },
      {
        name: "真实和（5 位）",
        pins: ["Cout", ...busNib("S")],
        role: "output",
        signed: false,
      },
      {
        name: "存进 4 位字的结果",
        pins: busNib("S"),
        role: "output",
        signed: false,
      },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: [...nib("S"), "Cout"],
    primitives: ALL_GATES,
    constants: true,
    unlocks: "Add4",
    hint: "第 0 位的 Cin 接常量 0；进位像波浪一样从低位传到高位。",
  },
  {
    index: 5,
    id: "negate4",
    title: "求补码",
    englishTitle: "Negation",
    description:
      "让电路算出 −A，只需输出低 4 位 R3～R0。先观察几个例子：3 → −3（R = 1101）、5 → −5（R = 1011）。二进制补码里，「逐位取反再加 1」就能得到 −A。",
    details:
      "把 A 看作一个 5 位二进制补码正数的低 4 位（1≤A≤15；A=0 仅作为零的边界用例）：最高位是符号位，恒为 0，不出现在引脚上。求 −A 的 5 位补码：−15≤−A≤0，在 5 位补码范围（−16～15）内不会溢出，其符号位恒为 1（A=0 时结果为全 0），已由题意确定，不需要用电路实现。对 A 按位取反再加 1，计算固定在 4 位内，超出第 4 位的进位不保留。",
    track: "core",
    buses: [
      {
        name: "A",
        pins: busNib("A"),
        role: "input",
        signed: false,
        implicitSign: { kind: "zero" },
      },
      {
        name: "R",
        pins: busNib("R"),
        role: "output",
        signed: true,
        implicitSign: { kind: "nonzero", pins: busNib("A") },
      },
    ],
    inputs: nib("A"),
    outputs: nib("R"),
    primitives: ALL_GATES,
    constants: true,
    unlocks: "Neg4",
    hint: "NOT 每个输入位，然后把结果当作加数送进 Add4，另一个加数是常量 1。",
  },
  {
    index: 6,
    id: "sub4",
    title: "4 位减法器",
    englishTitle: "Subtraction",
    description:
      "计算 A − B，输出低 4 位 R3～R0。减法就是加上补码：先用 Neg4 求 −B，再用 Add4 相加，超出第 4 位的进位不保留。",
    details:
      "把 A、B 看作两个 5 位二进制补码正数的低 4 位（0≤A,B≤15）：最高位是符号位，恒为 0，不出现在引脚上。计算 A − B 的 5 位补码：−15≤A−B≤15，在 5 位补码范围（−16～15）内不会溢出；符号位为 1 当且仅当 A < B，由输入决定，不需要用电路实现。",
    track: "core",
    buses: [
      {
        name: "A",
        pins: busNib("A"),
        role: "input",
        signed: false,
        implicitSign: { kind: "zero" },
      },
      {
        name: "B",
        pins: busNib("B"),
        role: "input",
        signed: false,
        implicitSign: { kind: "zero" },
      },
      {
        name: "R",
        pins: busNib("R"),
        role: "output",
        signed: true,
        implicitSign: { kind: "lt", left: busNib("A"), right: busNib("B") },
      },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: nib("R"),
    primitives: ALL_GATES,
    constants: true,
    unlocks: "Sub4",
    hint: "Neg4 求出 −B，再用 Add4 相加。减法就是加上补码。",
  },
  {
    index: 7,
    id: "mul4",
    title: "4 位乘法器",
    englishTitle: "Multiplication",
    description:
      "计算 A × B，输出 8 位乘积 P。例如可把 A0～A3 分别与同一个 Bi 做 AND，框选后封装成一组部分积组件，再反复使用。",
    track: "challenge",
    buses: [
      { name: "A", pins: busNib("A"), role: "input", signed: false },
      { name: "B", pins: busNib("B"), role: "input", signed: false },
      { name: "P（8 位）", pins: busByte("P"), role: "output", signed: false },
    ],
    inputs: [...nib("A"), ...nib("B")],
    outputs: byte("P"),
    primitives: ALL_GATES,
    constants: true,
    unlocks: "Mul4",
    hint: "每个 B 位与 A 做 AND 得到部分积，左移后用 FullAdder 逐位累加；Add4 没有进位输入，不能直接级联。",
  },
  {
    index: 8,
    id: "calculator",
    title: "完整计算器",
    englishTitle: "Final Calculator",
    description: "用 Op1、Op0 选择运算：00 加、01 减、10 乘（低 4 位）、11 按位异或。",
    track: "challenge",
    buses: [
      { name: "A", pins: busNib("A"), role: "input", signed: false },
      { name: "B", pins: busNib("B"), role: "input", signed: false },
      // The final calculator operates on unsigned operands and exposes the
      // low 4-bit word. Keep its result unsigned; signed interpretation is
      // taught explicitly in stage 5 rather than implied here.
      { name: "R", pins: busNib("R"), role: "output", signed: false },
    ],
    inputs: [...nib("A"), ...nib("B"), "Op0", "Op1"],
    outputs: nib("R"),
    primitives: ALL_GATES,
    constants: true,
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
