// Instruction set from cpu-brief.md: [opcode 3 bit | register 1 bit | operand 4 bit].
// Opcode order follows the brief's list; HALT = 111 so 11100000 (224) decodes to HALT.

export type Op = "LOAD" | "STORE" | "ADD" | "SUB" | "JZ" | "JMP" | "LDI" | "HALT";
export type Reg = "A" | "B";

export const OPS: readonly Op[] = ["LOAD", "STORE", "ADD", "SUB", "JZ", "JMP", "LDI", "HALT"];

export interface Instr {
  op: Op;
  reg: Reg;
  operand: number;
}

export type OperandKind = "mem" | "addr" | "imm" | "none";

export const OP_INFO: Record<Op, { zh: string; operand: OperandKind; usesReg: boolean }> = {
  LOAD: { zh: "读存储格到寄存器", operand: "mem", usesReg: true },
  STORE: { zh: "把寄存器写入存储格", operand: "mem", usesReg: true },
  ADD: { zh: "寄存器加上存储格", operand: "mem", usesReg: true },
  SUB: { zh: "寄存器减去存储格", operand: "mem", usesReg: true },
  JZ: { zh: "寄存器为 0 时跳转", operand: "addr", usesReg: true },
  JMP: { zh: "无条件跳转", operand: "addr", usesReg: false },
  LDI: { zh: "装入立即数", operand: "imm", usesReg: true },
  HALT: { zh: "停机", operand: "none", usesReg: false },
};

export const clamp4 = (n: number) => Math.max(0, Math.min(15, Math.trunc(n)));

export function encode(i: Instr): number {
  const reg = OP_INFO[i.op].usesReg && i.reg === "B" ? 1 : 0;
  const operand = OP_INFO[i.op].operand === "none" ? 0 : i.operand & 15;
  return (OPS.indexOf(i.op) << 5) | (reg << 4) | operand;
}

export function fields(byte: number) {
  return { opcode: (byte >> 5) & 7, reg: (byte >> 4) & 1, operand: byte & 15 };
}

export function decode(byte: number): Instr {
  const f = fields(byte);
  return { op: OPS[f.opcode], reg: f.reg ? "B" : "A", operand: f.operand };
}

export function formatInstr(i: Instr): string {
  const info = OP_INFO[i.op];
  switch (info.operand) {
    case "mem":
      return `${i.op} ${i.reg}, M[${i.operand}]`;
    case "addr":
      return info.usesReg ? `${i.op} ${i.reg}, ${i.operand}` : `${i.op} ${i.operand}`;
    case "imm":
      return `${i.op} ${i.reg}, ${i.operand}`;
    default:
      return i.op;
  }
}

export const formatByte = (byte: number) => formatInstr(decode(byte));

export function bits(value: number, width = 8): string {
  return value.toString(2).padStart(width, "0");
}

/** Field-grouped bit string, e.g. "111 0 0000". */
export function groupedBits(byte: number): [string, string, string] {
  const b = bits(byte);
  return [b.slice(0, 3), b.slice(3, 4), b.slice(4)];
}

/** Plain-language reading of an instruction for students. */
export function explainInstr(i: Instr): string {
  switch (i.op) {
    case "LOAD":
      return `把 M[${i.operand}] 读进 ${i.reg}`;
    case "STORE":
      return `把 ${i.reg} 写到 M[${i.operand}]`;
    case "ADD":
      return `${i.reg} ← ${i.reg} + M[${i.operand}]，只留低 4 位`;
    case "SUB":
      return `${i.reg} ← ${i.reg} − M[${i.operand}]，只留低 4 位`;
    case "JZ":
      return `若 ${i.reg} = 0，下一条取 M[${i.operand}]`;
    case "JMP":
      return `下一条取 M[${i.operand}]`;
    case "LDI":
      return `${i.reg} ← ${i.operand}`;
    case "HALT":
      return "停机，程序正常结束";
  }
}
