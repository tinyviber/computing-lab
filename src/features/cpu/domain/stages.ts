/**
 * Stage contracts for the CPU lab — the calculator's sequel: students write
 * programs (instruction rows, not circuits) for a tiny von Neumann machine.
 *
 * Every stage fixes the instruction palette, a hard cycle cap, and the data
 * contract. Hidden case lists stay server-side (server/judge/cpu/hiddenSet.ts);
 * public debug cases live in the lesson layer. Per-case cycle budgets can be
 * tighter than maxCycles — X3's whole point is a budget that only fits the
 * register-counter loop shape.
 *
 * Issue #70 redesign: the core line is now *guided* stages — the program is
 * (almost) fixed and the learner's job is a predict → step → observe sequence,
 * not free authoring. The old algorithmic stages survive as challenges, where
 * free programming is the point.
 */

import type { InstrRow, OpName } from "./isa.ts";

/** One prediction/observation checkpoint inside a guided stage. */
export type CpuPrompt = {
  id: string;
  /**
   * If set, the prompt blocks stepping once this many cycles have committed —
   * the learner must predict before the machine reveals the answer. Omit for
   * questions that may be answered any time (they still gate submission).
   */
  at?: number;
  /**
   * The demo case this prompt's numbers come from: while the prompt is
   * unanswered the case picker locks to this index, so the question can
   * never disagree with the machine state in front of the learner.
   */
  caseIndex?: number;
  /**
   * Byte-playground gate (C4): the prompt's options stay disabled until
   * the learner has dialed the playground byte to this value — watching a
   * preset is not enough, they must flip the bits.
   */
  requiresByte?: number;
  prompt: string;
  /** Exactly one option is correct; wrong picks can carry a per-option note. */
  options: { label: string; correct?: boolean; note?: string }[];
  /** The "aha" line shown once answered correctly. */
  reveal: string;
};

/** A guided stage: mostly-fixed program plus a gated prediction sequence. */
export type CpuGuided = {
  /** Only these rows may be edited; every other row is locked to prefillRows. */
  editableRows: readonly number[];
  /** Rows rendered as “待补全” while they still hold the prefill placeholder. */
  blankRows?: readonly number[];
  /** Palette override for editable rows (defaults to stage.ops). */
  rowOps?: readonly OpName[];
  /** Ordered prompts; all must be answered before the stage can be submitted. */
  prompts: readonly CpuPrompt[];
  /** C4: render the interactive bit-toggle byte playground. */
  bytePlayground?: boolean;
};

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
  /** Rows the draft starts with — for guided stages this IS the fixed program. */
  prefillRows?: InstrRow[];
  /** Guided stage contract (see CpuGuided). Absent = free-authoring stage. */
  guided?: CpuGuided;
  /** The hidden set must see the branch resolve BOTH ways. */
  branchTwoWays?: boolean;
  /** The trace must contain a fetch from a previously STOREd cell. */
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

/**
 * The program a guided stage actually runs: prefill rows with only the
 * editable slots patched from the draft. Locked rows and any extra/missing
 * rows in the draft simply can't reach the machine — same rule on the server.
 */
export function guidedProgram(stage: CpuStageDef, rows: readonly InstrRow[]): InstrRow[] {
  const base = stage.prefillRows ?? [];
  if (!stage.guided) return [...rows];
  return base.map((row, i) =>
    stage.guided!.editableRows.includes(i) && rows[i] ? { ...rows[i] } : { ...row },
  );
}

export const CPU_STAGES: CpuStageDef[] = [
  // ---------- C1 — 按一下时钟：纯观察，不写程序 ----------
  {
    index: 1,
    id: "watch-it-go",
    title: "按一下时钟",
    englishTitle: "Press the Clock",
    track: "core",
    ops: ["LOAD", "STORE", "HALT"],
    maxCycles: 6,
    scratchCells: [],
    decoyCells: [12, 13],
    prefillRows: [
      { op: "LOAD", reg: 0, operand: 14 },
      { op: "STORE", reg: 0, operand: 15 },
      { op: "HALT", reg: 0, operand: 0 },
    ],
    guided: {
      editableRows: [],
      prompts: [
        {
          id: "first-fetch",
          at: 0,
          prompt: "通电后机器从哪一格取下一条指令？",
          options: [
            { label: "第 0 格——PC 从 0 开始", correct: true },
            { label: "第 14 格——数据在那", note: "数据是等着被读的，不是等着被执行的。" },
            { label: "随便一格", note: "机器每一步都只看 PC 指向的那一格。" },
          ],
          reveal: "PC（程序计数器）从 0 开始：第一拍永远取第 0 格。",
        },
        {
          id: "first-action",
          at: 0,
          prompt: "第 0 格的字节译出来，这一拍会做什么？",
          options: [
            { label: "把 14 号格的数复制到 A", correct: true },
            { label: "把 A 写进 15 号格", note: "那是第 1 行的指令，还没轮到它。" },
            { label: "停机", note: "HALT 在第 2 行，要 PC 走到那才会执行。" },
          ],
          reveal: "取指 → 译码 → 执行：LOAD A,M[14] 把 14 号格的数复制进寄存器 A。",
        },
        {
          id: "pc-advance",
          at: 0,
          prompt: "这一拍结束后，PC 会变成几？",
          options: [
            { label: "1——自动走向下一行", correct: true },
            { label: "还是 0", note: "PC 每个周期都会更新，不然机器就卡死了。" },
            { label: "14", note: "14 是要读的数据地址，不是下一条指令的位置。" },
          ],
          reveal: "程序“自己走”没有魔法：每条指令默认把 PC+1，于是机器一格一格取下去。",
        },
        {
          id: "store-target",
          at: 1,
          prompt: "第 1 拍是 STORE A,M[15]：谁会被改写？",
          options: [
            { label: "15 号格，写进 A 的值", correct: true },
            { label: "寄存器 A", note: "STORE 是把寄存器写出去，不改寄存器本身。" },
            { label: "14 号格", note: "14 号格是上一拍读的，这一拍写的是 15。" },
          ],
          reveal: "STORE 把一个寄存器的值写进一个存储格——写入只在周期末提交。",
        },
        {
          id: "halt-end",
          at: 2,
          prompt: "HALT 之后，机器还会继续取指吗？",
          options: [
            { label: "不会——HALT 让机器停下", correct: true },
            { label: "会，继续取第 3 格", note: "那机器就永远停不下来了。" },
            { label: "会，回到第 0 格重来", note: "那是循环，不是停机。" },
          ],
          reveal: "整条程序就是 PC 一遍一遍“取指→译码→执行”走出来的；HALT 是唯一让它停下的办法。",
        },
      ],
    },
    description:
      "这台小机器有一条 16 格的存储器：程序放前面，数据放后面。机器每个周期只做一件事——取指 → 译码 → 执行，写入在周期末一起生效。这一关不用写程序：先猜，再一格一格看着它走。",
    task: "回答引导问题，然后单步走完整段程序，看着 5 从 M[14] 走到 M[15]。",
    hint: "每一步先看 PC 指向哪一格；答案都藏在你即将看到的变化里，猜错了也没关系。",
    judgeNote: "程序是固定的——服务器只核对它把 M[14] 复制到了 M[15]。重点是上面的一串引导问题。",
    takeaway:
      "程序运行没有魔法：PC 拿出一个 byte，译码器把它解释成动作，机器改一点状态，然后 PC 再去拿下一个。",
  },

  // ---------- C2 — 丢失的一条指令 ----------
  {
    index: 2,
    id: "missing-instruction",
    title: "丢失的一条指令",
    englishTitle: "The Missing Instruction",
    track: "core",
    ops: ["LOAD", "STORE", "HALT"],
    maxCycles: 6,
    scratchCells: [],
    decoyCells: [12, 13],
    prefillRows: [
      { op: "LOAD", reg: 0, operand: 14 },
      { op: "LOAD", reg: 0, operand: 0 },
      { op: "HALT", reg: 0, operand: 0 },
    ],
    guided: {
      editableRows: [1],
      blankRows: [1],
      rowOps: ["LOAD", "STORE", "HALT"],
      prompts: [
        {
          id: "copy-not-move",
          at: 0,
          prompt: "第 0 拍 LOAD 跑完，14 号格里的数现在在哪？",
          options: [
            { label: "复制进了寄存器 A（14 号格还在）", correct: true },
            { label: "从 14 号格搬走了", note: "LOAD 是复制不是搬运——格子里的数不会消失。" },
            { label: "已经到 15 号格了", note: "还没有任何指令写过 15 号格。" },
          ],
          reveal: "LOAD 是复制：数进了 A，14 号格里的原值还在。",
        },
        {
          id: "pick-store",
          prompt: "要让这个数最终到 15 号格，空缺的第 1 行该放哪条指令？",
          options: [
            { label: "STORE A,M[15]", correct: true },
            { label: "LOAD A,M[15]", note: "方向反了——那是把 15 号格读进 A。" },
            { label: "HALT", note: "停机之前数还没写出去。" },
          ],
          reveal: "选它，把第 1 行补成 STORE A,M[15]，再单步看着它发生。",
        },
        {
          id: "watch-write",
          at: 1,
          prompt: "你补的这一拍会做什么？",
          options: [
            { label: "把 A 的值写进 15 号格", correct: true },
            { label: "把 15 号格读进 A", note: "那是 LOAD 的方向。" },
            { label: "什么都不变", note: "STORE 这一拍就有一格存储被改写。" },
          ],
          reveal: "指令是“改一点状态”的小命令：这一拍改了 15 号格，下一拍 PC 继续往前。",
        },
      ],
    },
    description:
      "同一段程序，但第 1 行丢了：M[14] 里的数要送到 M[15] 才算完。右边的指令卡片是它可能的样子——补全那一行，然后一格一格看它把数写进去。",
    task: "把空缺的第 1 行补成正确指令，让 M[14] 的数复制到 M[15]，然后停机。",
    hint: "数已经在 A 里了——缺的是“把 A 写出去”的那一步。",
    judgeNote: "隐藏用例会换 M[14] 里的值（包括 0/9/15），并核对整张存储器——别写到别的格子。",
    takeaway: "一条指令是一个小命令：它自己只改一点状态，PC 往前走是另一回事。",
  },

  // ---------- C3 — 上一章藏在这里 ----------
  {
    index: 3,
    id: "alu-inside",
    title: "上一章藏在这里",
    englishTitle: "The ALU Inside",
    track: "core",
    ops: ["ADD", "SUB", "LOAD", "STORE", "HALT"],
    maxCycles: 4,
    scratchCells: [],
    decoyCells: [10, 11],
    prefillRows: [
      { op: "LOAD", reg: 0, operand: 14 },
      { op: "HALT", reg: 0, operand: 0 },
    ],
    guided: {
      editableRows: [0],
      blankRows: [0],
      rowOps: ["ADD", "SUB"],
      prompts: [
        {
          id: "which-op",
          prompt: "第 0 行缺了操作名：要让 ALU 把 A 和 M[14] 加起来，该选哪条指令？",
          options: [
            { label: "ADD A,M[14]", correct: true },
            { label: "SUB A,M[14]", note: "SUB 也行，但算的是减——先选 ADD，等下可以换着看。" },
            { label: "LOAD A,M[14]", note: "LOAD 只是复制，不经过 ALU。" },
          ],
          reveal: "把第 0 行选成 ADD——它会把 A 和 M[14] 一起送进运算器，结果写回 A。",
        },
        {
          id: "where-alu",
          prompt: "上一章你用逻辑门搭的加法器，现在在哪？",
          options: [
            { label: "就在数据通路的 ALU 方块里", correct: true },
            { label: "在存储器的某一格里", note: "存储器只放 byte，不放电路。" },
            { label: "已经不需要它了", note: "每条 ADD/SUB 指令背后还是那块电路在算。" },
          ],
          reveal: "你搭的 4 位加法器被封装成了 ALU 方块——一条 ADD 指令只是让控制器把数据送进它。",
        },
        {
          id: "who-joins",
          at: 0,
          prompt: "ADD A,M[14] 这一拍，哪些部件会动起来？",
          options: [
            { label: "存储器 + ALU + 寄存器", correct: true },
            { label: "只有 ALU", note: "M[14] 要先从存储器读出来，结果要写回寄存器。" },
            { label: "只有存储器", note: "相加这件事发生在 ALU，不在存储器里。" },
          ],
          reveal: "通路是 M[14] → ALU ← A → A：一格存储、一个寄存器、一块运算器，同一条因果链。",
        },
        {
          id: "predict-sum",
          at: 0,
          caseIndex: 0,
          prompt: "A 现在是 3，M[14] 是 5：这一拍后 A 是几？",
          options: [
            { label: "8", correct: true },
            { label: "5", note: "5 是 M[14] 的值——LOAD 才会得到它。" },
            { label: "3", note: "3 是旧值；ADD 之后 A 就被覆盖了。" },
          ],
          reveal: "3 + 5 = 8 写回 A。答完可以换成 SUB 再看一遍（A 会变 14）——提交前换回 ADD。",
        },
      ],
    },
    description:
      "上一章你用 XOR、AND 一路搭出了 4 位加法器。这一章它已经被封进机器的 ALU 方块里了——A 里装好了 3，M[14] 里是 5，缺的那一条指令让这块电路转起来。",
    task: "把第 0 行选成 ADD，看着 A 从 3 变成 8；提交前确保留在 ADD。",
    hint: "ALU 只认寄存器和存储格：ADD A,M[14] 就是“A + 14号格 → A”。",
    judgeNote: "隐藏用例会换 A 和 M[14] 里的数（包括会溢出第 5 位的加法）——只有 ADD 能全对。",
    takeaway: "ALU 不是旁边的新抽象：上一章的加法器就是这台机器的一个部件，指令只是驱动它的开关。",
  },

  // ---------- C4 — 八个 bit 的暗号 ----------
  {
    index: 4,
    id: "byte-decoder",
    title: "八个 bit 的暗号",
    englishTitle: "A Byte Becomes an Action",
    track: "core",
    ops: ["LOAD", "STORE", "HALT"],
    maxCycles: 6,
    scratchCells: [],
    decoyCells: [12, 13],
    prefillRows: [
      { op: "LOAD", reg: 0, operand: 14 },
      { op: "STORE", reg: 0, operand: 15 },
      { op: "HALT", reg: 0, operand: 0 },
    ],
    guided: {
      editableRows: [],
      bytePlayground: true,
      prompts: [
        {
          id: "opcode-field",
          at: 0,
          prompt: "第 0 格的字节是 00001110：高 3 位 000 属于哪个字段？",
          options: [
            { label: "操作码——它决定做什么动作", correct: true },
            { label: "寄存器号", note: "寄存器只占中间那 1 位。" },
            { label: "操作数", note: "操作数是低 4 位。" },
          ],
          reveal: "一个 byte 被译码器切成三段：[操作码 3b | 寄存器 1b | 操作数 4b]。",
        },
        {
          id: "decode-000",
          at: 0,
          prompt: "操作码 000 译出来是什么操作？",
          options: [
            { label: "LOAD", correct: true },
            { label: "STORE", note: "STORE 的操作码是 001——看右侧指令卡上的编码。" },
            { label: "HALT", note: "HALT 是 111。" },
          ],
          reveal: "译码器把 000 变成“LOAD”这组控制信号——bit 本身不是命令，解释之后才成为命令。",
        },
        {
          id: "operand-field",
          at: 1,
          prompt: "低 4 位 1110 译出来是什么？",
          options: [
            { label: "操作数 14——要读第 14 格", correct: true },
            { label: "寄存器 14", note: "寄存器只有 A、B 两个，用 1 位就够。" },
            { label: "跳到第 14 行", note: "14 是数据地址——跳不跳由操作码决定。" },
          ],
          reveal: "0000 1110 = 操作码 LOAD + 寄存器 A + 操作数 14，合起来是 LOAD A,M[14]。",
        },
        {
          id: "byte-224",
          requiresByte: 0b11100000,
          prompt: "去下面的 bit 开关把字节拨成 11100000——它在数据视图里是几？",
          options: [
            { label: "224", correct: true },
            { label: "7", note: "7 是操作码字段的值，整个 byte 是 128+64+32=224。" },
            { label: "HALT", note: "HALT 是它在指令视图里的译法，不是数值。" },
          ],
          reveal: "11100000 当作数是 224——存储器第 2 格里躺着的正好就是这个 byte。",
        },
        {
          id: "byte-halt",
          requiresByte: 0b11100000,
          prompt: "同一个 byte 11100000，在指令视图里译成什么？",
          options: [
            { label: "HALT", correct: true },
            { label: "LOAD", note: "LOAD 是 000 开头。" },
            {
              label: "看不懂，不是指令",
              note: "每个 byte 都能被切开译码——111=HALT, 0=A, 0000=0。",
            },
          ],
          reveal: "224 = HALT：同一格存储，两种读法。",
        },
        {
          id: "who-knows",
          prompt: "存储器自己知道第 2 格是“224”还是“HALT”吗？",
          options: [
            {
              label: "不知道——它只是 8 个 bit；被 PC 取到、经译码器解释时才是指令",
              correct: true,
            },
            {
              label: "知道，格子上标着代码区",
              note: "代码/数据的分割线是画给人看的，不是存进格子的。",
            },
            { label: "看数值大小决定", note: "224 和别的数在存储器里没有任何区别。" },
          ],
          reveal: "存储器不区分代码和数据：一个 byte 是不是指令，取决于机器怎么用它。",
        },
        {
          id: "when-instr",
          prompt: "那一个 byte 什么时候算指令、什么时候算数据？",
          options: [
            {
              label: "看机器怎么用它：PC 取到就当指令译，被指令引用就当数据读",
              correct: true,
            },
            { label: "位置靠前的算指令", note: "STORE 也能往程序区写字节——位置不决定身份。" },
            { label: "byte 自己说了算", note: "bit 没有“我是什么”的标志位。" },
          ],
          reveal: "这就是“存储程序”：代码和数据是同一种东西，角色的差别只在谁去用它。",
        },
      ],
    },
    description:
      "每一条“指令”其实就是一格 byte。译码器把它切成 [操作码 3b | 寄存器 1b | 操作数 4b] 三段来解释——同一段 bit，切给数据视图是一个数，切给指令视图是一条命令。先跑完程序，再玩下面的 bit 开关。",
    task: "走完程序，再用 bit 开关观察一个字节的双重身份：拨成 11100000，看看它在两种视图里分别是什么。",
    hint: "存储器第 2 格的字节就是 11100000——它平时被译成 HALT 执行，换成数据读法就是 224。",
    judgeNote: "程序是固定的——这关的重点是下面的引导问题和 bit 开关，不是写代码。",
    takeaway: "译码器把 bit 段变成控制选择；代码和数据不是两种物质——同一格 byte，两种读法。",
  },

  // ---------- C5 — 数据说了算 ----------
  {
    index: 5,
    id: "branch-is-data",
    title: "数据说了算",
    englishTitle: "The Data Decides",
    track: "core",
    ops: ["JZ", "LDI", "LOAD", "STORE", "HALT"],
    maxCycles: 8,
    scratchCells: [],
    decoyCells: [9, 10, 11, 12],
    branchTwoWays: true,
    prefillRows: [
      { op: "JZ", reg: 0, operand: 0 },
      { op: "LDI", reg: 1, operand: 1 },
      { op: "STORE", reg: 1, operand: 15 },
      { op: "HALT", reg: 0, operand: 0 },
      { op: "STORE", reg: 1, operand: 15 },
      { op: "HALT", reg: 0, operand: 0 },
    ],
    guided: {
      editableRows: [0],
      rowOps: ["JZ"],
      prompts: [
        {
          id: "jz-rule",
          at: 0,
          caseIndex: 0,
          prompt: "JZ A,→a 的意思是：A 为 0 就把 PC 改成 a。A=0 时这一拍后 PC 是几？",
          options: [
            { label: "变成 a——跳到第 a 行", correct: true },
            { label: "变成 1——顺着走", note: "那是 A≠0 时的走法。" },
            { label: "不变，还是 0", note: "PC 每个周期都会更新——问题只在于更新成什么。" },
          ],
          reveal: "JZ 看寄存器决定 PC：A==0 → PC=a，否则 PC+1。分支就是“数据改 PC”。",
        },
        {
          id: "pick-target",
          prompt: "程序想让 A=0 时去第 4 行写 0、A≠0 时顺着走写 1——第 0 行的操作数该填几？",
          options: [
            { label: "4", correct: true },
            { label: "0", note: "→0 是跳回自己——PC 会卡在这一拍反复取同一条。" },
            { label: "1", note: "→1 等于顺着走，分支就没生效。" },
          ],
          reveal: "把第 0 行的操作数改成 4，再单步看 PC 被改向。",
        },
        {
          id: "zero-writes",
          at: 1,
          caseIndex: 0,
          prompt: "A=0 这一路跳到第 4 行：STORE 会把什么写进 M[15]？",
          options: [
            { label: "B 的值 0——LDI 被跳过了", correct: true },
            { label: "1", note: "B=1 是第 1 行 LDI 干的——那条路根本没走。" },
            { label: "什么都不写", note: "第 4 行 STORE 照常执行。" },
          ],
          reveal: "分支不只选“做不做”，还选“从哪一行继续”：被跳过的行等于不存在。",
        },
        {
          id: "nonzero",
          caseIndex: 1,
          prompt: "「演示数据」已切到 A=3：JZ 这一拍 PC 会去哪？",
          options: [
            { label: "顺着到第 1 行", correct: true },
            { label: "跳到第 4 行", note: "A=3≠0，条件不成立。" },
            { label: "停在原地", note: "条件不成立时 PC+1，不是卡住。" },
          ],
          reveal: "同一个 JZ，换一份数据就走另一条路——if 的全部秘密就是这一条规则。",
        },
        {
          id: "if-is",
          prompt: "所以机器层面的 if 是什么？",
          options: [
            { label: "一条“看数据改 PC”的规则", correct: true },
            { label: "一个专门的 if 部件", note: "数据通路里没有 if 盒子——只有 PC 被改写。" },
            { label: "汇编器变出来的语法", note: "JZ 是真指令，机器里跑的就是它。" },
          ],
          reveal: "条件 = 数据决定下一个 PC。剩下的都是这个规则的排列组合。",
        },
      ],
    },
    description:
      "JZ 是第一条“看数据办事”的指令：寄存器是 0，就把 PC 改成操作数；不是 0，就照旧 PC+1。下面这段程序想用数据选两条路——第 0 行的跳转目标还空着（现在填的是 0）。",
    task: "把第 0 行 JZ 的操作数改成正确的行号：A=0 时写 0、A≠0 时写 1 到 M[15]，两种数据都要试试。",
    hint: "A=0 要落到第 4 行去写 B——想清楚 JZ 会把 PC 改成什么。",
    judgeNote:
      "隐藏用例覆盖 A=0 和多种 A≠0；判题要求两个方向都真正走过——M[15] 初值被换成了别的数，跳过 STORE 混不过去。",
    takeaway: "分支不是魔法：JZ 只是“寄存器为 0 就改写 PC”。数据第一次决定下一刻执行哪条指令。",
  },

  // ---------- C6 — 回到过去 ----------
  {
    index: 6,
    id: "branch-back",
    title: "回到过去",
    englishTitle: "Jump Backwards",
    track: "core",
    ops: ["JMP", "STORE", "SUB", "JZ", "HALT"],
    maxCycles: 32,
    scratchCells: [],
    decoyCells: [10, 11, 12, 13],
    // No branchTwoWays here: the only JZ in the program is the loop exit —
    // every correct run resolves it "taken" exactly once.
    prefillRows: [
      { op: "STORE", reg: 1, operand: 14 },
      { op: "JZ", reg: 1, operand: 4 },
      { op: "SUB", reg: 1, operand: 15 },
      { op: "JMP", reg: 0, operand: 4 },
      { op: "HALT", reg: 0, operand: 0 },
    ],
    guided: {
      editableRows: [3],
      rowOps: ["JMP"],
      prompts: [
        {
          id: "jz-skip",
          at: 1,
          caseIndex: 0,
          prompt: "B 现在是 3：JZ B,→4 这一拍会跳吗？",
          options: [
            { label: "不跳——B≠0，PC 顺着到第 2 行", correct: true },
            { label: "跳到第 4 行", note: "B=3 不是 0，条件还不成立。" },
            { label: "停在这里", note: "条件不成立只是不跳，机器照常走。" },
          ],
          reveal: "条件不成立 → PC+1。下一拍 SUB 会把 B 减 1。",
        },
        {
          id: "sub-result",
          at: 2,
          caseIndex: 0,
          prompt: "SUB B,M[15] 之后，B 会变成几？（M[15] 里是 1）",
          options: [
            { label: "2", correct: true },
            { label: "3", note: "SUB 会让 B 变小——不然永远到不了 0。" },
            { label: "4", note: "那是 M[15]+B——指令是减，不是加。" },
          ],
          reveal: "B：3 → 2。每一轮少 1，JZ 总有成立的一天。",
        },
        {
          id: "back-edge",
          prompt: "第 3 行 JMP 要把 PC 送回哪一行，才能让 STORE→JZ→SUB 再来一轮？",
          options: [
            { label: "第 0 行", correct: true },
            { label: "第 4 行", note: "→4 是跳出循环去停机——一轮就结束了。" },
            { label: "第 3 行", note: "→3 是跳回自己，PC 永远卡在这一拍。" },
          ],
          reveal: "把第 3 行的 JMP 操作数改成 0——PC 被送回行头，一轮一轮数下去。",
        },
        {
          id: "no-loop-part",
          prompt: "为什么程序会重复？机器里有一个叫“循环”的部件吗？",
          options: [
            {
              label: "没有——循环只是 PC 被 JMP 反复改回前面的行，直到数据让 JZ 成立",
              correct: true,
            },
            {
              label: "有，循环是 CPU 的内置功能",
              note: "部件表里没有它：控制器、运算器、寄存器、存储器，仅此而已。",
            },
            { label: "程序自己记得要重复", note: "机器只看 PC——“重复”是 PC 序列造成的效果。" },
          ],
          reveal: "循环 = 分支指向过去。PC 序列 0→1→2→3→0→1→2→3… 直到 B 变成 0，JZ 才把它放走。",
        },
      ],
    },
    description:
      "B 里装着一个数（试试切换演示数据）。这段小程序想把它一格一格数到 0：每轮把 B 写进 M[14]、检查是不是 0、减 1——只差一条“回去”的边。补好它，看 PC 在轨迹里打转：0→1→2→3→0→1→2→3…",
    task: "把第 3 行 JMP 的操作数补成正确的回边目标，让 B 从初值数到 0 再停机（M[14] 最后应为 0）。",
    hint: "循环要的是“回到行头”——看看哪一行是这一轮的开头。",
    judgeNote: "隐藏用例会换 B 的初值（包括 0）；B=0 时程序必须直接停机，不能在循环里空转。",
    takeaway: "机器里没有“循环部件”：PC 被反复改回前面的行就是循环——数据什么时候喊停由 JZ 决定。",
  },

  // ---------- X1 — 真正写一个 if（原 C3）----------
  {
    index: 7,
    id: "write-an-if",
    title: "真正写一个 if",
    englishTitle: "Write a Real If",
    track: "challenge",
    railAfter: 5,
    unlockAfter: [5],
    ops: ALL_OPS,
    maxCycles: 9,
    scratchCells: [],
    decoyCells: [9, 10, 11, 12],
    branchTwoWays: true,
    description:
      "现在 JZ 归你了。写一个小判断：两格里的数相等就往 M[15] 写 1，否则写 0——两个分支都要以 HALT 收尾。",
    task: "M[15] = 1 当 M[13] == M[14]，否则 0。",
    hint: "SUB 把“是否相等”变成“是否为零”：a−b==0 当且仅当 a==b。想想 JMP 是干嘛用的。",
    judgeNote: "全部 256 组 (a,b) 都会跑；判题要求分支两个方向都真正走过，只写常数的程序过不了。",
    takeaway: "你已经会自己合成 if 了：算出差是不是 0，让 JZ 选 PC——数据决定控制流。",
  },

  // ---------- X2 — 用循环合成算法（原 C4）----------
  {
    index: 8,
    id: "sum-to-n",
    title: "用循环合成 1+…+N",
    englishTitle: "Loop-Synthesized Sum",
    track: "challenge",
    railAfter: 6,
    unlockAfter: [6],
    ops: ALL_OPS,
    maxCycles: 128,
    scratchCells: [12],
    decoyCells: [9, 10, 11],
    description:
      "主线里你亲手接过回边；现在自己写一个循环：算 1+2+…+N 写进 M[13]。N 在 M[14]，常数 1 在 M[15]。把循环变量装在寄存器里，每轮先判断、再干活——N 可以是 0。",
    task: "M[13] = (1+2+…+N) & 0xF；N = M[14]，常数 1 = M[15]。M[12] 是草稿格。",
    hint: "B 当计数器：每轮先 JZ 跳出，再累加、再 B−1。ADD 只认 M[a]——把 B 镜像进草稿格 M[12] 就能喂给它。",
    judgeNote: "N ∈ {0,1,3,5,7,12,15}，128 周期内必须停机；“先干后判”的写法会被 N=0 抓住。",
    takeaway: "循环就是“跳回开头”：PC 被同一个值反复改写，直到数据说停。",
  },

  // ---------- X2' — 软件乘法（原 C5）----------
  {
    index: 9,
    id: "software-multiply",
    title: "软件乘法",
    englishTitle: "Software Multiply",
    track: "challenge",
    railAfter: 6,
    unlockAfter: [8],
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

  // ---------- X3 — 少走几步（原 X2）----------
  {
    index: 10,
    id: "fewer-cycles",
    title: "少走几步",
    englishTitle: "Fewer Cycles",
    track: "challenge",
    railAfter: 6,
    unlockAfter: [8],
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

  // ---------- X4 — 程序改程序（原 X3）----------
  {
    index: 11,
    id: "self-modify",
    title: "程序改程序",
    englishTitle: "The Program Modifies Itself",
    track: "challenge",
    railAfter: 4,
    unlockAfter: [4],
    ops: ALL_OPS,
    maxCycles: 32,
    scratchCells: [6, 7, 8],
    decoyCells: [10, 11, 12],
    requireSelfModFetch: true,
    description:
      "第 4 关你已经见过：存储器里程序和数据本来就是一回事——同一个 byte 既能是 224 也能是 HALT。那如果我 STORE 一个 byte 到未来会被 PC 取到的位置呢？M[9] 里放着一条现成的 HALT(224)。写一段程序：先算出结果，再把一条自己 STORE 出来的指令写进存储器，让 PC 真的取到它、执行它。",
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

/**
 * Core stages unlock linearly (1→2→…→6, contiguous at the front of the
 * list); challenges need their explicit prerequisites.
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
