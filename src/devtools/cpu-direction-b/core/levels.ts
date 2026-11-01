// The 11 levels from cpu-brief.md. Programs, data and judge rules are synthetic demo data
// that follow the brief; registers start at 0 unless a dataset sets them.

import { encode, OPS, type Instr, type Op } from "./isa";
import type { Phase } from "./machine";

export type LineLock = "fixed" | "fill" | "operand" | "free";
export interface Line {
  instr: Instr | null;
  lock: LineLock;
  /** Fixed op/reg for an operand-only line whose operand is still blank. */
  stub?: Instr;
}

export interface Dataset {
  id: string;
  label: string;
  mem?: Record<number, number>;
  regs?: { A?: number; B?: number };
}

export interface Option {
  id: string;
  text: string;
  correct?: boolean;
  why: string;
}

export type Trigger =
  { kind: "gate"; cycle: number; phase: Phase } | { kind: "byte"; target: number };

export interface Question {
  id: string;
  prompt: string;
  trigger: Trigger;
  options: Option[];
  reveal: string;
}

export interface Expect {
  loc: "A" | "B" | number;
  value: number;
}

export interface CellRole {
  addr: number;
  role: "input" | "output" | "const" | "scratch";
  label: string;
}

export interface Level {
  id: number;
  kind: "core" | "challenge";
  title: string;
  goal: string;
  hints: string[];
  judgeRule: string;
  concept: string;
  ops: readonly Op[];
  edit: "none" | "fill" | "operand" | "free";
  fillOps?: readonly Op[];
  program: Line[];
  base: Record<number, number>;
  cells: CellRole[];
  publicData: Dataset[];
  hidden: Dataset[];
  limit: number;
  budget?: (d: Dataset) => number;
  expect: (d: Dataset) => Expect[];
  /** Submit precondition beyond answered questions. */
  observe?: "all-public-halted" | "both-branches";
  /** Extra judge rule on hidden runs; returns a failure message or null. */
  extra?: "both-directions" | "fetch-written";
  questions: Question[];
  needsCalculator?: boolean;
}

const I = (op: Op, reg: "A" | "B" = "A", operand = 0): Instr => ({ op, reg, operand });
const fixed = (...xs: Instr[]): Line[] => xs.map((instr) => ({ instr, lock: "fixed" }));
const free = (...xs: Instr[]): Line[] => xs.map((instr) => ({ instr, lock: "free" }));
const m = (d: Dataset, k: number) => d.mem?.[k] ?? 0;
const r = (d: Dataset, k: "A" | "B") => d.regs?.[k] ?? 0;
const ds = (
  id: string,
  label: string,
  mem?: Record<number, number>,
  regs?: Dataset["regs"],
): Dataset => ({
  id,
  label,
  mem,
  regs,
});
const sumTo = (n: number) => (n * (n + 1)) / 2;
const io = (input: number[], output: number[], extra: CellRole[] = []): CellRole[] => [
  ...input.map((addr) => ({ addr, role: "input" as const, label: "输入" })),
  ...output.map((addr) => ({ addr, role: "output" as const, label: "输出" })),
  ...extra,
];

export const LEVELS: Level[] = [
  {
    id: 1,
    kind: "core",
    title: "按一下时钟",
    goal: "固定程序把输入格 M[14] 的数经 A 写入输出格 M[15]。先预测，再逐拍观察 PC 取指、LOAD 读数、STORE 写出、HALT 停机。",
    hints: [
      "PC 只说“下一条去哪里取”，它不关心那里装的是什么。",
      "STORE 的写入在周期末才提交，执行阶段之前 M[15] 还是旧值。",
    ],
    judgeRule: "每份公开数据都要走到正常停机，才能提交本关。隐藏数据检查 M[15] = 输入。",
    concept:
      "CPU 只会重复同一件事：按 PC 取一个 byte，译码，执行，再决定下一个 PC。程序就是这样一拍一拍被“走”出来的。",
    ops: ["LOAD", "STORE", "HALT"],
    edit: "none",
    program: fixed(I("LOAD", "A", 14), I("STORE", "A", 15), I("HALT")),
    base: {},
    cells: io([14], [15]),
    publicData: [ds("p1", "M[14] = 5", { 14: 5 }), ds("p2", "M[14] = 9", { 14: 9 })],
    hidden: [
      ds("h1", "M[14] = 0", { 14: 0 }),
      ds("h2", "M[14] = 15", { 14: 15 }),
      ds("h3", "M[14] = 7", { 14: 7 }),
    ],
    limit: 16,
    expect: (d) => [{ loc: 15, value: m(d, 14) }],
    observe: "all-public-halted",
    questions: [
      {
        id: "l1-first-fetch",
        prompt: "PC = 0。第一拍取指会读取哪个存储格？",
        trigger: { kind: "gate", cycle: 0, phase: "fetch" },
        options: [
          { id: "a", text: "M[0]", correct: true, why: "PC 的值就是下一条要取的地址。" },
          {
            id: "b",
            text: "M[14]，因为输入在那里",
            why: "CPU 不知道哪里是“输入”；它只按 PC = 0 去 M[0] 取指。M[14] 要等 LOAD 执行时才被读。",
          },
          {
            id: "c",
            text: "M[15]，因为要先准备输出",
            why: "取指只看 PC，不看程序的目标。M[15] 在 STORE 执行时才会被写。",
          },
        ],
        reveal: "PC = 0，所以取指读 M[0]。地址来自 PC，与格子里装着什么无关。",
      },
      {
        id: "l1-store",
        prompt: "IR 里是 STORE A, M[15]。执行并提交后，哪一处会改变？",
        trigger: { kind: "gate", cycle: 1, phase: "execute" },
        options: [
          {
            id: "a",
            text: "M[15] 变成 A 的值",
            correct: true,
            why: "STORE 把寄存器写进存储格，方向是 A → M[15]。",
          },
          {
            id: "b",
            text: "A 变成 M[15] 的值",
            why: "这是 LOAD 的方向。STORE 从寄存器出发，写到存储格。",
          },
          {
            id: "c",
            text: "PC 跳到 15",
            why: "操作数 15 是要写的地址，不是跳转目标。PC 照常前进到 2。",
          },
        ],
        reveal: "STORE A, M[15]：A 的值在周期末写入 M[15]，A 本身不变，PC 前进到 2。",
      },
    ],
  },
  {
    id: 2,
    kind: "core",
    title: "一个 byte 两种读法",
    goal: "固定程序读取 M[11] 并写到 M[15]。观察同一个 byte 的数值和指令含义，再亲手拨出 11100000。",
    hints: [
      "看 M[0]：它的数值是 11，被取指时又是 LOAD A, M[11]。",
      "最高 3 位是操作码，第 4 位选寄存器，最低 4 位是操作数。",
    ],
    judgeRule: "回答全部引导题后可提交。隐藏数据检查 M[15] = M[11]。",
    concept:
      "存储器只存 bit。被 PC 取到的 byte 当指令译码，被 LOAD 读到的 byte 当数据——程序和数据住在同一片存储里。",
    ops: ["LOAD", "STORE", "HALT"],
    edit: "none",
    program: fixed(I("LOAD", "A", 11), I("STORE", "A", 15), I("HALT")),
    base: {},
    cells: io([11], [15]),
    publicData: [ds("p1", "M[11] = 14", { 11: 14 }), ds("p2", "M[11] = 9", { 11: 9 })],
    hidden: [
      ds("h1", "M[11] = 0", { 11: 0 }),
      ds("h2", "M[11] = 15", { 11: 15 }),
      ds("h3", "M[11] = 3", { 11: 3 }),
    ],
    limit: 16,
    expect: (d) => [{ loc: 15, value: m(d, 11) }],
    questions: [
      {
        id: "l2-same-byte",
        prompt: "M[0] 里的 byte 是 00001011（数值 11）。PC 指向它时，CPU 会怎样对待它？",
        trigger: { kind: "gate", cycle: 0, phase: "fetch" },
        options: [
          {
            id: "a",
            text: "当作指令 LOAD A, M[11]",
            correct: true,
            why: "取指读进 IR 的 byte 一律按指令译码。",
          },
          {
            id: "b",
            text: "当作数字 11 放进 A",
            why: "只有 LOAD 执行时才把 byte 当数据读进寄存器；取指得到的 byte 进 IR。",
          },
          {
            id: "c",
            text: "先检查它是代码还是数据",
            why: "存储格没有“类型”标记，CPU 也不做这种检查。",
          },
        ],
        reveal: "同一个 11：被 PC 取到时是指令 LOAD A, M[11]；若被 LOAD 读到，它就只是数字 11。",
      },
      {
        id: "l2-halt-byte",
        prompt: "你拨出的 11100000 数值是多少？被取指时会译码成什么？",
        trigger: { kind: "byte", target: 0b11100000 },
        options: [
          {
            id: "a",
            text: "224 · HALT",
            correct: true,
            why: "128 + 64 + 32 = 224；操作码 111 是 HALT。",
          },
          {
            id: "b",
            text: "7 · HALT",
            why: "7 只是最高 3 位 111 的值。整个 byte 是 128 + 64 + 32 = 224。",
          },
          {
            id: "c",
            text: "224 · LOAD A, M[0]",
            why: "操作码看最高 3 位：111 是 HALT，000 才是 LOAD。",
          },
        ],
        reveal: "11100000 = 224 = HALT。数值和指令只是同一串 bit 的两种读法。",
      },
    ],
  },
  {
    id: 3,
    kind: "core",
    title: "上一章藏在这里",
    goal: "固定程序读取输入，把 M[11] 加到 A，再写到 M[15]。比较普通结果与产生进位的公开数据。",
    hints: ["A 只有 4 bit，能放 0–15。", "完整的和超过 15 时，留下低 4 位，并亮起进位线索。"],
    judgeRule:
      "回答引导题，并让两份公开数据都走到停机后可提交。隐藏数据检查 M[15] = (M[14] + M[11]) 的低 4 位。",
    concept: "ADD 里藏着上一章的加法器：4 位加法器只能保留低 4 位，溢出的那一位变成进位线索。",
    ops: ["ADD", "SUB", "LOAD", "STORE", "HALT"],
    edit: "none",
    program: fixed(I("LOAD", "A", 14), I("ADD", "A", 11), I("STORE", "A", 15), I("HALT")),
    base: { 11: 6 },
    cells: io([14], [15], [{ addr: 11, role: "const", label: "加数" }]),
    publicData: [
      ds("p1", "M[14] = 5 · 普通", { 14: 5 }),
      ds("p2", "M[14] = 12 · 会进位", { 14: 12 }),
    ],
    hidden: [
      ds("h1", "M[14] = 0", { 14: 0 }),
      ds("h2", "M[14] = 9", { 14: 9 }),
      ds("h3", "M[14] = 10", { 14: 10 }),
    ],
    limit: 16,
    expect: (d) => [{ loc: 15, value: (m(d, 14) + 6) & 15 }],
    observe: "all-public-halted",
    needsCalculator: true,
    questions: [
      {
        id: "l3-carry",
        prompt: "IR 里是 ADD A, M[11]。如果完整的和超过 15，A 里会留下什么？",
        trigger: { kind: "gate", cycle: 1, phase: "execute" },
        options: [
          {
            id: "a",
            text: "和的低 4 位，并出现进位线索",
            correct: true,
            why: "4 位寄存器只能装下低 4 位，多出的 16 变成进位。",
          },
          { id: "b", text: "完整的和，例如 18", why: "A 只有 4 bit，最大 15，装不下 18。" },
          { id: "c", text: "停在 15", why: "加法器不会“封顶”，它丢掉第 5 位：18 → 2。" },
        ],
        reveal: "12 + 6 = 18 = 1 0010。A 留下 0010 = 2，第 5 位的 1 就是进位。",
      },
    ],
  },
  {
    id: 4,
    kind: "challenge",
    title: "丢失的一条指令",
    goal: "补全第 1 行，把 M[14] 复制到 M[15] 后停机。",
    hints: ["第 0 行已经把 M[14] 读进 A。", "还差把 A 送到 M[15]。"],
    judgeRule: "隐藏数据检查：正常停机，且 M[15] = M[14]。",
    concept: "复制 = 读进寄存器 + 从寄存器写出。存储格之间不能直接搬运，必须经过寄存器。",
    ops: ["LOAD", "STORE", "HALT"],
    edit: "fill",
    fillOps: ["LOAD", "STORE", "HALT"],
    program: [
      { instr: I("LOAD", "A", 14), lock: "fixed" },
      { instr: null, lock: "fill" },
      { instr: I("HALT"), lock: "fixed" },
    ],
    base: {},
    cells: io([14], [15]),
    publicData: [ds("p1", "M[14] = 3", { 14: 3 }), ds("p2", "M[14] = 10", { 14: 10 })],
    hidden: [
      ds("h1", "M[14] = 0", { 14: 0 }),
      ds("h2", "M[14] = 15", { 14: 15 }),
      ds("h3", "M[14] = 6", { 14: 6 }),
    ],
    limit: 16,
    expect: (d) => [{ loc: 15, value: m(d, 14) }],
    questions: [],
  },
  {
    id: 5,
    kind: "challenge",
    title: "数据说了算",
    goal: "修正第 0 行 JZ 的目标：A = 0 时输出 0，A ≠ 0 时输出 1。两种分支都要亲眼看到。",
    hints: ["A ≠ 0 时，不跳转，下一条是第 1 行。", "A = 0 时，应该跳过“把 A 改成 1”的那一行。"],
    judgeRule: "提交前须在公开数据上观察到“跳转”和“不跳转”两种结果。隐藏数据检查 M[15]。",
    concept: "同一段程序，走哪条路由数据决定。JZ 让 PC 的下一个值取决于寄存器。",
    ops: ["JZ", "LDI", "LOAD", "STORE", "HALT"],
    edit: "operand",
    program: [
      { instr: I("JZ", "A", 1), lock: "operand" },
      { instr: I("LDI", "A", 1), lock: "fixed" },
      { instr: I("STORE", "A", 15), lock: "fixed" },
      { instr: I("HALT"), lock: "fixed" },
    ],
    base: {},
    cells: io([], [15]),
    publicData: [ds("p1", "A = 0", undefined, { A: 0 }), ds("p2", "A = 6", undefined, { A: 6 })],
    hidden: [
      ds("h1", "A = 1", undefined, { A: 1 }),
      ds("h2", "A = 0", undefined, { A: 0 }),
      ds("h3", "A = 15", undefined, { A: 15 }),
    ],
    limit: 16,
    expect: (d) => [{ loc: 15, value: r(d, "A") === 0 ? 0 : 1 }],
    observe: "both-branches",
    questions: [],
  },
  {
    id: 6,
    kind: "challenge",
    title: "回到过去",
    goal: "补上第 3 行 JMP 的回跳目标，让 B 倒数到 0 后停机；初始 B = 0 时也必须直接停机。",
    hints: ["每轮都要先检查 B 是不是 0。", "回跳到检查之后，会错过 B = 0 的那一刻。"],
    judgeRule: "隐藏数据检查：正常停机，B = 0，M[15] = 0。周期上限 64。",
    concept: "把 PC 改回到前面，同一段指令就能再走一次——这就是循环。退出条件必须在每一轮都被检查。",
    ops: ["JMP", "STORE", "SUB", "JZ", "HALT"],
    edit: "operand",
    program: [
      { instr: I("JZ", "B", 4), lock: "fixed" },
      { instr: I("SUB", "B", 14), lock: "fixed" },
      { instr: I("STORE", "B", 15), lock: "fixed" },
      { instr: null, lock: "operand", stub: I("JMP") },
      { instr: I("HALT"), lock: "fixed" },
    ],
    base: { 14: 1 },
    cells: io([], [15], [{ addr: 14, role: "const", label: "常数 1" }]),
    publicData: [ds("p1", "B = 3", undefined, { B: 3 }), ds("p2", "B = 0", undefined, { B: 0 })],
    hidden: [
      ds("h1", "B = 1", undefined, { B: 1 }),
      ds("h2", "B = 9", undefined, { B: 9 }),
      ds("h3", "B = 0", undefined, { B: 0 }),
    ],
    limit: 64,
    expect: () => [
      { loc: "B", value: 0 },
      { loc: 15, value: 0 },
    ],
    questions: [],
  },
  {
    id: 7,
    kind: "challenge",
    title: "真正写一个 if",
    goal: "比较 M[13] 与 M[14]：相等时在 M[15] 写 1，否则写 0。",
    hints: ["两数相等 ⇔ 相减等于 0。", "让 JZ 把“相等”和“不相等”分到两段不同的指令。"],
    judgeRule:
      "隐藏数据检查 M[15]，并要求程序里的条件跳转在隐藏数据上“跳”和“不跳”两个方向都真实执行过。",
    concept:
      "if 不是魔法：一次减法得到 0 或非 0，一条 JZ 决定 PC 去哪一段。两段代码只会执行其中一段。",
    ops: ["LOAD", "STORE", "ADD", "SUB", "JZ", "JMP", "LDI", "HALT"],
    edit: "free",
    program: free(I("LOAD", "A", 13), I("SUB", "A", 14), I("JZ", "A", 0), I("HALT")),
    base: {},
    cells: io([13, 14], [15]),
    publicData: [
      ds("p1", "M[13] = 3, M[14] = 3", { 13: 3, 14: 3 }),
      ds("p2", "M[13] = 7, M[14] = 2", { 13: 7, 14: 2 }),
    ],
    hidden: [
      ds("h1", "M[13] = 4, M[14] = 4", { 13: 4, 14: 4 }),
      ds("h2", "M[13] = 2, M[14] = 9", { 13: 2, 14: 9 }),
      ds("h3", "M[13] = 0, M[14] = 0", { 13: 0, 14: 0 }),
    ],
    limit: 32,
    expect: (d) => [{ loc: 15, value: m(d, 13) === m(d, 14) ? 1 : 0 }],
    extra: "both-directions",
    questions: [],
  },
  {
    id: 8,
    kind: "challenge",
    title: "用循环合成 1+…+N",
    goal: "计算 1+2+…+N，把结果写入 M[13]。N 在 M[14]，常数 1 在 M[15]，M[12] 是草稿格。",
    hints: [
      "ADD 只能加存储格，所以要先把计数器存进草稿格 M[12]。",
      "先检查 N 是不是 0，再进入循环体。",
    ],
    judgeRule: "隐藏数据检查 M[13] =（1+…+N）的低 4 位，且必须正常停机。周期上限 128。",
    concept: "循环 = 计数器 + 每轮检查 + 回跳。先检查再做，才能正确处理“一次都不做”的 N = 0。",
    ops: ["LOAD", "STORE", "ADD", "SUB", "JZ", "JMP", "LDI", "HALT"],
    edit: "free",
    program: free(
      I("LOAD", "B", 14),
      I("STORE", "B", 12),
      I("ADD", "A", 12),
      I("SUB", "B", 15),
      I("JZ", "B", 6),
      I("JMP", "A", 1),
      I("STORE", "A", 13),
      I("HALT"),
    ),
    base: { 15: 1 },
    cells: io(
      [14],
      [13],
      [
        { addr: 15, role: "const", label: "常数 1" },
        { addr: 12, role: "scratch", label: "草稿" },
      ],
    ),
    publicData: [ds("p1", "N = 3", { 14: 3 }), ds("p2", "N = 5", { 14: 5 })],
    hidden: [
      ds("h1", "N = 6", { 14: 6 }),
      ds("h2", "N = 0", { 14: 0 }),
      ds("h3", "N = 9", { 14: 9 }),
    ],
    limit: 128,
    expect: (d) => [{ loc: 13, value: sumTo(m(d, 14)) & 15 }],
    questions: [],
  },
  {
    id: 9,
    kind: "challenge",
    title: "软件乘法",
    goal: "把 M[13] × M[14] 的低 4 位写入 M[15]。因子不大于 7，常数 1 在 M[12]。",
    hints: ["乘法就是重复加法：加 M[13]，加 M[14] 次。"],
    judgeRule: "隐藏数据检查 M[15] =（M[13] × M[14]）的低 4 位，且必须正常停机。周期上限 64。",
    concept: "没有乘法指令，也能用循环把乘法“写”出来——硬件给的越少，软件要做的越多。",
    ops: ["LOAD", "STORE", "ADD", "SUB", "JZ", "JMP", "LDI", "HALT"],
    edit: "free",
    program: free(I("LOAD", "B", 14), I("HALT")),
    base: { 12: 1 },
    cells: io([13, 14], [15], [{ addr: 12, role: "const", label: "常数 1" }]),
    publicData: [ds("p1", "3 × 4", { 13: 3, 14: 4 }), ds("p2", "7 × 0", { 13: 7, 14: 0 })],
    hidden: [
      ds("h1", "5 × 3", { 13: 5, 14: 3 }),
      ds("h2", "0 × 6", { 13: 0, 14: 6 }),
      ds("h3", "7 × 7", { 13: 7, 14: 7 }),
    ],
    limit: 64,
    expect: (d) => [{ loc: 15, value: (m(d, 13) * m(d, 14)) & 15 }],
    questions: [],
  },
  {
    id: 10,
    kind: "challenge",
    title: "少走几步",
    goal: "仍然计算 1+…+N 写入 M[13]，但每份数据只有 5N+4 个周期的预算。",
    hints: ["数一数循环体每轮走几个周期。", "每轮都把总和写回存储器，真的有必要吗？"],
    judgeRule: "隐藏数据检查 M[13]，且每份数据的周期数 ≤ 5N+4。",
    concept: "结果对，不等于程序好。每条指令都要花一个周期，循环体里省一条，就是每轮省一拍。",
    ops: ["LOAD", "STORE", "ADD", "SUB", "JZ", "JMP", "LDI", "HALT"],
    edit: "free",
    program: free(
      I("LOAD", "B", 14),
      I("JZ", "B", 7),
      I("STORE", "B", 12),
      I("ADD", "A", 12),
      I("SUB", "B", 15),
      I("STORE", "A", 13),
      I("JMP", "A", 1),
      I("STORE", "A", 13),
      I("HALT"),
    ),
    base: { 15: 1 },
    cells: io(
      [14],
      [13],
      [
        { addr: 15, role: "const", label: "常数 1" },
        { addr: 12, role: "scratch", label: "草稿" },
      ],
    ),
    publicData: [ds("p1", "N = 3", { 14: 3 }), ds("p2", "N = 5", { 14: 5 })],
    hidden: [
      ds("h1", "N = 1", { 14: 1 }),
      ds("h2", "N = 7", { 14: 7 }),
      ds("h3", "N = 0", { 14: 0 }),
    ],
    limit: 128,
    budget: (d) => 5 * m(d, 14) + 4,
    expect: (d) => [{ loc: 13, value: sumTo(m(d, 14)) & 15 }],
    questions: [],
  },
  {
    id: 11,
    kind: "challenge",
    title: "程序改程序",
    goal: "计算 M[13] + M[14] 的低 4 位写到 M[15]。M[6..8] 可作草稿格。",
    hints: [
      "寄存器里的 13 写进存储器，就是 byte 00001101。",
      "00001101 被取指时，会被译码成什么？",
    ],
    judgeRule: "隐藏数据检查 M[15]，并要求执行轨迹里确实取指执行过一个先前被 STORE 写过的格子。",
    concept: "指令也是数据：程序可以先写出一个 byte，再让 PC 走过去把它当指令执行。",
    ops: ["LOAD", "STORE", "ADD", "SUB", "JZ", "JMP", "LDI", "HALT"],
    edit: "free",
    program: free(I("LDI", "B", 13), I("STORE", "B", 6), I("HALT")),
    base: {},
    cells: io(
      [13, 14],
      [15],
      [6, 7, 8].map((addr) => ({ addr, role: "scratch" as const, label: "草稿" })),
    ),
    publicData: [ds("p1", "4 + 3", { 13: 4, 14: 3 }), ds("p2", "9 + 8", { 13: 9, 14: 8 })],
    hidden: [
      ds("h1", "0 + 0", { 13: 0, 14: 0 }),
      ds("h2", "15 + 1", { 13: 15, 14: 1 }),
      ds("h3", "6 + 5", { 13: 6, 14: 5 }),
    ],
    limit: 32,
    expect: (d) => [{ loc: 15, value: (m(d, 13) + m(d, 14)) & 15 }],
    extra: "fetch-written",
    questions: [],
  },
];

/** Demo unlock graph (assumption, see README): core is sequential, challenges branch after core 3. */
export const REQUIRES: Record<number, number[]> = {
  1: [],
  2: [1],
  3: [2],
  4: [3],
  5: [3],
  6: [5],
  7: [5],
  8: [6],
  9: [8],
  10: [8],
  11: [7, 9],
};

export const levelById = (id: number) => LEVELS.find((l) => l.id === id) ?? LEVELS[0];

export const isUnlocked = (id: number, passed: readonly number[]) =>
  REQUIRES[id].every((p) => passed.includes(p));

export const ALL_OPS = OPS;

/** Initial memory for a program + dataset. Program bytes first, then fixed data, then the dataset. */
export function memoryImage(level: Level, lines: Line[], data: Dataset): number[] {
  const mem = new Array(16).fill(0) as number[];
  lines.forEach((l, i) => {
    if (i < 16 && l.instr) mem[i] = encodeLine(l);
  });
  for (const [k, v] of Object.entries(level.base)) mem[Number(k)] = v;
  for (const [k, v] of Object.entries(data.mem ?? {})) mem[Number(k)] = v;
  return mem;
}

const encodeLine = (l: Line) => (l.instr ? encode(l.instr) : 0);

export const cellRole = (level: Level, addr: number) => level.cells.find((c) => c.addr === addr);

/** Gate questions keyed by machine position. */
export function gateAt(level: Level, cycle: number, phase: Phase) {
  return level.questions.find(
    (q) => q.trigger.kind === "gate" && q.trigger.cycle === cycle && q.trigger.phase === phase,
  );
}
