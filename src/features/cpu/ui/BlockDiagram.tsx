import type { OpName } from "../domain/isa.ts";
import type { TraceRow } from "../domain/machine.ts";

type PartId = "ctrl" | "regs" | "alu" | "mem" | "io";
type WireId = "addr" | "instr" | "data" | "r2a" | "a2r" | "store" | "load" | "imm" | "io";

const PARTS: {
  id: PartId;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
}[] = [
  { id: "ctrl", x: 20, y: 18, w: 150, h: 64, title: "控制器", sub: "PC · IR · 译码" },
  { id: "alu", x: 220, y: 18, w: 130, h: 64, title: "运算器", sub: "ALU +/−" },
  { id: "regs", x: 20, y: 118, w: 120, h: 56, title: "寄存器", sub: "A · B" },
  { id: "mem", x: 220, y: 108, w: 200, h: 66, title: "存储器", sub: "16 格 × 8 位" },
  { id: "io", x: 460, y: 62, w: 120, h: 66, title: "输入 / 输出", sub: "初始数据 · 结果" },
];

/** Bus wires between parts; label sits near the line's midpoint. */
const WIRES: {
  id: WireId;
  label?: string;
  lx?: number;
  ly?: number;
  path: string;
}[] = [
  { id: "addr", label: "地址 PC", lx: 180, ly: 40, path: "M170 40 H210 V95 H255 V108" },
  { id: "instr", label: "指令 → IR", lx: 118, ly: 152, path: "M220 141 H95 V82" },
  { id: "data", label: "数据", lx: 348, ly: 98, path: "M330 108 V82" },
  { id: "r2a", label: "寄存器", lx: 168, ly: 90, path: "M140 132 H190 V60 H220" },
  { id: "a2r", label: "结果", lx: 168, ly: 60, path: "M220 76 H170 V118" },
  { id: "store", label: "写入", lx: 168, ly: 168, path: "M140 164 H220" },
  { id: "load", label: "读出", lx: 168, ly: 140, path: "M220 148 H140" },
  { id: "imm", label: "立即数", lx: 66, ly: 104, path: "M55 82 V118" },
  { id: "io", label: "装入", lx: 432, ly: 90, path: "M460 95 H420" },
];

/**
 * The inspectable causal paths (issue #70 §5.3): which parts and wires
 * carry a value in each phase, per op.
 * - fetch: PC/control → memory → IR
 * - decode: IR → controller internals
 * - exec: LOAD mem→reg · STORE reg→mem · ADD/SUB mem+reg→ALU→reg ·
 *   JZ/JMP condition→PC · LDI IR(立即数)→reg · HALT ctrl stop
 */
const EXEC_WIRES: Record<OpName, { parts: PartId[]; wires: WireId[] }> = {
  LOAD: { parts: ["mem", "regs"], wires: ["load"] },
  STORE: { parts: ["regs", "mem"], wires: ["store"] },
  ADD: { parts: ["mem", "regs", "alu"], wires: ["data", "r2a", "a2r"] },
  SUB: { parts: ["mem", "regs", "alu"], wires: ["data", "r2a", "a2r"] },
  JZ: { parts: ["ctrl", "regs"], wires: [] },
  JMP: { parts: ["ctrl"], wires: [] },
  LDI: { parts: ["ctrl", "regs"], wires: ["imm"] },
  HALT: { parts: ["ctrl"], wires: [] },
};

export type CpuPhase = "fetch" | "decode" | "exec";

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
 * or exec (per-op path). No pending cycle → the committed op's path.
 */
export function BlockDiagram(props: {
  /** Op that committed most recently — shown when nothing is pending. */
  op: OpName | null;
  /** The pending cycle's trace row (fetch/decode/exec previews). */
  pending?: TraceRow | null;
  phase?: CpuPhase | null;
}) {
  const { op, pending, phase } = props;
  let parts = new Set<PartId>();
  let wires = new Set<WireId>();
  let caption: string | null = null;

  if (pending && phase) {
    const scope = phase === "exec" ? EXEC_WIRES[pending.decoded.op] : PHASE_PARTS[phase];
    parts = new Set(scope.parts);
    wires = new Set(scope.wires);
    if (phase === "exec") caption = execCaption(pending);
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
      <svg aria-hidden="true" viewBox="0 0 600 200">
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
            <text className="cpu-part-title" x={part.x + 14} y={part.y + 27}>
              {part.title}
            </text>
            <text className="cpu-part-sub" x={part.x + 14} y={part.y + 48}>
              {part.sub}
            </text>
          </g>
        ))}
      </svg>
    </section>
  );
}
