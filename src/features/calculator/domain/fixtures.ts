/**
 * Reference circuit fixtures. These are correct solutions used by tests
 * (and by nothing in the shipped UI) to prove the evaluator and the judge
 * agree with the arithmetic they are supposed to teach.
 */

import type { CircuitEdge, CircuitGraph, CircuitNode, GateKind } from "./graph.ts";

let seq = 0;
function id(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

export function resetFixtureIds(): void {
  seq = 0;
}

type Builder = {
  input: (name: string, x?: number, y?: number) => string;
  output: (name: string, from: string, x?: number, y?: number) => void;
  constant: (value: 0 | 1) => string;
  gate: (kind: GateKind, ins: string[], x?: number, y?: number) => string;
  /** Instantiate an unlocked component; returns a port accessor. */
  component: (name: string, ins: Record<string, string>) => (port: string) => string;
  graph: () => CircuitGraph;
};

/**
 * Wire builder. A "wire handle" is the string `nodeId#port` produced by any
 * output; passing it to another node's input list creates the edge.
 */
export function build(fn: (b: Builder) => void): CircuitGraph {
  const nodes: CircuitNode[] = [];
  const edges: CircuitEdge[] = [];
  let row = 0;

  const connect = (handle: string, node: string, port: string) => {
    const [fromNode, fromPort] = handle.split("#");
    edges.push({ id: id("e"), from: { node: fromNode, port: fromPort }, to: { node, port } });
  };

  const builder: Builder = {
    input(name, x = 0, y = (row += 40)) {
      const nodeId = id("in");
      nodes.push({ id: nodeId, kind: "input", name, value: 0, x, y });
      return `${nodeId}#out`;
    },
    output(name, from, x = 640, y = (row += 40)) {
      const nodeId = id("out");
      nodes.push({ id: nodeId, kind: "output", name, x, y });
      connect(from, nodeId, "in");
    },
    constant(value) {
      const nodeId = id("const");
      nodes.push({ id: nodeId, kind: "const", value, x: 0, y: (row += 40) });
      return `${nodeId}#out`;
    },
    gate(kind, ins, x = 300, y = (row += 40)) {
      const nodeId = id(kind);
      nodes.push({ id: nodeId, kind, x, y });
      const ports = kind === "not" || kind === "buffer" ? ["in"] : ["in0", "in1"];
      ins.forEach((handle, index) => connect(handle, nodeId, ports[index]));
      return `${nodeId}#out`;
    },
    component(name, ins) {
      const nodeId = id("cmp");
      nodes.push({ id: nodeId, kind: "component", name, x: 300, y: (row += 60) });
      for (const [port, handle] of Object.entries(ins)) connect(handle, nodeId, port);
      return (port: string) => `${nodeId}#${port}`;
    },
    graph: () => ({ nodes, edges }),
  };

  fn(builder);
  return builder.graph();
}

/** Stage 1: a bare wire, A straight into Y. */
export function wireGraph(): CircuitGraph {
  return build((b) => {
    const a = b.input("A");
    b.output("Y", a);
  });
}

/** Optional side challenge: Y is 1 only when A=0 and B=1. */
export function secondTickGraph(): CircuitGraph {
  return build((b) => {
    const a = b.input("A");
    const bb = b.input("B");
    b.output("Y", b.gate("and", [b.gate("not", [a]), bb]));
  });
}

/** Optional side challenge: odd parity of three inputs. */
export function odd3Graph(): CircuitGraph {
  return build((b) => {
    const a = b.input("A");
    const bb = b.input("B");
    const c = b.input("C");
    b.output("Y", b.gate("xor", [b.gate("xor", [a, bb]), c]));
  });
}

/** Optional side challenge: at least two of three inputs are 1. */
export function majority3Graph(): CircuitGraph {
  return build((b) => {
    const a = b.input("A");
    const bb = b.input("B");
    const c = b.input("C");
    const ab = b.gate("and", [a, bb]);
    const ac = b.gate("and", [a, c]);
    const bc = b.gate("and", [bb, c]);
    b.output("Y", b.gate("or", [b.gate("or", [ab, ac]), bc]));
  });
}

export function halfAdderGraph(): CircuitGraph {
  return build((b) => {
    const a = b.input("A");
    const bb = b.input("B");
    b.output("Sum", b.gate("xor", [a, bb]));
    b.output("Carry", b.gate("and", [a, bb]));
  });
}

/** Full adder from two half adders (uses the unlocked HalfAdder component). */
export function fullAdderGraph(): CircuitGraph {
  return build((b) => {
    const a = b.input("A");
    const bb = b.input("B");
    const cin = b.input("Cin");
    const first = b.component("HalfAdder", { A: a, B: bb });
    const second = b.component("HalfAdder", { A: first("Sum"), B: cin });
    b.output("Sum", second("Sum"));
    b.output("Cout", b.gate("or", [first("Carry"), second("Carry")]));
  });
}

/** Full adder built from primitives only (no components). */
export function fullAdderPrimitiveGraph(): CircuitGraph {
  return build((b) => {
    const a = b.input("A");
    const bb = b.input("B");
    const cin = b.input("Cin");
    const axb = b.gate("xor", [a, bb]);
    b.output("Sum", b.gate("xor", [axb, cin]));
    b.output("Cout", b.gate("or", [b.gate("and", [axb, cin]), b.gate("and", [a, bb])]));
  });
}

export function add4Graph(): CircuitGraph {
  return build((b) => {
    const a = [0, 1, 2, 3].map((i) => b.input(`A${i}`));
    const bb = [0, 1, 2, 3].map((i) => b.input(`B${i}`));
    let carry = b.constant(0);
    for (let i = 0; i < 4; i += 1) {
      const adder = b.component("FullAdder", { A: a[i], B: bb[i], Cin: carry });
      b.output(`S${i}`, adder("Sum"));
      carry = adder("Cout");
    }
    b.output("Cout", carry);
  });
}

export function neg4Graph(): CircuitGraph {
  return build((b) => {
    const a = [0, 1, 2, 3].map((i) => b.input(`A${i}`));
    const inverted = a.map((handle) => b.gate("not", [handle]));
    const one = b.constant(1);
    const zero = b.constant(0);
    const adder = b.component("Add4", {
      A0: inverted[0],
      A1: inverted[1],
      A2: inverted[2],
      A3: inverted[3],
      B0: one,
      B1: zero,
      B2: zero,
      B3: zero,
    });
    for (let i = 0; i < 4; i += 1) b.output(`R${i}`, adder(`S${i}`));
  });
}

export function sub4Graph(): CircuitGraph {
  return build((b) => {
    const a = [0, 1, 2, 3].map((i) => b.input(`A${i}`));
    const bb = [0, 1, 2, 3].map((i) => b.input(`B${i}`));
    const neg = b.component("Neg4", { A0: bb[0], A1: bb[1], A2: bb[2], A3: bb[3] });
    const adder = b.component("Add4", {
      A0: a[0],
      A1: a[1],
      A2: a[2],
      A3: a[3],
      B0: neg("R0"),
      B1: neg("R1"),
      B2: neg("R2"),
      B3: neg("R3"),
    });
    for (let i = 0; i < 4; i += 1) b.output(`R${i}`, adder(`S${i}`));
  });
}

/** 4×4 shift-and-add multiplier producing an 8-bit product. */
export function mul4Graph(): CircuitGraph {
  return build((b) => {
    const a = [0, 1, 2, 3].map((i) => b.input(`A${i}`));
    const bb = [0, 1, 2, 3].map((i) => b.input(`B${i}`));
    const zero = b.constant(0);

    // Partial products: pp[j][i] = A[i] AND B[j], contributing to weight i+j.
    const pp = bb.map((bit) => a.map((abit) => b.gate("and", [abit, bit])));

    // accumulator[weight] holds the running sum bits.
    const acc: string[] = [pp[0][0], pp[0][1], pp[0][2], pp[0][3], zero, zero, zero, zero];

    for (let j = 1; j < 4; j += 1) {
      let carry = zero;
      for (let i = 0; i < 8 - j; i += 1) {
        const addend = i < 4 ? pp[j][i] : zero;
        const adder = b.component("FullAdder", { A: acc[i + j], B: addend, Cin: carry });
        acc[i + j] = adder("Sum");
        carry = adder("Cout");
      }
    }
    for (let i = 0; i < 8; i += 1) b.output(`P${i}`, acc[i]);
  });
}

/** Stage 7: op-selected calculator over 4-bit operands. */
export function calculatorGraph(): CircuitGraph {
  return build((b) => {
    const a = [0, 1, 2, 3].map((i) => b.input(`A${i}`));
    const bb = [0, 1, 2, 3].map((i) => b.input(`B${i}`));
    const op1 = b.input("Op1");
    const op0 = b.input("Op0");

    const add = b.component("Add4", {
      A0: a[0],
      A1: a[1],
      A2: a[2],
      A3: a[3],
      B0: bb[0],
      B1: bb[1],
      B2: bb[2],
      B3: bb[3],
    });
    const sub = b.component("Sub4", {
      A0: a[0],
      A1: a[1],
      A2: a[2],
      A3: a[3],
      B0: bb[0],
      B1: bb[1],
      B2: bb[2],
      B3: bb[3],
    });
    const mul = b.component("Mul4", {
      A0: a[0],
      A1: a[1],
      A2: a[2],
      A3: a[3],
      B0: bb[0],
      B1: bb[1],
      B2: bb[2],
      B3: bb[3],
    });

    const notOp1 = b.gate("not", [op1]);
    const notOp0 = b.gate("not", [op0]);
    const sel = [
      b.gate("and", [notOp1, notOp0]), // 00 add
      b.gate("and", [notOp1, op0]), // 01 sub
      b.gate("and", [op1, notOp0]), // 10 mul
      b.gate("and", [op1, op0]), // 11 xor
    ];

    for (let i = 0; i < 4; i += 1) {
      const options = [add(`S${i}`), sub(`R${i}`), mul(`P${i}`), b.gate("xor", [a[i], bb[i]])];
      const gated = options.map((value, index) => b.gate("and", [value, sel[index]]));
      const or01 = b.gate("or", [gated[0], gated[1]]);
      const or23 = b.gate("or", [gated[2], gated[3]]);
      b.output(`R${i}`, b.gate("or", [or01, or23]));
    }
  });
}

/** Reference solutions keyed by stage index. */
export function referenceSolutions(): Record<number, CircuitGraph> {
  return {
    1: wireGraph(),
    2: halfAdderGraph(),
    3: fullAdderGraph(),
    4: add4Graph(),
    5: neg4Graph(),
    6: sub4Graph(),
    7: mul4Graph(),
    8: calculatorGraph(),
    9: secondTickGraph(),
    10: odd3Graph(),
    11: majority3Graph(),
  };
}
