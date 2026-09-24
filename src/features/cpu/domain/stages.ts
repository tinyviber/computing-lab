/**
 * Stage contracts for the CPU lab — the calculator's sequel: students write
 * programs (instruction rows, not circuits) for a tiny von Neumann machine.
 *
 * Every stage fixes the instruction palette, a hard cycle cap, and the data
 * contract. Hidden case lists stay server-side (server/judge/cpu/hiddenSet.ts);
 * public debug cases live in the lesson layer. Per-case cycle budgets can be
 * tighter than maxCycles — X2's whole point is a budget that only fits the
 * register-counter loop shape.
 */

import type { InstrRow, OpName } from "./isa.ts";

export type CpuStageDef = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  /** "core" is the main line; "challenge" is optional side content. */
  track: "core" | "challenge";
  /** Optional challenges render in the rail right after this core stage. */
  railAfter?: number;
  /** Explicit pass prerequisites for optional challenges. */
  unlockAfter?: number[];
  /** Ops offered in the editor palette for this stage. */
  ops: OpName[];
  /** Hard cap on a run; over it the case is "timeout". */
  maxCycles: number;
  /**
   * Declared scratch cells: exempt from the full-memory compare, so the
   * program may scribble there (e.g. mirroring a register for ADD).
   */
  scratchCells: readonly number[];
  /**
   * Cells the fixture may fill with seeded decoys — a program that writes
   * anywhere outside its contract corrupts them and fails the compare.
   */
  decoyCells: readonly number[];
  /** Rows the draft starts with (C1 prefills the first instruction). */
  prefillRows?: InstrRow[];
  /** C3+: the hidden set must see the branch resolve BOTH ways. */
  branchTwoWays?: boolean;
  /** X3: the trace must contain a fetch from a previously STOREd cell. */
  requireSelfModFetch?: boolean;
  description: string;
  /** The precise memory/register contract the judge checks. */
  task: string;
  hint: string;
  /** What the hidden judgement checks, shown to students up front. */
  judgeNote: string;
  /** One-line concept recap shown when the stage passes. */
  takeaway: string;
};

const SEQ_OPS: OpName[] = ["LDI", "LOAD", "STORE", "HALT"];
const ALU_OPS: OpName[] = [...SEQ_OPS, "ADD", "SUB"];
const ALL_OPS: OpName[] = [...ALU_OPS, "JZ", "JMP"];

export const CPU_STAGES: CpuStageDef[] = [
  {
    index: 1,
    id: "first-steps",
    title: "程序会自己走",
    englishTitle: "The Program Walks Itself",
    track: "core",
    ops: SEQ_OPS,
    maxCycles: 4,
    scratchCells: [],
    decoyCells: [12, 13],
    prefillRows: [{ op: "LOAD", reg: 0, operand: 14 }],
    description:
      "这台小机器有一条 16 格的存储器：程序放前面，数据放后面。每个周期只做一件事——取指 → 译码 → 执行，写入在周期末一起生效。第一行已经帮你取来了数。",
    task: "把 M[14] 的值取到 A，写进 M[15]，然后停机。",
    hint: "程序是按行往下走的：LOAD → STORE → HALT。忘了 HALT，机器会一直取指取到存储器外面去。",
    judgeNote: "隐藏用例会换 M[14] 里的值（包括 0/9/15)，并核对整张存储器——别写到别的格子。",
    takeaway:
      "程序自己会走：PC 每个周期加一，一条指令改变一点点状态；HALT 是让机器停下的唯一办法。",
  },
  {
    index: 2,
    id: "alu-instruction",
    title: "运算也是一条指令",
    englishTitle: "ALU in One Cycle",
    track: "core",
    ops: ALU_OPS,
    maxCycles: 6,
    scratchCells: [],
    decoyCells: [10, 11],
    description:
      "ALU 现在开放了：ADD/SUB 一条指令，顶你在计算器里搭的整块电路。这一次 A、B 里已经装好了两个数（就是 M[13]、M[14] 里的那对）——算两笔账：和写进 M[15]，差写进 M[12]。",
    task: "M[15] = (A + B) & 0xF；M[12] = (A − B) & 0xF。寄存器初始值 A=M[13]、B=M[14]。",
    hint: "先存一个结果再算下一笔——存进存储器的数不会跟着寄存器变。6 个周期刚好够用。",
    judgeNote: "全部 256 组 (a,b) 穷举，外加 16 组需要借位的减法对；6 个周期内必须停机。",
    takeaway: "你搭的 4 位加法器在这里就是一条指令：运算器一个周期出一个结果，写回只发生在周期末。",
  },
  {
    index: 3,
    id: "data-decides",
    title: "数据说了算",
    englishTitle: "The Data Decides",
    track: "core",
    ops: ALL_OPS,
    maxCycles: 9,
    scratchCells: [],
    decoyCells: [9, 10, 11, 12],
    branchTwoWays: true,
    description:
      "JZ 让程序第一次“看数据办事”：寄存器是 0，就跳到指定的行；不是 0，就照旧往下走。写一个小判断：两格里的数相等就往 M[15] 写 1，否则写 0。",
    task: "M[15] = 1 当 M[13] == M[14]，否则 0。",
    hint: "SUB 把“是否相等”变成“是否为零”：a−b==0 当且仅当 a==b。两个分支都要以 HALT 收尾——想想 JMP 是干嘛用的。",
    judgeNote: "全部 256 组 (a,b) 都会跑；判题要求分支两个方向都真正走过，只写常数的程序过不了。",
    takeaway: "分支不是魔法：JZ 只是“看寄存器改 PC”。数据第一次决定下一刻执行哪条指令。",
  },
  {
    index: 4,
    id: "loops",
    title: "程序能重复自己",
    englishTitle: "The Program Repeats Itself",
    track: "core",
    ops: ALL_OPS,
    maxCycles: 128,
    scratchCells: [12],
    decoyCells: [9, 10, 11],
    description:
      "循环 = 跳回去再来一遍。算 1+2+…+N 写进 M[13]：N 在 M[14]，常数 1 在 M[15]。把循环变量装在寄存器里，每轮先判断、再干活——N 可以是 0。",
    task: "M[13] = (1+2+…+N) & 0xF；N = M[14]，常数 1 = M[15]。M[12] 是草稿格。",
    hint: "B 当计数器：每轮先 JZ 跳出，再累加、再 B−1。ADD 只认 M[a]——把 B 镜像进草稿格 M[12] 就能喂给它。",
    judgeNote: "N ∈ {0,1,3,5,7,12,15}，128 周期内必须停机；“先干后判”的写法会被 N=0 抓住。",
    takeaway: "循环就是“跳回开头”：PC 被同一个值反复改写，直到数据说停。",
  },
  {
    index: 5,
    id: "software-multiply",
    title: "软件乘法",
    englishTitle: "Software Multiply",
    track: "core",
    ops: ALL_OPS,
    maxCycles: 64,
    scratchCells: [],
    decoyCells: [9, 10, 11],
    description:
      "这台机器只会加减，乘法得自己合成：a×b 就是把 a 加 b 遍。常数 1 备在 M[12]，两个因子在 M[13]、M[14]，乘积写到 M[15]。",
    task: "M[15] = (M[13] × M[14]) & 0xF；常数 1 = M[12]，因子均 ≤ 7。",
    hint: "和上一关同一个循环骨架：B 记遍数（每轮减 1)，A 累加因子——这次因子本身就在存储器里，ADD 可以直接吃。",
    judgeNote: "{0,1,3,5,7}² 共 25 组穷举再加 (0,0)；64 周期内停机。",
    takeaway: "ISA 里没有乘法，软件用循环把简单运算叠成复杂运算——指令集是下限，不是上限。",
  },
  {
    index: 6,
    id: "fewer-cycles",
    title: "用更少周期",
    englishTitle: "Fewer Cycles",
    track: "challenge",
    railAfter: 4,
    unlockAfter: [4],
    ops: ALL_OPS,
    maxCycles: 128,
    scratchCells: [12],
    decoyCells: [9, 10, 11],
    description:
      "同一个 1+…+N，但预算勒紧了：每用例只给 5N+4 个周期。把计数器放内存里的写法会超——得让循环变量一直住在寄存器里，草稿格 M[12] 只当 ADD 的进料口。",
    task: "M[13] = (1+…+N) & 0xF；N = M[14]，常数 1 = M[15]。每用例预算 5N+4 个周期。",
    hint: "数一遍每条指令的开销：LOAD/STORE 每进一出都是一个周期。B 存计数器、M[12] 只做镜像。",
    judgeNote: "预算随 N 收紧：每轮多两条访存指令的写法必然超时。",
    takeaway:
      "同一道题，寄存器版比内存版每个循环省下两条访存指令——在数据通路里，走到哪一格都要花周期。",
  },
  {
    index: 7,
    id: "self-modify",
    title: "程序改程序",
    englishTitle: "The Program Modifies Itself",
    track: "challenge",
    railAfter: 5,
    unlockAfter: [5],
    ops: ALL_OPS,
    maxCycles: 32,
    scratchCells: [6, 7, 8],
    decoyCells: [10, 11, 12],
    requireSelfModFetch: true,
    description:
      "存储器里程序和数据本来就是一回事——M[9] 里放着一条现成的 HALT(224)。写一段程序：先算出结果，再把一条自己 STORE 出来的指令写进存储器，让 PC 真的取到它、执行它。",
    task: "M[15] = (M[13]+M[14]) & 0xF；且轨迹里必须有一次“取指命中刚写过的格子”。M[6..8] 是草稿格。",
    hint: "LDI 一个值 → STORE 进空格 → JMP 过去。存进去的字节会被当成指令译出来——它的低 4 位决定它读哪一格。",
    judgeNote: "判定看轨迹：取指地址 ∈ 之前 STORE 过的格子，并且 M[15] 要写对。光算对数不够。",
    takeaway: "冯诺依曼机器里指令和数据没有分界线：程序能写出程序——这就是存储程序计算机。",
  },
];

export const CPU_CORE_STAGES = CPU_STAGES.filter((s) => s.track === "core");

export function getCpuStage(index: number): CpuStageDef | undefined {
  return CPU_STAGES.find((s) => s.index === index);
}

export function cpuStageCount(): number {
  return CPU_STAGES.length;
}

/**
 * Core stages unlock linearly; challenges need their explicit prerequisites.
 * Stage 6 (fewer-cycles) follows stage 4; stage 7 (self-modify) follows 5.
 */
export function cpuStageUnlocked(passedStages: readonly number[], index: number): boolean {
  const stage = getCpuStage(index);
  if (!stage) return false;
  if (stage.unlockAfter) return stage.unlockAfter.every((i) => passedStages.includes(i));
  return index === 1 || passedStages.includes(index - 1);
}

/**
 * The mainline pointer: first unpassed stage by index, challenges included —
 * after the core line is done it points at the next unpassed challenge, then
 * one past the last stage.
 */
export function nextCpuStage(passedStages: readonly number[]): number {
  for (const stage of CPU_STAGES) {
    if (!passedStages.includes(stage.index)) return stage.index;
  }
  return CPU_STAGES.length + 1;
}
