/**
 * The toy CPU's instruction set: 8 instructions in one byte each —
 * `[opcode 3b | reg 1b | operand 4b]`. Registers A and B hold 4-bit
 * values; PC is 4-bit; IR is the fetched 8-bit instruction word.
 *
 * Memory is unified (von Neumann): one 16-cell × 8-bit store holds the
 * program in cells 0..rows-1 and data in the rest. Data values only use
 * the low nibble — every value a program can observe or store stays in
 * 0..15, so cell contents are always a valid (if odd) instruction byte.
 *
 * Students submit `InstrRow[]` — bounded data, not code. The same pure
 * interpreter runs in the browser (public cases, the machine view) and
 * on the server (hidden judgement), exactly like the calculator's
 * `evaluateGraph` over student circuits.
 */

export type OpName = "LOAD" | "STORE" | "ADD" | "SUB" | "JZ" | "JMP" | "LDI" | "HALT";

/** The 3-bit opcode values; array order IS the encoding. */
export const OPCODES: readonly OpName[] = [
  "LOAD",
  "STORE",
  "ADD",
  "SUB",
  "JZ",
  "JMP",
  "LDI",
  "HALT",
];

export type RegId = 0 | 1;
export const REG_NAMES = ["A", "B"] as const;

/** One editor row = one instruction = one memory cell. */
export type InstrRow = {
  op: OpName;
  /** Which register the op works on; ignored by JMP/HALT. 0=A, 1=B. */
  reg: RegId;
  /** Cell address, jump target, or immediate — always 0..15. */
  operand: number;
};

export const MEM_CELLS = 16;
export const MAX_PROGRAM_ROWS = 16;
/** Global cycle cap; per-stage budgets stay well below it. */
export const MAX_CYCLES = 256;

export type OperandMeaning = "mem" | "addr" | "imm" | "none";

const OP_META: Record<OpName, { usesReg: boolean; operand: OperandMeaning }> = {
  LOAD: { usesReg: true, operand: "mem" },
  STORE: { usesReg: true, operand: "mem" },
  ADD: { usesReg: true, operand: "mem" },
  SUB: { usesReg: true, operand: "mem" },
  JZ: { usesReg: true, operand: "addr" },
  JMP: { usesReg: false, operand: "addr" },
  LDI: { usesReg: true, operand: "imm" },
  HALT: { usesReg: false, operand: "none" },
};

export function opUsesReg(op: OpName): boolean {
  return OP_META[op].usesReg;
}

export function opOperandMeaning(op: OpName): OperandMeaning {
  return OP_META[op].operand;
}

/** `[op 3b | reg 1b | operand 4b]` — the byte stored in one memory cell. */
export function encodeInstr(row: InstrRow): number {
  return ((OPCODES.indexOf(row.op) & 0x7) << 5) | ((row.reg & 0x1) << 4) | (row.operand & 0xf);
}

export function decodeInstr(byte: number): InstrRow {
  return {
    op: OPCODES[(byte >> 5) & 0x7],
    reg: ((byte >> 4) & 0x1) as RegId,
    operand: byte & 0xf,
  };
}

const REG = (reg: RegId) => REG_NAMES[reg];

/** Human-readable mnemonic for one row, e.g. `LOAD A, M[14]`. */
export function formatInstr(row: InstrRow): string {
  const meaning = opOperandMeaning(row.op);
  if (meaning === "none") return row.op;
  const reg = opUsesReg(row.op) ? ` ${REG(row.reg)},` : "";
  const operand =
    meaning === "mem"
      ? `M[${row.operand}]`
      : meaning === "addr"
        ? `→${row.operand}`
        : `${row.operand}`;
  return `${row.op}${reg} ${operand}`;
}

/** A row carries any value the editor might hold between edits. */
export function sanitizeRow(raw: unknown): InstrRow | null {
  if (!raw || typeof raw !== "object") return null;
  const { op, reg, operand } = raw as { op?: unknown; reg?: unknown; operand?: unknown };
  if (typeof op !== "string" || !OPCODES.includes(op as OpName)) return null;
  if (reg !== 0 && reg !== 1) return null;
  if (typeof operand !== "number" || !Number.isInteger(operand) || operand < 0 || operand > 15) {
    return null;
  }
  return { op: op as OpName, reg, operand };
}

/**
 * Bound a program at the data edge: ≤16 rows of valid instructions.
 * Malformed rows drop out — a damaged program simply fails cases, it
 * can never escape the interpreter.
 */
export function sanitizeProgram(raw: unknown): InstrRow[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_PROGRAM_ROWS)
    .map(sanitizeRow)
    .filter((row): row is InstrRow => row !== null);
}

/** Program image: one byte per row, padded with 0 (LOAD A,M[0]) to 16. */
export function programToMem(rows: readonly InstrRow[]): number[] {
  const mem = new Array<number>(MEM_CELLS).fill(0);
  rows.forEach((row, index) => {
    if (index < MEM_CELLS) mem[index] = encodeInstr(row);
  });
  return mem;
}

/** Does this row write a memory cell when executed? */
export function opWritesMem(op: OpName): boolean {
  return op === "STORE";
}
