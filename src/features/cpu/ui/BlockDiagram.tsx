import type { CpuPhase } from "../controller/viewModel.ts";
import type { OpName } from "../domain/isa.ts";
import type { TraceRow } from "../domain/machine.ts";

// 冯·诺依曼「五大部件」— the textbook layout: separate 输入/输出 boxes
// (点餐机's DIP switches and 数码管), and registers folded into the
// controller rather than a sixth box the textbook doesn't draw.
type PartId = "input" | "output" | "alu" | "ctrl" | "mem";
type WireId = "in" | "out" | "addr" | "instr" | "data" | "r2a" | "a2r" | "store" | "load" | "imm";

const PARTS: {
  id: PartId;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
}[] = [
  { id: "input", x: 16, y: 76, w: 108, h: 56, title: "输入", sub: "拨码开关" },
  { id: "alu", x: 168, y: 76, w: 104, h: 56, title: "运算器", sub: "ALU +/−" },
  { id: "ctrl", x: 316, y: 18, w: 168, h: 56, title: "控制器", sub: "PC · IR · 译码 · A·B" },
  { id: "mem", x: 316, y: 118, w: 168, h: 62, title: "存储器", sub: "16 格 × 8 位" },
  { id: "output", x: 528, y: 76, w: 64, h: 56, title: "输出", sub: "数码管" },
];

/** Bus wires between parts; label sits near the line's midpoint. */
const WIRES: {
  id: WireId;
  label?: string;
  lx?: number;
  ly?: number;
  path: string;
}[] = [
  // input → memory (LOAD reads the 拨码开关 cell)
  { id: "in", label: "读入", lx: 130, ly: 122, path: "M124 118 H300 V150 H316" },
  // memory → output (STORE to the 数码管 cell)
  { id: "out", label: "写出", lx: 490, ly: 112, path: "M484 150 H528" },
  // fetch: controller → memory (address), memory → controller (instruction)
  { id: "addr", label: "地址 PC", lx: 300, ly: 92, path: "M370 74 V118" },
  { id: "instr", label: "指令 → IR", lx: 412, ly: 92, path: "M418 118 V74" },
  // exec: memory ↔ registers/ALU data paths along the bottom of mem
  { id: "data", label: "数据", lx: 452, ly: 132, path: "M452 118 V96" },
  { id: "r2a", label: "寄存器", lx: 236, ly: 62, path: "M236 76 V46 H316" },
  { id: "a2r", label: "结果", lx: 268, ly: 62, path: "M316 34 H204 V76" },
  { id: "store", label: "写入", lx: 268, ly: 158, path: "M272 132 H300 V164 H316" },
  { id: "load", label: "读出", lx: 236, ly: 158, path: "M316 156 H240 V132" },
  { id: "imm", label: "立即数", lx: 340, ly: 92, path: "M340 74 V118" },
];

/**
 * The inspectable causal paths (issue #70 §5.3): which parts and wires
 * carry a value in each phase, per op.
 * - fetch: PC/control → memory → IR
 * - decode: IR → controller internals
 * - exec: LOAD mem→reg · STORE reg→mem · ADD/SUB mem+reg→ALU→reg ·
 *   JZ/JMP condition→PC · LDI IR(立即数)→reg · HALT ctrl stop
 *
 * The 输入/输出 boxes light on the ops that touch their cells: a LOAD/ADD/SUB
 * operand reads the input (拨码开关) cell, a STORE operand writes the output
 * (数码管) cell — the page resolves the seeded addresses, this map keeps the
 * base shape.
 */
const EXEC_WIRES: Record<OpName, { parts: PartId[]; wires: WireId[] }> = {
  LOAD: { parts: ["mem", "ctrl", "input"], wires: ["load", "in"] },
  STORE: { parts: ["ctrl", "mem", "output"], wires: ["store", "out"] },
  ADD: { parts: ["mem", "ctrl", "alu", "input"], wires: ["data", "r2a", "a2r", "in"] },
  SUB: { parts: ["mem", "ctrl", "alu", "input"], wires: ["data", "r2a", "a2r", "in"] },
  JZ: { parts: ["ctrl"], wires: [] },
  JMP: { parts: ["ctrl"], wires: [] },
  LDI: { parts: ["ctrl"], wires: ["imm"] },
  HALT: { parts: ["ctrl"], wires: [] },
};

const PHASE_PARTS: Record<CpuPhase, { parts: PartId[]; wires: WireId[] }> = {
  fetch: { parts: ["ctrl", "mem"], wires: ["addr", "instr"] },
  decode: { parts: ["ctrl"], wires: [] },
  exec: { parts: [], wires: [] }, // filled per-op below
};

/** One line under the controller describing what the pending op does. */
function execCaption(row: TraceRow): string {
  const { op, reg, operand } = row.decoded;
  const r = reg === 0 ? "A" : "B";
  switch (op) {
    case "LOAD":
      return `M[${operand}] → ${r}`;
    case "STORE":
      return `${r} → M[${operand}]`;
    case "ADD":
      return `${r} + M[${operand}] → ${r}`;
    case "SUB":
      return `${r} − M[${operand}] → ${r}`;
    case "JZ":
      return row.branchTaken ? `${r}==0 → PC←${operand}` : `${r}≠0 → PC+1`;
    case "JMP":
      return `PC ← ${operand}`;
    case "LDI":
      return `立即数 ${operand} → ${r}`;
    case "HALT":
      return "停机";
  }
}

/**
 * The five-part von Neumann block diagram. `phase` selects which causal
 * path of the pending cycle is lit: fetch (PC→mem→IR), decode (IR→ctrl),
 * or exec (per-op path, with the I/O boxes lit on their cells). No pending
 * cycle → the committed op's path.
 */
export function BlockDiagram(props: {
  /** Op that committed most recently — shown when nothing is pending. */
  op: OpName | null;
  /** The pending cycle's trace row (fetch/decode/exec previews). */
  pending?: TraceRow | null;
  phase?: CpuPhase | null;
  /** The seeded 拨码开关 input cell, when the stage declares one. */
  inputCell?: number;
  /** The seeded 数码管 output cell, when the stage declares one. */
  outputCell?: number;
}) {
  const { op, pending, phase, inputCell, outputCell } = props;
  let parts = new Set<PartId>();
  let wires = new Set<WireId>();
  let caption: string | null = null;

  if (pending && phase) {
    const scope = EXEC_WIRES[pending.decoded.op];
    const base = phase === "exec" ? scope : PHASE_PARTS[phase];
    parts = new Set(base.parts);
    wires = new Set(base.wires);
    if (phase === "exec") {
      caption = execCaption(pending);
      // Light only the I/O box whose cell this op actually touches.
      const operand = pending.decoded.operand;
      if (pending.decoded.op === "STORE") {
        if (operand === outputCell) wires.add("out");
        else wires.delete("out");
        if (outputCell === undefined || operand !== outputCell) parts.delete("output");
      } else {
        if (operand === inputCell) wires.add("in");
        else wires.delete("in");
        if (inputCell === undefined || operand !== inputCell) parts.delete("input");
      }
    }
  } else if (op !== null) {
    // Run ended: replay the last committed cycle's whole path.
    const scope = EXEC_WIRES[op];
    parts = new Set(["ctrl", "mem", ...scope.parts]);
    wires = new Set(["addr", "instr", ...scope.wires]);
  }

  return (
    <section aria-label="数据通路图" className="cpu-diagram">
      <div className="cpu-panel-heading">
        <h3>数据通路 · 五大部件</h3>
        <p className="cpu-panel-note">
          每条指令都走同一趟路：取指 → 译码 → 执行。
          {caption ? <strong className="cpu-diagram-caption">{caption}</strong> : null}
        </p>
      </div>
      <svg aria-hidden="true" viewBox="0 0 608 200">
        {WIRES.map((wire) => (
          <g key={wire.id}>
            <path className={`cpu-wire${wires.has(wire.id) ? " is-active" : ""}`} d={wire.path} />
            {wire.label ? (
              <text
                className={`cpu-wire-label${wires.has(wire.id) ? " is-active" : ""}`}
                x={wire.lx}
                y={wire.ly}
              >
                {wire.label}
              </text>
            ) : null}
          </g>
        ))}
        {PARTS.map((part) => (
          <g className={`cpu-part${parts.has(part.id) ? " is-active" : ""}`} key={part.id}>
            <rect height={part.h} rx={8} width={part.w} x={part.x} y={part.y} />
            <text className="cpu-part-title" x={part.x + 14} y={part.y + 26}>
              {part.title}
            </text>
            <text className="cpu-part-sub" x={part.x + 14} y={part.y + 44}>
              {part.sub}
            </text>
          </g>
        ))}
      </svg>
    </section>
  );
}
