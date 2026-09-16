/**
 * Hidden test vectors for the Calculator Lab judge.
 *
 * SERVER-ONLY — never import from src/ client bundles. These deliberately
 * cover zeros, boundary overflow, and carry-chain propagation that public
 * debug cases do not.
 */

import { intToPins, type JudgeCase } from "../../src/features/calculator/domain/evaluate.ts";
import type { Bit } from "../../src/features/calculator/domain/graph.ts";

const nib = (prefix: string, value: number): Record<string, Bit> =>
  intToPins(prefix, value & 0xf, 4);
const byte = (prefix: string, value: number): Record<string, Bit> =>
  intToPins(prefix, value & 0xff, 8);

function bitCase(
  name: string,
  category: string,
  ins: Record<string, Bit>,
  outs: Record<string, Bit>,
): JudgeCase {
  return { name, category, inputs: ins, outputs: outs };
}

function halfAdderCases(): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (const a of [0, 1] as const)
    for (const b of [0, 1] as const)
      cases.push(
        bitCase(
          `${a}+${b}`,
          "basic",
          { A: a, B: b },
          { Sum: (a ^ b) as Bit, Carry: (a & b) as Bit },
        ),
      );
  return cases;
}

function fullAdderCases(): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (const a of [0, 1] as const)
    for (const b of [0, 1] as const)
      for (const cin of [0, 1] as const) {
        const total = a + b + cin;
        cases.push(
          bitCase(
            `${a}+${b}+${cin}`,
            cin === 1 ? "carry-in" : "basic",
            { A: a, B: b, Cin: cin },
            { Sum: (total & 1) as Bit, Cout: (total >> 1) as Bit },
          ),
        );
      }
  return cases;
}

function add4(a: number, b: number, name: string, category: string): JudgeCase {
  const sum = a + b;
  return bitCase(
    name,
    category,
    { ...nib("A", a), ...nib("B", b) },
    { ...nib("S", sum), Cout: (sum >> 4) as Bit },
  );
}

function add4Cases(): JudgeCase[] {
  const cases: JudgeCase[] = [
    add4(0, 0, "0+0", "zero"),
    add4(3, 4, "3+4", "basic"),
    add4(5, 2, "5+2", "basic"),
    add4(9, 6, "9+6", "basic"),
    add4(7, 1, "7+1 carry", "carry-chain"),
    add4(15, 1, "15+1 wraps", "carry-chain"),
    add4(0b0111, 0b0001, "0111+0001", "carry-chain"),
    add4(0b1011, 0b0101, "1011+0101", "carry-chain"),
    add4(15, 15, "15+15", "overflow"),
    add4(15, 0, "15+0", "max"),
    add4(0, 15, "0+15", "max"),
    add4(8, 8, "8+8", "overflow"),
  ];
  // Deterministic pseudo-random spread (LCG) — no runtime randomness.
  let seed = 0x2f6e;
  for (let i = 0; i < 38; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const a = seed & 0xf;
    const b = (seed >> 4) & 0xf;
    const cat = a + b > 15 ? "overflow" : a === 0 || b === 0 ? "zero" : "random";
    cases.push(add4(a, b, `${a}+${b}`, cat));
  }
  return cases;
}

function neg4Cases(): JudgeCase[] {
  const cases: JudgeCase[] = [];
  for (let a = 0; a < 16; a += 1) {
    const r = -a & 0xf;
    const category = a === 0 ? "zero" : a === 8 ? "sign-boundary" : a === 15 ? "max" : "basic";
    cases.push(bitCase(`-${a}`, category, nib("A", a), nib("R", r)));
  }
  return cases;
}

function sub4(a: number, b: number, name: string, category: string): JudgeCase {
  return bitCase(name, category, { ...nib("A", a), ...nib("B", b) }, nib("R", (a - b) & 0xf));
}

function sub4Cases(): JudgeCase[] {
  const cases: JudgeCase[] = [
    sub4(0, 0, "0-0", "zero"),
    sub4(5, 3, "5-3", "basic"),
    sub4(9, 4, "9-4", "basic"),
    sub4(15, 15, "15-15", "zero"),
    sub4(0, 1, "0-1 borrow", "borrow"),
    sub4(0, 15, "0-15 borrow", "borrow"),
    sub4(3, 7, "3-7 borrow", "borrow"),
    sub4(8, 9, "8-9 borrow", "borrow"),
    sub4(15, 1, "15-1", "basic"),
    sub4(1, 0, "1-0", "basic"),
    sub4(8, 8, "8-8", "zero"),
    sub4(15, 0, "15-0", "max"),
  ];
  let seed = 0x5a11;
  for (let i = 0; i < 38; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const a = seed & 0xf;
    const b = (seed >> 4) & 0xf;
    const cat = a < b ? "borrow" : a === b ? "zero" : "random";
    cases.push(sub4(a, b, `${a}-${b}`, cat));
  }
  return cases;
}

function mul4(a: number, b: number, name: string, category: string): JudgeCase {
  return bitCase(name, category, { ...nib("A", a), ...nib("B", b) }, byte("P", a * b));
}

function mul4Cases(): JudgeCase[] {
  const cases: JudgeCase[] = [
    mul4(0, 0, "0×0", "zero"),
    mul4(0, 15, "0×15", "zero"),
    mul4(15, 0, "15×0", "zero"),
    mul4(1, 1, "1×1", "identity"),
    mul4(7, 1, "7×1", "identity"),
    mul4(1, 9, "1×9", "identity"),
    mul4(15, 15, "15×15=225", "max"),
    mul4(3, 5, "3×5", "basic"),
    mul4(6, 7, "6×7", "basic"),
    mul4(2, 4, "2×4", "power-shift"),
    mul4(4, 4, "4×4", "power-shift"),
    mul4(8, 2, "8×2", "power-shift"),
    mul4(9, 9, "9×9", "basic"),
    mul4(12, 11, "12×11", "basic"),
  ];
  let seed = 0x71c3;
  for (let i = 0; i < 34; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const a = seed & 0xf;
    const b = (seed >> 6) & 0xf;
    const cat = a === 0 || b === 0 ? "zero" : a === 1 || b === 1 ? "identity" : "random";
    cases.push(mul4(a, b, `${a}×${b}`, cat));
  }
  return cases;
}

function calc(a: number, b: number, op: number, name: string, category: string): JudgeCase {
  let r: number;
  if (op === 0) r = (a + b) & 0xf;
  else if (op === 1) r = (a - b) & 0xf;
  else if (op === 2) r = (a * b) & 0xf;
  else r = a ^ b;
  return bitCase(
    name,
    category,
    { ...nib("A", a), ...nib("B", b), Op1: ((op >> 1) & 1) as Bit, Op0: (op & 1) as Bit },
    nib("R", r),
  );
}

function calculatorCases(): JudgeCase[] {
  const ops = ["add", "sub", "mul", "xor"] as const;
  const cases: JudgeCase[] = [
    calc(3, 4, 0, "add 3+4", "op-add"),
    calc(15, 1, 0, "add 15+1", "op-add"),
    calc(5, 3, 1, "sub 5-3", "op-sub"),
    calc(0, 1, 1, "sub 0-1", "op-sub"),
    calc(3, 5, 1, "sub 3-5→14", "op-sub"),
    calc(6, 7, 2, "mul 6×7→10", "op-mul"),
    calc(15, 15, 2, "mul 15×15→1", "op-mul"),
    calc(3, 5, 2, "mul 3×5→15", "op-mul"),
    calc(0b1010, 0b0110, 3, "xor 1010^0110", "op-xor"),
    calc(0b1111, 0b1111, 3, "xor 1111^1111", "op-xor"),
    calc(0, 0, 0, "add 0+0", "op-add"),
    calc(0, 0, 3, "xor 0^0", "op-xor"),
  ];
  let seed = 0x33d9;
  for (let i = 0; i < 54; i += 1) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const a = seed & 0xf;
    const b = (seed >> 4) & 0xf;
    const op = (seed >> 8) & 3;
    cases.push(calc(a, b, op, `${ops[op]} ${a},${b}`, `op-${ops[op]}`));
  }
  return cases;
}

export const HIDDEN_TESTS: Record<number, JudgeCase[]> = {
  1: halfAdderCases(),
  2: fullAdderCases(),
  3: add4Cases(),
  4: neg4Cases(),
  5: sub4Cases(),
  6: mul4Cases(),
  7: calculatorCases(),
};

export function hiddenTestsFor(stageIndex: number): JudgeCase[] {
  return HIDDEN_TESTS[stageIndex] ?? [];
}
