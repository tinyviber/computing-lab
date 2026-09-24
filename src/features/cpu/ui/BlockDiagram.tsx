import type { OpName } from "../domain/isa.ts";

type PartId = "ctrl" | "regs" | "alu" | "mem" | "io";

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
  from: PartId;
  to: PartId;
  label?: string;
  lx?: number;
  ly?: number;
  path: string;
}[] = [
  { from: "ctrl", to: "mem", label: "地址", lx: 180, ly: 40, path: "M170 40 H210 V95 H255 V108" },
  { from: "mem", to: "ctrl", label: "指令", lx: 150, ly: 152, path: "M220 141 H95 V82" },
  { from: "mem", to: "alu", label: "数据", lx: 348, ly: 98, path: "M330 108 V82" },
  { from: "regs", to: "alu", label: "", path: "M140 132 H190 V60 H220" },
  { from: "alu", to: "regs", label: "", path: "M220 76 H170 V118" },
  { from: "regs", to: "mem", label: "写入", lx: 168, ly: 152, path: "M140 160 H220" },
  { from: "io", to: "mem", label: "装入", lx: 432, ly: 90, path: "M460 95 H420" },
];

/** Which parts light up while executing `op`. */
const ACTIVE_BY_OP: Record<OpName, PartId[]> = {
  LOAD: ["mem", "regs"],
  STORE: ["regs", "mem"],
  ADD: ["mem", "alu", "regs"],
  SUB: ["mem", "alu", "regs"],
  JZ: ["ctrl"],
  JMP: ["ctrl"],
  LDI: ["regs"],
  HALT: ["ctrl"],
};

/**
 * The five-part von Neumann block diagram — a static poster that lights up
 * per committed cycle: fetch glows on 控制器+存储器 always, and the parts
 * the last executed op touched join it.
 */
export function BlockDiagram(props: {
  /** The op that committed most recently — its whole cycle is highlighted. */
  op: OpName | null;
}) {
  const { op } = props;
  // Every committed cycle walked fetch (控制器+存储器) then execute (per-op).
  const active = new Set<PartId>(op === null ? [] : ["ctrl", "mem", ...ACTIVE_BY_OP[op]]);

  return (
    <section aria-label="数据通路图" className="cpu-diagram">
      <div className="cpu-panel-heading">
        <h3>数据通路 · 五大部件</h3>
        <p className="cpu-panel-note">每条指令都走同一趟路：取指 → 译码 → 执行。</p>
      </div>
      <svg aria-hidden="true" viewBox="0 0 600 200">
        {WIRES.map((wire) => (
          <g key={wire.path}>
            <path className="cpu-wire" d={wire.path} />
            {wire.label ? (
              <text className="cpu-wire-label" x={wire.lx} y={wire.ly}>
                {wire.label}
              </text>
            ) : null}
          </g>
        ))}
        {PARTS.map((part) => (
          <g className={`cpu-part${active.has(part.id) ? " is-active" : ""}`} key={part.id}>
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
