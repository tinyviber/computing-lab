/**
 * The CPU's deterministic time-stepped interpreter. One instruction = one
 * cycle: fetch → decode → execute, with all writes committing at the cycle
 * boundary. The same code backs the browser's step-through view and the
 * server judge — the trace IS the evidence both consume.
 *
 * End states are bounded: PC past the last cell is "ran-off", hitting the
 * per-stage cycle cap is "timeout", and only an executed HALT counts as a
 * real finish — a program that happens to hold the right final memory
 * while running off the end still fails.
 */

import {
  decodeInstr,
  MEM_CELLS,
  MAX_CYCLES,
  programToMem,
  REG_NAMES,
  sanitizeProgram,
  type InstrRow,
} from "./isa.ts";

export type RegPair = { A: number; B: number };

export type CpuState = {
  regs: RegPair;
  /** Program counter: next cell to fetch. 4-bit sized in spirit. */
  pc: number;
  /** Instruction register: the byte fetched this cycle. */
  ir: number;
  mem: number[];
  cycles: number;
  halted: boolean;
};

export type MemWrite = { addr: number; prev: number; value: number };

/** One executed cycle. `regs`/`mem` are the BEFORE state; writes committed
 * at the cycle end show up as `nextPc`, `memWrite`, and the next row. */
export type TraceRow = {
  cycle: number;
  pc: number;
  ir: number;
  decoded: InstrRow;
  regsBefore: RegPair;
  /** JZ only: whether the branch fired. */
  branchTaken?: boolean;
  /** ADD/SUB only: the operation spilled past 4 bits (carry/borrow). */
  carried?: boolean;
  memWrite?: MemWrite;
  nextPc: number;
};

export type RunReason = "halted" | "ran-off" | "timeout";

export type MachineRun = {
  reason: RunReason;
  /** State before cycle 1 — what the machine view shows at cursor 0. */
  initial: CpuState;
  final: CpuState;
  trace: TraceRow[];
  /** Every cell the program ever STOREd into. */
  writtenCells: number[];
  /** The program fetched an instruction from a cell it wrote earlier. */
  selfModFetch: boolean;
};

export function initialState(
  rows: readonly InstrRow[],
  initMem: Record<number, number>,
  initRegs?: { A?: number; B?: number },
): CpuState {
  const mem = new Array<number>(MEM_CELLS).fill(0);
  for (const [addr, value] of Object.entries(initMem)) {
    const index = Number(addr);
    if (index >= 0 && index < MEM_CELLS && Number.isFinite(value)) {
      mem[index] = value & 0xff;
    }
  }
  // The program wins where it overlaps initMem — cells 0..rows-1 are code.
  const image = programToMem(rows);
  for (let i = 0; i < Math.min(rows.length, MEM_CELLS); i += 1) mem[i] = image[i];
  return {
    regs: { A: (initRegs?.A ?? 0) & 0xf, B: (initRegs?.B ?? 0) & 0xf },
    pc: 0,
    ir: 0,
    mem,
    cycles: 0,
    halted: false,
  };
}

/** Execute one cycle. Returns the next state plus the executed write, if any. */
export function stepCpu(state: CpuState): { next: CpuState; memWrite?: MemWrite } {
  const pc = state.pc;
  const ir = state.mem[pc] ?? 0;
  const row = decodeInstr(ir);
  const regs = { ...state.regs };
  const regName = REG_NAMES[row.reg] as keyof RegPair;
  let nextPc = pc + 1;
  let halted = state.halted;
  let memWrite: MemWrite | undefined;
  let mem = state.mem;

  switch (row.op) {
    case "LOAD":
      regs[regName] = (state.mem[row.operand] ?? 0) & 0xf;
      break;
    case "STORE":
      mem = state.mem.slice();
      memWrite = { addr: row.operand, prev: state.mem[row.operand] ?? 0, value: regs[regName] };
      mem[row.operand] = regs[regName];
      break;
    case "ADD":
      regs[regName] = (regs[regName] + ((state.mem[row.operand] ?? 0) & 0xf)) & 0xf;
      break;
    case "SUB":
      regs[regName] = (regs[regName] - ((state.mem[row.operand] ?? 0) & 0xf)) & 0xf;
      break;
    case "JZ":
      if (regs[regName] === 0) nextPc = row.operand;
      break;
    case "JMP":
      nextPc = row.operand;
      break;
    case "LDI":
      regs[regName] = row.operand & 0xf;
      break;
    case "HALT":
      halted = true;
      break;
  }

  return {
    next: { regs, pc: nextPc, ir, mem, cycles: state.cycles + 1, halted },
    memWrite,
  };
}

/**
 * Run a program to one of the bounded end states. `writtenCells` grows as
 * STOREs land, and a fetch from a previously written cell flags
 * `selfModFetch` — the X3 stage's "the program modified the program" test.
 */
export function runProgram(
  rows: readonly InstrRow[],
  initMem: Record<number, number> = {},
  initRegs?: { A?: number; B?: number },
  maxCycles: number = MAX_CYCLES,
): MachineRun {
  let state = initialState(rows, initMem, initRegs);
  const initial = state;
  const trace: TraceRow[] = [];
  const written = new Set<number>();
  let selfModFetch = false;

  const done = (reason: RunReason): MachineRun => ({
    reason,
    initial,
    final: state,
    trace,
    writtenCells: [...written],
    selfModFetch,
  });

  while (true) {
    if (state.pc >= MEM_CELLS) return done("ran-off");
    if (state.cycles >= maxCycles) return done("timeout");
    const pc = state.pc;
    if (written.has(pc)) selfModFetch = true;
    const decoded = decodeInstr(state.mem[pc] ?? 0);
    const regsBefore = { ...state.regs };
    const { next, memWrite } = stepCpu(state);
    if (memWrite) written.add(memWrite.addr);
    trace.push({
      cycle: state.cycles + 1,
      pc,
      ir: state.mem[pc] ?? 0,
      decoded,
      regsBefore,
      branchTaken:
        decoded.op === "JZ" ? regsBefore[REG_NAMES[decoded.reg] as keyof RegPair] === 0 : undefined,
      carried:
        decoded.op === "ADD"
          ? regsBefore[REG_NAMES[decoded.reg] as keyof RegPair] +
              ((state.mem[decoded.operand] ?? 0) & 0xf) >
            15
          : decoded.op === "SUB"
            ? regsBefore[REG_NAMES[decoded.reg] as keyof RegPair] <
              ((state.mem[decoded.operand] ?? 0) & 0xf)
            : undefined,
      memWrite,
      nextPc: next.pc,
    });
    state = next;
    if (state.halted) return done("halted");
  }
}

/** One judgeable case: an initial machine image plus the terminal contract. */
export type CpuCase = {
  name: string;
  category: string;
  /** Data-cell contents at boot (addresses → 8-bit values, low nibble for data). */
  initMem: Record<number, number>;
  /** Optional per-case register preload; defaults to A=B=0. */
  initRegs?: { A?: number; B?: number };
  /**
   * When set, asserts the direction of the LAST JZ executed in the run —
   * "the branch resolved this way because of the data". C3 uses it so a
   * program that never consults the condition cannot pass.
   */
  expectBranchTaken?: boolean;
  expect: {
    /** Listed registers must equal; unlisted are unconstrained scratch state. */
    regs?: { A?: number; B?: number };
    /**
     * Listed cells must equal these values. Every other non-program cell
     * must still hold its initMem value (full-memory compare); cells the
     * stage declares as `scratchCells` are exempt.
     */
    mem?: Record<number, number>;
    /** Cycle budget for this case, ≤ the stage's maxCycles. */
    cycles: number;
  };
};

export type CaseVerdict = {
  name: string;
  category: string;
  passed: boolean;
  /** Why it ended before the final state was checked. */
  reason: RunReason | null;
  cyclesUsed: number;
  /** Register mismatches: [{reg, expected, actual}]. */
  regDiff: { reg: "A" | "B"; expected: number; actual: number }[];
  /** Memory mismatches: [{addr, expected, actual}], program region excluded. */
  memDiff: { addr: number; expected: number; actual: number }[];
  /** `expectBranchTaken` was set and the run's last JZ disagreed. */
  branchMismatch: boolean;
  /** A stage-required self-modifying fetch never happened. */
  selfModMissing: boolean;
  run: MachineRun;
};

export function judgeCase(
  rows: readonly InstrRow[],
  testCase: CpuCase,
  options: { scratchCells?: readonly number[]; maxCycles?: number; requireSelfModFetch?: boolean },
): CaseVerdict {
  const program = sanitizeProgram(rows);
  const run = runProgram(
    program,
    testCase.initMem,
    testCase.initRegs,
    options.maxCycles ?? MAX_CYCLES,
  );
  const programRows = Math.min(program.length, MEM_CELLS);
  const scratch = new Set(options.scratchCells ?? []);

  const regDiff: CaseVerdict["regDiff"] = [];
  const memDiff: CaseVerdict["memDiff"] = [];
  let branchMismatch = false;
  let selfModMissing = false;

  if (run.reason === "halted") {
    for (const name of ["A", "B"] as const) {
      const expected = testCase.expect.regs?.[name];
      if (expected === undefined) continue;
      if (run.final.regs[name] !== expected) {
        regDiff.push({ reg: name, expected, actual: run.final.regs[name] });
      }
    }
    const expectedMem = testCase.expect.mem ?? {};
    for (let addr = programRows; addr < MEM_CELLS; addr += 1) {
      if (scratch.has(addr)) continue;
      const expected = addr in expectedMem ? expectedMem[addr] : (testCase.initMem[addr] ?? 0);
      const actual = run.final.mem[addr];
      if (actual !== expected) memDiff.push({ addr, expected, actual });
    }
    if (testCase.expectBranchTaken !== undefined) {
      const lastBranch = [...run.trace].reverse().find((row) => row.decoded.op === "JZ");
      branchMismatch = (lastBranch?.branchTaken ?? null) !== testCase.expectBranchTaken;
    }
    if (options.requireSelfModFetch && !run.selfModFetch) selfModMissing = true;
  }

  const passed =
    run.reason === "halted" &&
    run.final.cycles <= testCase.expect.cycles &&
    regDiff.length === 0 &&
    memDiff.length === 0 &&
    !branchMismatch &&
    !selfModMissing;

  return {
    name: testCase.name,
    category: testCase.category,
    passed,
    reason: run.reason === "halted" ? null : run.reason,
    cyclesUsed: run.final.cycles,
    regDiff,
    memDiff,
    branchMismatch,
    selfModMissing,
    run,
  };
}
