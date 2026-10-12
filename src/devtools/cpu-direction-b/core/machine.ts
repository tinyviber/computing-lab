// Phased CPU model from cpu-brief.md. One cycle = fetch → decode → execute;
// all execute-phase writes (registers, memory, PC) are committed at cycle end.

import { decode, explainInstr, formatInstr, type Instr, type Reg } from "./isa";

export type Phase = "fetch" | "decode" | "execute";
export const PHASES: readonly Phase[] = ["fetch", "decode", "execute"];
export const PHASE_ZH: Record<Phase, string> = { fetch: "取指", decode: "译码", execute: "执行" };

export type Status = "ready" | "halted" | "out-of-range" | "cycle-limit";
export const STATUS_ZH: Record<Status, string> = {
  ready: "可执行",
  halted: "正常停机",
  "out-of-range": "跑出存储器范围",
  "cycle-limit": "超过周期上限",
};

/** A location in the machine: register name or memory address. */
export type Loc = "A" | "B" | "PC" | "IR" | number;
export const locName = (l: Loc) => (typeof l === "number" ? `M[${l}]` : l);

export interface Change {
  loc: Loc;
  from: number | null;
  to: number;
}

export interface AluClue {
  kind: "carry" | "borrow";
  on: boolean;
  /** The full, un-truncated result, e.g. 18 for 12 + 6 or −1 for 0 − 1. */
  raw: number;
  cycle: number;
}

export interface Access {
  fetch?: number;
  read?: number;
  write?: number;
  regRead?: Reg;
  regWrite?: Reg;
  jump?: boolean;
}

export interface Machine {
  mem: number[];
  A: number;
  B: number;
  pc: number;
  ir: number | null;
  /** Completed cycles. */
  cycle: number;
  /** Next phase to perform. */
  phase: Phase;
  status: Status;
  alu: AluClue | null;
  access: Access;
  /** Cells written by STORE during this run. */
  written: number[];
  limit: number;
}

export interface CycleRecord {
  cycle: number;
  pc: number;
  byte: number;
  instr: Instr;
  reads: number[];
  changes: Change[];
  nextPc: number;
  alu: AluClue | null;
  /** JZ: whether it jumped. JMP: true. Others: null. */
  jumped: boolean | null;
  status: Status;
  /** The fetched cell had been written by STORE earlier in this run. */
  fetchedWritten: boolean;
}

export interface StepEvent {
  phase: Phase;
  cycle: number;
  text: string;
  changes: Change[];
  record?: CycleRecord;
}

export function createMachine(
  mem: number[],
  regs: Partial<Record<Reg, number>>,
  limit: number,
): Machine {
  return {
    mem: mem.slice(0, 16),
    A: regs.A ?? 0,
    B: regs.B ?? 0,
    pc: 0,
    ir: null,
    cycle: 0,
    phase: "fetch",
    status: "ready",
    alu: null,
    access: {},
    written: [],
    limit,
  };
}

export const isPristine = (m: Machine) => m.cycle === 0 && m.phase === "fetch" && m.ir === null;
export const isTerminal = (m: Machine) => m.status !== "ready";
export const midRun = (m: Machine) => !isPristine(m) && !isTerminal(m);

export function readLoc(m: Machine, l: Loc): number | null {
  if (typeof l === "number") return m.mem[l];
  if (l === "IR") return m.ir;
  if (l === "PC") return m.pc;
  return m[l];
}

/** Describes what the next phase will do, using only already-visible state (no results). */
export function describeNext(m: Machine): string {
  if (m.status !== "ready") return "没有待执行的指令";
  if (m.phase === "fetch") return `按 PC = ${m.pc} 读取 M[${m.pc}]，复制到 IR`;
  const instr = decode(m.ir ?? 0);
  if (m.phase === "decode") return "把 IR 拆成 操作码 / 寄存器 / 操作数 三段";
  return `${formatInstr(instr)}：${explainInstr(instr)}（周期末提交）`;
}

/** What the next phase will touch, without its resulting values (no future results). */
export interface Intent {
  phase: Phase;
  cycle: number;
  reads: Loc[];
  writes: Loc[];
  text: string;
}

export function intentOf(m: Machine): Intent | null {
  if (m.status !== "ready") return null;
  const base = { phase: m.phase, cycle: m.cycle, text: describeNext(m) };
  if (m.phase === "fetch") return { ...base, reads: [m.pc], writes: ["IR"] };
  if (m.phase === "decode") return { ...base, reads: ["IR"], writes: [] };
  const { op, reg, operand: n } = decode(m.ir ?? 0);
  const step: Loc[] = ["PC"];
  switch (op) {
    case "LOAD":
      return { ...base, reads: [n], writes: [reg, ...step] };
    case "STORE":
      return { ...base, reads: [reg], writes: [n, ...step] };
    case "ADD":
    case "SUB":
      return { ...base, reads: [reg, n], writes: [reg, ...step] };
    case "JZ":
      return { ...base, reads: [reg], writes: step };
    case "JMP":
      return { ...base, reads: [], writes: step };
    case "LDI":
      return { ...base, reads: [], writes: [reg, ...step] };
    case "HALT":
      return { ...base, reads: [], writes: [] };
  }
}

function fetch(m: Machine): { next: Machine; event: StepEvent } {
  const byte = m.mem[m.pc];
  return {
    next: { ...m, ir: byte, phase: "decode", access: { fetch: m.pc } },
    event: {
      phase: "fetch",
      cycle: m.cycle,
      text: `从 M[${m.pc}] 取出 byte ${byte}，复制到 IR`,
      changes: m.ir === byte ? [] : [{ loc: "IR", from: m.ir, to: byte }],
    },
  };
}

function decodePhase(m: Machine): { next: Machine; event: StepEvent } {
  const instr = decode(m.ir ?? 0);
  return {
    next: { ...m, phase: "execute", access: {} },
    event: { phase: "decode", cycle: m.cycle, text: `译码为 ${formatInstr(instr)}`, changes: [] },
  };
}

function execute(m: Machine): { next: Machine; event: StepEvent } {
  const byte = m.ir ?? 0;
  const instr = decode(byte);
  const { reg: r, operand: n } = instr;
  const regs = { A: m.A, B: m.B };
  const mem = m.mem.slice();
  const changes: Change[] = [];
  const reads: number[] = [];
  const access: Access = {};
  let nextPc = m.pc + 1;
  let alu: AluClue | null = m.alu;
  let jumped: boolean | null = null;
  let halted = false;
  // Registers are 4 bit: a register-bound read keeps the cell's low 4 bits.
  const cell = (k: number) => {
    reads.push(k);
    access.read = k;
    return mem[k] & 15;
  };
  const setReg = (to: number) => {
    access.regWrite = r;
    if (regs[r] !== to) changes.push({ loc: r, from: regs[r], to });
    regs[r] = to;
  };

  switch (instr.op) {
    case "LOAD":
      setReg(cell(n));
      break;
    case "STORE":
      access.regRead = r;
      access.write = n;
      if (mem[n] !== regs[r]) changes.push({ loc: n, from: mem[n], to: regs[r] });
      mem[n] = regs[r];
      break;
    case "ADD": {
      access.regRead = r;
      const raw = regs[r] + cell(n);
      alu = { kind: "carry", on: raw > 15, raw, cycle: m.cycle };
      setReg(raw & 15);
      break;
    }
    case "SUB": {
      access.regRead = r;
      const raw = regs[r] - cell(n);
      alu = { kind: "borrow", on: raw < 0, raw, cycle: m.cycle };
      setReg((raw + 16) & 15);
      break;
    }
    case "JZ":
      access.regRead = r;
      jumped = regs[r] === 0;
      if (jumped) nextPc = n;
      access.jump = jumped;
      break;
    case "JMP":
      jumped = true;
      nextPc = n;
      access.jump = true;
      break;
    case "LDI":
      setReg(n);
      break;
    case "HALT":
      halted = true;
      nextPc = m.pc;
      break;
  }

  if (nextPc !== m.pc) changes.push({ loc: "PC", from: m.pc, to: nextPc });
  const cycle = m.cycle + 1;
  const status: Status = halted
    ? "halted"
    : nextPc > 15
      ? "out-of-range"
      : cycle >= m.limit
        ? "cycle-limit"
        : "ready";
  const written = instr.op === "STORE" && !m.written.includes(n) ? [...m.written, n] : m.written;
  const record: CycleRecord = {
    cycle: m.cycle,
    pc: m.pc,
    byte,
    instr,
    reads,
    changes,
    nextPc,
    alu: instr.op === "ADD" || instr.op === "SUB" ? alu : null,
    jumped,
    status,
    fetchedWritten: m.written.includes(m.pc),
  };
  return {
    next: { ...m, ...regs, mem, pc: nextPc, cycle, phase: "fetch", status, alu, access, written },
    event: { phase: "execute", cycle: m.cycle, text: explainInstr(instr), changes, record },
  };
}

export function stepPhase(m: Machine): { next: Machine; event: StepEvent } | null {
  if (m.status !== "ready") return null;
  if (m.phase === "fetch") return fetch(m);
  if (m.phase === "decode") return decodePhase(m);
  return execute(m);
}

export interface RunResult {
  final: Machine;
  records: CycleRecord[];
}

/** Runs to a terminal state. Used for public tests and hidden judging only. */
export function runToEnd(m: Machine): RunResult {
  const records: CycleRecord[] = [];
  let cur = m;
  for (let guard = 0; guard < 4096 && cur.status === "ready"; guard++) {
    const s = stepPhase(cur);
    if (!s) break;
    if (s.event.record) records.push(s.event.record);
    cur = s.next;
  }
  return { final: cur, records };
}
