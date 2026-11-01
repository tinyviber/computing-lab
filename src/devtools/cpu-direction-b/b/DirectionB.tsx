// Direction B · 芯片桌 — the machine laid out as a board you can point at.
// Memory on the left, CPU parts on the right, and the wires this beat used drawn between
// them with the value written on the wire. Everything else (task, program editor, trace,
// submit) lives in one tabbed drawer so the board stays the projected focus.

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import "../fonts/fonts.css";
import "./b.css";
import {
  bits,
  decode,
  encode,
  explainInstr,
  formatInstr,
  groupedBits,
  type Instr,
} from "../core/isa";
import { useHotkeys, useLab, type Lab, type LabState, type Speed } from "../core/lab";
import { cellRole, levelById } from "../core/levels";
import { PHASE_ZH, PHASES, STATUS_ZH } from "../core/machine";
import {
  ByteBench,
  CalculatorNote,
  CHALLENGES,
  ConflictPanel,
  CORE,
  DiffList,
  gateHere,
  gateWhere,
  Hints,
  InstrControls,
  levelState,
  LineActions,
  LockIcon,
  LOCK_ZH,
  marksOf,
  nextLevels,
  QuestionBlock,
  requiresText,
  SaveStatus,
  STATE_ZH,
  submitChecklist,
  TestTable,
  TraceList,
  useMedia,
  Why,
} from "../core/ui";

type Tab = "task" | "program" | "trace" | "submit";
const TABS: { id: Tab; zh: string }[] = [
  { id: "task", zh: "任务" },
  { id: "program", zh: "程序" },
  { id: "trace", zh: "轨迹" },
  { id: "submit", zh: "提交" },
];
const SPEEDS: { id: Speed; zh: string }[] = [
  { id: "slow", zh: "慢" },
  { id: "normal", zh: "中" },
  { id: "fast", zh: "快" },
];

/* ---------- what the viewed beat did, and where the next beat will go ---------- */

// 'PC' | 'IR' | 'DEC' | 'ALU' | 'NPC' | 'A' | 'B' | `m${addr}`
type Key = string;
interface Wire {
  from: Key;
  to: Key;
  kind: "done" | "next";
  label: string;
  /** Sideways offset so a there-and-back pair (A → ALU → A) does not overlap. */
  lane?: number;
}
interface Story {
  wires: Wire[];
  done: Map<Key, string>;
  next: Map<Key, string>;
  bus: string;
}

function story(lab: Lab): Story {
  const { viewing, reviewing, live } = lab;
  const ev = viewing.ev;
  const m = viewing.m;
  const marks = marksOf(viewing);
  const wires: Wire[] = [];
  const done = new Map<Key, string>();
  const next = new Map<Key, string>();
  const was = (r: "A" | "B") => (marks.from.has(r) ? (marks.from.get(r) as number) : m[r]);
  let bus = "复位完成：PC = 0，IR 为空。还没有数据经过总线。";
  if (ev?.phase === "fetch" && m.access.fetch !== undefined) {
    const a = m.access.fetch;
    wires.push({ from: "PC", to: `m${a}`, kind: "done", label: `地址 ${a}` });
    wires.push({ from: `m${a}`, to: "IR", kind: "done", label: `${m.ir}` });
    done.set("PC", "给出地址").set(`m${a}`, "被取").set("IR", "装入");
    bus = `取指：PC 给出地址 ${a}，M[${a}] 里的 byte ${bits(m.ir ?? 0)}（= ${m.ir}）复制进 IR。`;
  } else if (ev?.phase === "decode") {
    wires.push({ from: "IR", to: "DEC", kind: "done", label: "" });
    done.set("IR", "拆成三段").set("DEC", "译码");
    bus = `译码：IR 拆成 操作码 / 寄存器 / 操作数，读出 ${formatInstr(decode(m.ir ?? 0))}。这一拍没有数据移动。`;
  } else if (ev?.record) {
    const { instr: i, nextPc, jumped, alu } = ev.record;
    const r = i.reg;
    done.set("DEC", "执行");
    switch (i.op) {
      case "LOAD":
        wires.push({
          from: `m${i.operand}`,
          to: r,
          kind: "done",
          label: `${m.mem[i.operand] & 15}`,
        });
        done.set(`m${i.operand}`, "读").set(r, "写入");
        bus = `LOAD：M[${i.operand}] 的低 4 位经数据总线送进 ${r}，${r} = ${m[r]}。`;
        break;
      case "STORE":
        wires.push({ from: r, to: `m${i.operand}`, kind: "done", label: `${m[r]}` });
        done.set(r, "读").set(`m${i.operand}`, "写");
        bus = `STORE：${r} 的值 ${m[r]} 在周期末写入 M[${i.operand}]。`;
        break;
      case "ADD":
      case "SUB":
        wires.push({
          from: `m${i.operand}`,
          to: "ALU",
          kind: "done",
          label: `${m.mem[i.operand] & 15}`,
        });
        wires.push({ from: r, to: "ALU", kind: "done", label: `${was(r)}`, lane: -14 });
        wires.push({ from: "ALU", to: r, kind: "done", label: `${m[r]}`, lane: 14 });
        done.set(`m${i.operand}`, "读").set("ALU", "运算").set(r, "写回结果");
        bus = `${i.op}：${r}（${was(r)}）和 M[${i.operand}]（${m.mem[i.operand] & 15}）进入 ALU，完整结果 ${alu?.raw}，${r} 只留下低 4 位 ${m[r]}${
          alu?.on ? `，${alu.kind === "carry" ? "进位" : "借位"}线索亮起` : ""
        }。`;
        break;
      case "JZ":
        wires.push({ from: r, to: "NPC", kind: "done", label: `${m[r]}` });
        wires.push({ from: "IR", to: "NPC", kind: "done", label: `→${i.operand}` });
        done.set(r, "是 0 吗？").set("IR", "给出目标");
        bus = jumped
          ? `JZ：${r} = 0，下一条改去 M[${nextPc}]。`
          : `JZ：${r} = ${m[r]} ≠ 0，不跳转，下一条是 M[${nextPc}]。`;
        break;
      case "JMP":
        wires.push({ from: "IR", to: "NPC", kind: "done", label: `→${i.operand}` });
        done.set("IR", "给出目标");
        bus = `JMP：下一条改去 M[${nextPc}]。`;
        break;
      case "LDI":
        wires.push({ from: "IR", to: r, kind: "done", label: `${i.operand}` });
        done.set("IR", "给出操作数").set(r, "写入");
        bus = `LDI：IR 里的操作数 ${i.operand} 直接装进 ${r}。`;
        break;
      case "HALT":
        bus = "HALT：机器正常停机，PC 不再前进。";
        break;
    }
    if (i.op !== "HALT") {
      wires.push({ from: "NPC", to: "PC", kind: "done", label: `${nextPc}` });
      done.set("NPC", jumped ? "跳转" : "顺序 +1").set("PC", "周期末更新");
    }
  }
  if (!reviewing && live.status === "ready") {
    const w = (from: Key, to: Key, lane?: number) =>
      wires.push({ from, to, kind: "next", label: "", lane });
    if (live.phase === "fetch") {
      w("PC", `m${live.pc}`);
      next.set("PC", "将给地址").set(`m${live.pc}`, "将被取").set("IR", "将装入");
    } else if (live.phase === "decode") {
      w("IR", "DEC");
      next.set("IR", "将拆分").set("DEC", "将译码");
    } else {
      const i = decode(live.ir ?? 0);
      const r = i.reg;
      const mk = `m${i.operand}`;
      next.set("DEC", "将执行");
      switch (i.op) {
        case "LOAD":
          w(mk, r);
          next.set(mk, "将读").set(r, "将写");
          break;
        case "STORE":
          w(r, mk);
          next.set(r, "将读").set(mk, "将写");
          break;
        case "ADD":
        case "SUB":
          w(mk, "ALU");
          w(r, "ALU", -14);
          w("ALU", r, 14);
          next.set(mk, "将读").set(r, "将读写").set("ALU", "将运算");
          break;
        case "JZ":
          w(r, "NPC");
          next.set(r, "将检查");
          break;
        case "JMP":
          w("IR", "NPC");
          break;
        case "LDI":
          w("IR", r);
          next.set(r, "将写");
          break;
      }
      if (i.op !== "HALT") {
        w("NPC", "PC");
        next.set("NPC", "将决定").set("PC", "将更新");
      }
    }
  }
  return { wires, done, next, bus };
}

/* ---------- wires: measured from the rendered parts ---------- */

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function useBoxes() {
  const root = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<Key, HTMLElement>());
  const [boxes, setBoxes] = useState<Record<Key, Box>>({});
  const last = useRef("");
  const reg = (k: Key) => (el: HTMLElement | null) => {
    if (el) nodes.current.set(k, el);
    else nodes.current.delete(k);
  };
  const measure = () => {
    const b = root.current?.getBoundingClientRect();
    if (!b) return;
    const out: Record<Key, Box> = {};
    nodes.current.forEach((el, k) => {
      const r = el.getBoundingClientRect();
      out[k] = {
        x: Math.round(r.left - b.left),
        y: Math.round(r.top - b.top),
        w: Math.round(r.width),
        h: Math.round(r.height),
      };
    });
    const sig = JSON.stringify(out);
    if (sig !== last.current) {
      last.current = sig;
      setBoxes(out);
    }
  };
  useLayoutEffect(measure);
  useEffect(() => {
    const ro = new ResizeObserver(measure);
    if (root.current) ro.observe(root.current);
    document.fonts?.ready.then(measure);
    return () => ro.disconnect();
  }, []);
  return { root, reg, boxes };
}

interface Pt {
  x: number;
  y: number;
}

/** A PCB-style trace: orthogonal runs joined by 45° chamfers. */
function trace(pts: Pt[]) {
  const clean = pts.filter(
    (p, i) => i === 0 || Math.abs(p.x - pts[i - 1].x) + Math.abs(p.y - pts[i - 1].y) > 0.5,
  );
  let d = `M${clean[0].x},${clean[0].y}`;
  for (let i = 1; i < clean.length - 1; i++) {
    const [a, b, c] = [clean[i - 1], clean[i], clean[i + 1]];
    const r = Math.min(
      9,
      Math.hypot(b.x - a.x, b.y - a.y) / 2,
      Math.hypot(c.x - b.x, c.y - b.y) / 2,
    );
    const to = (from: Pt, t: Pt) => {
      const l = Math.hypot(t.x - from.x, t.y - from.y) || 1;
      return { x: from.x + ((t.x - from.x) / l) * r, y: from.y + ((t.y - from.y) / l) * r };
    };
    const p1 = to(b, a);
    const p2 = to(b, c);
    d += ` L${p1.x},${p1.y} L${p2.x},${p2.y}`;
  }
  const z = clean[clean.length - 1];
  d += ` L${z.x},${z.y}`;
  // Label sits on the longest run.
  let best = { l: -1, x: 0, y: 0 };
  for (let i = 1; i < clean.length; i++) {
    const l = Math.hypot(clean[i].x - clean[i - 1].x, clean[i].y - clean[i - 1].y);
    if (l > best.l)
      best = { l, x: (clean[i].x + clean[i - 1].x) / 2, y: (clean[i].y + clean[i - 1].y) / 2 };
  }
  return { d, mid: { x: best.x, y: best.y } };
}

const isMem = (k: Key) => /^m\d+$/.test(k);

/** A horizontal channel near y that does not cut through any CPU part between x0 and x1. */
function channel(y: number, x0: number, x1: number, boxes: Record<Key, Box>, skip: Key[]) {
  const blockers = Object.entries(boxes)
    .filter(
      ([k, b]) =>
        !isMem(k) && !skip.includes(k) && b.x < Math.max(x0, x1) && b.x + b.w > Math.min(x0, x1),
    )
    .map(([, b]) => b);
  const hit = (v: number) => blockers.some((b) => v > b.y - 8 && v < b.y + b.h + 8);
  if (!hit(y)) return y;
  const free = blockers.flatMap((b) => [b.y - 13, b.y + b.h + 13]).filter((v) => !hit(v));
  free.sort((a, b) => Math.abs(a - y) - Math.abs(b - y));
  return free[0] ?? y;
}

function route(w: Wire, boxes: Record<Key, Box>, bus: number) {
  const a = boxes[w.from];
  const b = boxes[w.to];
  const lane = w.lane ?? 0;
  const cy = (x: Box) => x.y + x.h / 2;
  if (isMem(w.from) || isMem(w.to)) {
    // Memory ↔ CPU: out of the memory chip, along a bus lane in the gutter, then a clear channel.
    const mem = isMem(w.from) ? a : b;
    const part = isMem(w.from) ? b : a;
    const pm = { x: mem.x + mem.w, y: cy(mem) };
    const gx = mem.x + mem.w + 16 + bus * 12;
    const enter = part.x;
    const y = channel(cy(part), gx, enter, boxes, [w.from, w.to]);
    const pts = [pm, { x: gx, y: pm.y }, { x: gx, y }];
    if (Math.abs(y - cy(part)) < 1) pts.push({ x: enter, y });
    else pts.push({ x: enter - 14, y }, { x: enter - 14, y: cy(part) }, { x: enter, y: cy(part) });
    return trace(isMem(w.from) ? pts : pts.reverse());
  }
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  if (overlapX > 8) {
    // Stacked in one column: straight down/up through the gap.
    const x = Math.max(a.x, b.x) + overlapX / 2 + lane;
    const down = a.y < b.y;
    return trace([
      { x, y: down ? a.y + a.h : a.y },
      { x, y: down ? b.y : b.y + b.h },
    ]);
  }
  const right = a.x < b.x;
  const pa = right ? a.x + a.w : a.x;
  const pb = right ? b.x : b.x + b.w;
  const lo = Math.max(a.y, b.y);
  const hi = Math.min(a.y + a.h, b.y + b.h);
  if (hi - lo > 24) {
    // Side by side: one straight run at the shared height.
    const y = (lo + hi) / 2 + lane;
    return trace([
      { x: pa, y },
      { x: pb, y },
    ]);
  }
  const mx = (pa + pb) / 2 + lane / 2;
  return trace([
    { x: pa, y: cy(a) },
    { x: mx, y: cy(a) },
    { x: mx, y: cy(b) },
    { x: pb, y: cy(b) },
  ]);
}

function Wires({ wires, boxes }: { wires: Wire[]; boxes: Record<Key, Box> }) {
  let bus = 0;
  const drawn = wires.flatMap((w, i) => {
    if (!boxes[w.from] || !boxes[w.to]) return [];
    const lane = isMem(w.from) || isMem(w.to) ? bus++ : 0;
    return [{ ...w, ...route(w, boxes, lane), i }];
  });
  return (
    <>
      <svg className="bw" aria-hidden="true" focusable="false">
        <defs>
          <marker
            id="bw-done"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="4.5"
            markerHeight="4.5"
            orient="auto"
          >
            <path d="M0,0 L10,5 L0,10 z" className="bw__head" />
          </marker>
          <marker
            id="bw-next"
            viewBox="0 0 10 10"
            refX="7"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M1,1 L9,5 L1,9" className="bw__head bw__head--next" />
          </marker>
        </defs>
        {drawn.map((w) => (
          <g key={w.i}>
            <path d={w.d} className="bw__halo" />
            <path
              d={w.d}
              className={`bw__path bw__path--${w.kind}`}
              markerEnd={`url(#bw-${w.kind})`}
            />
          </g>
        ))}
      </svg>
      {drawn
        .filter((w) => w.label)
        .map((w) => (
          <span
            key={w.i}
            className="bw__label"
            data-kind={w.kind}
            style={{ left: w.mid.x, top: w.mid.y }}
            aria-hidden="true"
          >
            {w.label}
          </span>
        ))}
    </>
  );
}

/* ---------- page ---------- */

export function DirectionB({ initial }: { initial: () => LabState }) {
  const lab = useLab(initial);
  useHotkeys(lab);
  const narrow = useMedia("(max-width: 700px)");
  const { s, level } = lab;
  const [tab, setTab] = useState<Tab>(() =>
    s.judge || s.submit === "error"
      ? "submit"
      : s.load === "error" || s.conflict || level.edit !== "none"
        ? "program"
        : "task",
  );
  useEffect(() => {
    if (s.judge || s.submit === "error") setTab("submit");
  }, [s.judge, s.submit]);
  const st = story(lab);
  const conflict = s.conflict && <ConflictPanel lab={lab} className="bd-conflict" heading="h2" />;
  const panel = (
    <>
      <Tabs lab={lab} tab={tab} setTab={setTab} />
      <div
        className="bd-panel"
        role="tabpanel"
        id={`b-tab-${tab}`}
        aria-labelledby={`b-tabbtn-${tab}`}
        tabIndex={0}
      >
        {tab === "task" && <TaskTab lab={lab} />}
        {tab === "program" && <ProgramTab lab={lab} />}
        {tab === "trace" && <TraceTab lab={lab} />}
        {tab === "submit" && <SubmitTab lab={lab} />}
      </div>
    </>
  );

  return (
    <div className="pb" data-narrow={narrow || undefined}>
      <TopBar lab={lab} />
      {narrow ? (
        <main className="pb-stack">
          {conflict}
          <Caption lab={lab} text={st.bus} />
          <PauseCard lab={lab} />
          <Parts lab={lab} st={st} />
          <section className="pb-optsbox" aria-label="运行选项">
            <RunOptions lab={lab} />
          </section>
          <section className="bd" aria-label="任务、程序、轨迹与提交">
            {panel}
          </section>
        </main>
      ) : (
        <main className="pb-main">
          <Board lab={lab} st={st} />
          <section className="bd" aria-label="提问、任务、程序、轨迹与提交">
            {conflict}
            <PauseCard lab={lab} />
            {panel}
          </section>
        </main>
      )}
      <ClockBar lab={lab} narrow={narrow} />
    </div>
  );
}

/* ---------- top bar with the level map ---------- */

function TopBar({ lab }: { lab: Lab }) {
  const { level, s } = lab;
  const [open, setOpen] = useState(false);
  const core = CORE.filter((l) => s.passed.includes(l.id)).length;
  const ch = CHALLENGES.filter((l) => s.passed.includes(l.id)).length;
  return (
    <header className="pb-top">
      <p className="pb-brand">
        <span className="pb-brand__chip" aria-hidden="true" />
        CPU 实验台
      </p>
      <div className="pb-level" onKeyDown={(e) => e.key === "Escape" && setOpen(false)}>
        <button
          type="button"
          className="pb-level__btn"
          aria-expanded={open}
          aria-controls="pb-levels"
          onClick={() => setOpen(!open)}
        >
          <span className="pb-level__kind">
            {level.kind === "core" ? "核心" : "挑战"} · {level.id}
          </span>
          <span className="pb-level__title">{level.title}</span>
          <span className="pb-level__caret" aria-hidden="true">
            {open ? "▴" : "▾"}
          </span>
        </button>
        {open && (
          <div className="pb-levels" id="pb-levels">
            {[CORE, CHALLENGES].map((group, gi) => (
              <section key={gi}>
                <h2>{gi === 0 ? "核心观察 · 按顺序" : "可选挑战 · 通过前置后解锁"}</h2>
                <ul>
                  {group.map((l) => {
                    const ls = levelState(lab, l.id);
                    return (
                      <li key={l.id} data-state={ls}>
                        <button
                          type="button"
                          aria-disabled={ls === "locked" || undefined}
                          aria-current={ls === "current" ? "step" : undefined}
                          onClick={() => {
                            if (ls === "locked") return;
                            lab.act.level(l.id);
                            setOpen(false);
                          }}
                        >
                          <b>{l.id}</b>
                          <span className="pb-levels__t">{l.title}</span>
                          <span className="pb-levels__st">
                            {ls === "locked" ? (
                              <>
                                <LockIcon size={11} /> {requiresText(l.id)}
                              </>
                            ) : (
                              <>
                                <span aria-hidden="true">
                                  {ls === "passed" ? "✓" : ls === "current" ? "●" : "○"}
                                </span>{" "}
                                {STATE_ZH[ls]}
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <p className="pb-progress">
        核心 {core}/{CORE.length} · 挑战 {ch}/{CHALLENGES.length}
      </p>
      <SaveStatus lab={lab} className="pb-save" />
    </header>
  );
}

/* ---------- the board ---------- */

function Board({ lab, st }: { lab: Lab; st: Story }) {
  const { root, reg, boxes } = useBoxes();
  return (
    <section className="pb-board" aria-label="数据通路">
      <Caption lab={lab} text={st.bus} />
      <div className="pb-board__body" ref={root}>
        <Memory lab={lab} st={st} reg={reg} />
        <div className="pb-cpu">
          <p className="pb-cpu__label" aria-hidden="true">
            CPU
          </p>
          <div className="pb-cpu__grid">
            <CpuParts lab={lab} st={st} reg={reg} />
          </div>
        </div>
        <Wires wires={st.wires} boxes={boxes} />
      </div>
      <p className="pb-legend" aria-hidden="true">
        <span data-k="done">
          <i /> 这一拍走过的数据（线上写着值）
        </span>
        <span data-k="next">
          <i /> 下一拍要走的路（值走到才揭晓）
        </span>
        <span data-k="change">
          <i /> 这一拍改变的值，划线的是原值
        </span>
      </p>
    </section>
  );
}

/** The beat narration: one sentence for what just moved, large enough to read off a projector. */
function Caption({ lab, text }: { lab: Lab; text: string }) {
  const ev = lab.viewing.ev;
  return (
    <div className="pb-cap" data-review={lab.reviewing || undefined}>
      <p className="pb-cap__where">
        <span className="pb-cap__tag">
          {ev ? `第 ${ev.cycle + 1} 周期 · ${PHASE_ZH[ev.phase]}` : "起点"}
        </span>
        {lab.reviewing && <span className="pb-cap__flag">回看中 · 不推进</span>}
        {lab.s.datasetId === "counter" && (
          <span className="pb-cap__flag" data-tone="bad">
            反例 · {lab.dataset.label}
          </span>
        )}
      </p>
      <p className="pb-cap__text" aria-live="polite">
        {text}
      </p>
      {lab.reviewing && (
        <button
          type="button"
          className="pb-btn pb-btn--small"
          onClick={() => lab.act.review(lab.s.history.length - 1)}
        >
          回到最新 →
        </button>
      )}
    </div>
  );
}

type RegFn = (k: Key) => (el: HTMLElement | null) => void;

function touchOf(st: Story, k: Key) {
  const d = st.done.get(k);
  if (d) return { touch: "done" as const, tag: d };
  const n = st.next.get(k);
  if (n) return { touch: "next" as const, tag: n };
  return { touch: undefined, tag: "" };
}

function Tag({ touch, tag }: { touch?: "done" | "next"; tag: string }) {
  if (!tag) return null;
  return (
    <span className="pb-tag" data-touch={touch}>
      {tag}
    </span>
  );
}

function Memory({ lab, st, reg }: { lab: Lab; st: Story; reg?: RegFn }) {
  const { viewing, lines, level, s } = lab;
  const m = viewing.m;
  const marks = marksOf(viewing);
  return (
    <section className="pb-mem" aria-labelledby="pb-mem-h">
      <h3 id="pb-mem-h" className="pb-mem__head">
        存储器 <span>16 格 × 8 bit · 程序和数据住在一起</span>
      </h3>
      {s.load === "error" && (
        <p className="pb-mem__warn">草稿未载入：这里是关卡初始内容，载入成功前不能运行。</p>
      )}
      <ol className="pb-mem__list">
        {m.mem.map((v, a) => {
          const role = cellRole(level, a);
          const prog = a < lines.length;
          const { touch, tag } = touchOf(st, `m${a}`);
          const changed = marks.from.has(a);
          const pc = m.pc === a && m.status === "ready";
          return (
            <li
              key={a}
              ref={reg?.(`m${a}`)}
              className="pb-cell"
              data-role={role?.role ?? (prog ? "program" : undefined)}
              data-touch={touch}
              data-change={changed || undefined}
              data-pc={pc || undefined}
            >
              <span className="pb-cell__addr">
                {pc && (
                  <span className="pb-cell__pc" aria-hidden="true">
                    ▸
                  </span>
                )}
                M{a}
                {pc && <span className="sr-only">（PC 指向这里）</span>}
              </span>
              <span className="pb-cell__bits">{groupedBits(v).join(" ")}</span>
              <b className="pb-cell__val">
                {changed && (
                  <s>
                    <span className="sr-only">原来是</span>
                    {marks.from.get(a)}
                  </s>
                )}
                {v}
              </b>
              <span className="pb-cell__as" data-kind={prog ? "code" : role ? "role" : undefined}>
                {prog ? compact(decode(v)) : (role?.label ?? "")}
              </span>
              <Tag touch={touch} tag={tag} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Part({
  k,
  st,
  reg,
  name,
  sub,
  area,
  idle,
  children,
}: {
  k: Key;
  st: Story;
  reg?: RegFn;
  name: string;
  sub?: string;
  area: string;
  idle?: boolean;
  children: ReactNode;
}) {
  const { touch, tag } = touchOf(st, k);
  return (
    <section
      ref={reg?.(k)}
      className="pb-part"
      data-area={area}
      data-touch={touch}
      data-idle={idle || undefined}
      aria-label={name}
    >
      <h3 className="pb-part__head">
        <span className="pb-part__name">{name}</span>
        {sub && <span className="pb-part__sub">{sub}</span>}
        <Tag touch={touch} tag={tag} />
      </h3>
      {children}
    </section>
  );
}

function CpuParts({ lab, st, reg, order }: { lab: Lab; st: Story; reg?: RegFn; order?: Key[] }) {
  const { viewing, level } = lab;
  const m = viewing.m;
  const marks = marksOf(viewing);
  const decoded = m.ir !== null && m.phase !== "decode";
  const instr = m.ir === null ? null : decode(m.ir);
  const rec = viewing.ev?.record;
  const alu = rec?.alu ?? null;
  const usesAlu = level.ops.includes("ADD") || level.ops.includes("SUB");
  const old = (l: "A" | "B" | "PC") =>
    marks.from.has(l) ? (
      <s className="pb-old">
        <span className="sr-only">原来是</span>
        {marks.from.get(l)}
      </s>
    ) : null;

  let npc: ReactNode;
  if (rec) {
    const i = rec.instr;
    npc =
      i.op === "HALT" ? (
        <p className="pb-npc">停机：PC 留在 {rec.pc}</p>
      ) : (
        <p className="pb-npc">
          <b>→ M[{rec.nextPc}]</b>
          <span>
            {i.op === "JMP"
              ? "无条件跳转"
              : i.op === "JZ"
                ? rec.jumped
                  ? `${i.reg} = 0，跳转`
                  : `${i.reg} ≠ 0，不跳，顺序 +1`
                : "顺序 +1"}
          </span>
        </p>
      );
  } else if (decoded && instr && m.phase === "execute") {
    npc = (
      <p className="pb-npc pb-npc--rule">
        <span>执行时的规则</span>
        <b>
          {instr.op === "JZ"
            ? `${instr.reg} = 0 → M[${instr.operand}]；否则 → 下一格`
            : instr.op === "JMP"
              ? `→ M[${instr.operand}]`
              : instr.op === "HALT"
                ? "停机，PC 不动"
                : "PC + 1"}
        </b>
      </p>
    );
  } else {
    npc = <p className="pb-empty">取指和译码不改 PC；执行结束时才决定下一条</p>;
  }

  const parts: Record<Key, ReactNode> = {
    PC: (
      <Part key="PC" k="PC" st={st} reg={reg} name="PC" sub="下一条去哪取" area="pc">
        <p className="pb-big">
          {old("PC")}
          <span>{m.pc}</span>
          <small>→ M[{m.pc}]</small>
        </p>
      </Part>
    ),
    IR: (
      <Part key="IR" k="IR" st={st} reg={reg} name="IR" sub="手里这条指令" area="ir">
        {m.ir === null ? (
          <p className="pb-empty">空 · 还没取过指令</p>
        ) : decoded ? (
          <div className="pb-fields">
            {groupedBits(m.ir).map((g, i) => (
              <span key={i} data-field={["op", "reg", "n"][i]}>
                <b>{g}</b>
                <small>{["操作码", "寄存器", "操作数"][i]}</small>
              </span>
            ))}
          </div>
        ) : (
          <p className="pb-bits">
            <b>{bits(m.ir)}</b>
            <small>= {m.ir} · 还没拆分</small>
          </p>
        )}
      </Part>
    ),
    DEC: (
      <Part
        key="DEC"
        k="DEC"
        st={st}
        reg={reg}
        name="译码器"
        sub="决定执行时打开哪些控制线"
        area="dec"
      >
        {decoded && instr ? (
          <>
            <p className="pb-dec">
              <b>{formatInstr(instr)}</b>
              <span>{explainInstr(instr)}</span>
            </p>
            <ul className="pb-ctl" aria-label="控制线">
              {controls(instr).map((c) => (
                <li key={c.id} data-on={c.on || undefined}>
                  <span aria-hidden="true">{c.on ? "●" : "○"}</span> {c.label}
                  <span className="sr-only">{c.on ? "，打开" : "，关闭"}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="pb-empty">{m.ir === null ? "等第一次取指" : "IR 已装入，下一拍拆开它"}</p>
        )}
      </Part>
    ),
    ALU: (
      <Part
        key="ALU"
        k="ALU"
        st={st}
        reg={reg}
        name="ALU"
        sub="4 bit 加减"
        area="alu"
        idle={!usesAlu}
      >
        {!usesAlu ? (
          <p className="pb-empty">本关用不到</p>
        ) : alu ? (
          <div className="pb-alu">
            <p>
              完整结果 <b>{alu.raw}</b> → 留下 <b>{(alu.raw + 16) & 15}</b>
            </p>
            <p className="pb-flag" data-on={alu.on || undefined}>
              <span aria-hidden="true">{alu.on ? "◉" : "○"}</span>{" "}
              {alu.kind === "carry" ? "进位" : "借位"}
              {alu.on ? "亮" : "灭"}
            </p>
          </div>
        ) : m.alu ? (
          <p className="pb-empty">
            上次在第 {m.alu.cycle + 1} 周期：{m.alu.raw}，{m.alu.kind === "carry" ? "进位" : "借位"}
            {m.alu.on ? "亮" : "灭"}
          </p>
        ) : (
          <p className="pb-empty">空闲</p>
        )}
      </Part>
    ),
    NPC: (
      <Part key="NPC" k="NPC" st={st} reg={reg} name="下一条" sub="周期末写回 PC" area="npc">
        {npc}
      </Part>
    ),
    A: (
      <Part key="A" k="A" st={st} reg={reg} name="A" sub="寄存器 · 4 bit" area="a">
        <p className="pb-big">
          {old("A")}
          <span>{m.A}</span>
          <small>{bits(m.A, 4)}</small>
        </p>
      </Part>
    ),
    B: (
      <Part key="B" k="B" st={st} reg={reg} name="B" sub="寄存器 · 4 bit" area="b">
        <p className="pb-big">
          {old("B")}
          <span>{m.B}</span>
          <small>{bits(m.B, 4)}</small>
        </p>
      </Part>
    ),
  };
  const keys = order ?? ["PC", "NPC", "IR", "DEC", "A", "ALU", "B"];
  return <>{keys.map((k) => parts[k])}</>;
}

/** Short instruction text for a memory row, e.g. "LOAD A,M14". */
const compact = (i: Instr) =>
  formatInstr(i).replace(", M[", ",M").replace("]", "").replace(", ", ",");

/** What the decoder switches on for an instruction. Derived from the instruction alone. */
function controls(i: Instr) {
  const r = i.reg;
  const on = {
    readMem: i.op === "LOAD" || i.op === "ADD" || i.op === "SUB",
    writeMem: i.op === "STORE",
    writeReg: i.op === "LOAD" || i.op === "ADD" || i.op === "SUB" || i.op === "LDI",
    alu: i.op === "ADD" || i.op === "SUB",
    pc: i.op === "JZ" || i.op === "JMP",
    halt: i.op === "HALT",
  };
  return [
    { id: "rm", label: on.readMem ? `读存储器 M[${i.operand}]` : "读存储器", on: on.readMem },
    { id: "wm", label: on.writeMem ? `写存储器 M[${i.operand}]` : "写存储器", on: on.writeMem },
    {
      id: "alu",
      label: on.alu ? `ALU 做${i.op === "ADD" ? "加法" : "减法"}` : "ALU 运算",
      on: on.alu,
    },
    { id: "wr", label: on.writeReg ? `写寄存器 ${r}` : "写寄存器", on: on.writeReg },
    { id: "pc", label: i.op === "JZ" ? `改 PC（仅当 ${r} = 0）` : "改 PC", on: on.pc },
    { id: "halt", label: "停机", on: on.halt },
  ];
}

/** Narrow screens: no wires, so the parts this beat touched come first. */
function Parts({ lab, st }: { lab: Lab; st: Story }) {
  const all: Key[] = ["PC", "IR", "DEC", "NPC", "A", "ALU", "B"];
  const rank = (k: Key) => (st.done.has(k) ? 0 : st.next.has(k) ? 1 : 2);
  const order = [...all].sort((a, b) => rank(a) - rank(b));
  return (
    <>
      <section className="pb-parts" aria-label="CPU 部件（这一拍用到的排在前面）">
        <CpuParts lab={lab} st={st} order={order} />
      </section>
      <Memory lab={lab} st={st} />
    </>
  );
}

/* ---------- pause card: the clock stops at a gate ---------- */

function PauseCard({ lab }: { lab: Lab }) {
  const q = gateHere(lab);
  const [hidden, setHidden] = useState<string | null>(null);
  if (!q || lab.reviewing) return null;
  const blocked = lab.blocking?.id === q.id;
  if (!blocked && hidden === q.id) return null;
  return (
    <aside className="pb-pause" data-blocked={blocked || undefined} aria-label="时钟暂停：预测题">
      <p className="pb-pause__where">
        <span className="pb-pause__icon" aria-hidden="true">
          {blocked ? "❚❚" : "✓"}
        </span>
        <span>{blocked ? "时钟暂停 · 先预测，答对后才能继续" : "已答对 · 时钟可以继续走"}</span>
        {!blocked && (
          <button
            type="button"
            className="pb-btn pb-btn--small pb-btn--ghost"
            onClick={() => setHidden(q.id)}
          >
            收起
          </button>
        )}
      </p>
      <QuestionBlock lab={lab} q={q} as="h2" />
    </aside>
  );
}

/* ---------- clock bar ---------- */

function ClockBar({ lab, narrow }: { lab: Lab; narrow: boolean }) {
  const { s, act, live, canStep, level } = lab;
  const shown = live.status === "ready" ? live.cycle + 1 : live.cycle;
  const at = PHASES.indexOf(live.phase);
  return (
    <footer className="pb-clock" aria-label="时钟与运行控制">
      <div className="pb-clock__face">
        <p className="pb-clock__cycle">
          <small>周期</small>
          <b>{shown}</b>
          <small>/ {level.limit}</small>
        </p>
        <ol
          className="pb-clock__phases"
          aria-label={
            live.status === "ready" ? `下一拍：${PHASE_ZH[live.phase]}` : STATUS_ZH[live.status]
          }
        >
          {PHASES.map((p, i) => {
            const state =
              live.status !== "ready" || i < at ? "done" : i === at ? "next" : undefined;
            return (
              <li key={p} data-state={state} data-gate={(i === at && !!lab.blocking) || undefined}>
                <span aria-hidden="true">
                  {state === "done" ? "■" : state === "next" ? (lab.blocking ? "❚❚" : "▶") : "□"}
                </span>
                {PHASE_ZH[p]}
              </li>
            );
          })}
        </ol>
        {live.status !== "ready" && (
          <p className="pb-clock__end" data-status={live.status}>
            <span aria-hidden="true">{live.status === "halted" ? "■" : "✕"}</span>{" "}
            {STATUS_ZH[live.status]}
          </p>
        )}
      </div>
      <div className="pb-clock__keys" role="toolbar" aria-label="运行">
        <button
          type="button"
          className="pb-btn pb-btn--go"
          disabled={!canStep.ok}
          onClick={act.step}
        >
          {s.grain === "cycle" ? "走一周期" : "走一拍"}
          {!narrow && <kbd>N</kbd>}
        </button>
        {s.running ? (
          <button type="button" className="pb-btn" onClick={act.pause}>
            暂停{!narrow && <kbd>P</kbd>}
          </button>
        ) : (
          <button type="button" className="pb-btn" disabled={!canStep.ok} onClick={act.run}>
            连续{!narrow && <kbd>P</kbd>}
          </button>
        )}
        <button type="button" className="pb-btn" onClick={act.reset}>
          复位{!narrow && <kbd>R</kbd>}
        </button>
      </div>
      {!canStep.ok && <p className="pb-clock__why">{canStep.reason}</p>}
      {!narrow && <RunOptions lab={lab} />}
    </footer>
  );
}

function RunOptions({ lab }: { lab: Lab }) {
  const { s, act, canGrain, canPickData, level, viewing, reviewing } = lab;
  return (
    <div className="pb-opts">
      <label className="pb-field">
        <span>数据</span>
        <select
          value={s.datasetId}
          disabled={!canPickData.ok}
          onChange={(e) => act.dataset(e.target.value)}
        >
          {level.publicData.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
              {lab.obs.halted.includes(d.id) ? " ✓ 已走到停机" : ""}
            </option>
          ))}
          {s.counter && <option value="counter">反例 · {s.counter.label}</option>}
        </select>
        {!canPickData.ok && <small className="pb-field__why">{canPickData.reason}</small>}
      </label>
      <div className="pb-seg" role="group" aria-label="速度">
        <span className="pb-seg__label" aria-hidden="true">
          速度
        </span>
        {SPEEDS.map((sp) => (
          <button
            key={sp.id}
            type="button"
            aria-pressed={s.speed === sp.id}
            onClick={() => act.speed(sp.id)}
          >
            {sp.zh}
          </button>
        ))}
      </div>
      <div
        className="pb-seg"
        role="group"
        aria-label="每次推进"
        title={canGrain.ok ? undefined : canGrain.reason}
      >
        <span className="pb-seg__label" aria-hidden="true">
          每次
        </span>
        <button
          type="button"
          aria-pressed={s.grain === "phase"}
          disabled={!canGrain.ok}
          onClick={() => act.grain("phase")}
        >
          一拍
        </button>
        <button
          type="button"
          aria-pressed={s.grain === "cycle"}
          disabled={!canGrain.ok}
          onClick={() => act.grain("cycle")}
        >
          一周期
        </button>
        {!canGrain.ok && (
          <small className="pb-field__why pb-dim">
            {level.kind === "core" ? "核心关固定逐拍" : canGrain.reason}
          </small>
        )}
      </div>
      <label className="pb-field pb-scrub">
        <span>
          {reviewing
            ? `回看 ${viewing.ev ? `#${viewing.ev.cycle + 1} ${PHASE_ZH[viewing.ev.phase]}` : "起点"}`
            : "回看"}
        </span>
        <input
          type="range"
          min={0}
          max={Math.max(1, s.history.length - 1)}
          value={s.cursor}
          disabled={s.history.length < 2}
          aria-valuetext={
            viewing.ev ? `第 ${viewing.ev.cycle + 1} 周期 ${PHASE_ZH[viewing.ev.phase]}` : "起点"
          }
          onChange={(e) => act.review(Number(e.target.value))}
        />
        <small className="pb-dim">←/→</small>
      </label>
    </div>
  );
}

/* ---------- drawer ---------- */

function Tabs({ lab, tab, setTab }: { lab: Lab; tab: Tab; setTab: (t: Tab) => void }) {
  const { level, s } = lab;
  const open = level.questions.filter((q) => !s.answers[q.id]?.correct).length;
  const badge: Record<Tab, string> = {
    task: open ? `${open} 题` : "",
    program: s.load === "error" ? "未载入" : lab.ready ? "" : "有空行",
    trace: lab.s.history.filter((h) => h.ev?.record).length
      ? `${lab.s.history.filter((h) => h.ev?.record).length}`
      : "",
    submit: s.judge ? (s.judge.ok ? "✓ 通过" : "✕ 未过") : s.submit === "error" ? "! 未送达" : "",
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    const i = TABS.findIndex((t) => t.id === tab);
    const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length].id;
    setTab(n);
    document.getElementById(`b-tabbtn-${n}`)?.focus();
  };
  return (
    <div className="bd-tabs" role="tablist" aria-label="面板" onKeyDown={onKey}>
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`b-tabbtn-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={`b-tab-${t.id}`}
          tabIndex={tab === t.id ? 0 : -1}
          onClick={() => setTab(t.id)}
        >
          {t.zh}
          {badge[t.id] && (
            <span
              className="bd-badge"
              data-tone={t.id === "submit" && s.judge ? (s.judge.ok ? "ok" : "bad") : undefined}
            >
              {badge[t.id]}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function TaskTab({ lab }: { lab: Lab }) {
  const { level, s } = lab;
  const gates = level.questions.filter((q) => q.trigger.kind === "gate");
  return (
    <div className="bd-stack">
      <header>
        <p className="bd-kicker">
          {level.kind === "core" ? "核心观察" : "可选挑战"} · 第 {level.id} 关
        </p>
        <h1 className="bd-title">{level.title}</h1>
        <p className="bd-goal">{level.goal}</p>
      </header>
      <CalculatorNote lab={lab} />
      <dl className="bd-rule">
        <div>
          <dt>怎样算通过</dt>
          <dd>{level.judgeRule}</dd>
        </div>
        <div>
          <dt>本关指令</dt>
          <dd className="bd-mono">{level.ops.join(" · ")}</dd>
        </div>
      </dl>
      {lab.byteQuestion && (
        <section className="bd-byte" aria-labelledby="bd-byte-h">
          <h2 id="bd-byte-h" className="bd-h">
            拨码台 · 亲手拨出一个 byte
          </h2>
          <ByteBench lab={lab} />
          <QuestionBlock lab={lab} q={lab.byteQuestion} />
        </section>
      )}
      {gates.length > 0 && (
        <section aria-labelledby="bd-q-h">
          <h2 id="bd-q-h" className="bd-h">
            时钟会在这些地方停下提问
          </h2>
          <ul className="bd-gates">
            {gates.map((q) => {
              const ok = s.answers[q.id]?.correct;
              return (
                <li key={q.id} data-done={ok || undefined}>
                  <span aria-hidden="true">{ok ? "✓" : "❚❚"}</span>
                  <span>
                    {gateWhere(q)} · {ok ? "已答对" : "走到这里时暂停"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <section aria-labelledby="bd-hint-h">
        <h2 id="bd-hint-h" className="bd-h">
          提示
        </h2>
        <Hints lab={lab} />
      </section>
    </div>
  );
}

function ProgramTab({ lab }: { lab: Lab }) {
  const { lines, canEdit, level, s, live } = lab;
  const free = level.edit === "free";
  if (s.load === "error") {
    return (
      <div className="bd-alert" role="alert">
        <h2 className="bd-h">草稿没能载入</h2>
        <p>你的程序仍在服务器上，没有丢失。重新载入成功前，编辑、运行和提交都先暂停。</p>
        <button type="button" className="pb-btn pb-btn--go" onClick={lab.act.loadRetry}>
          重新载入草稿
        </button>
      </div>
    );
  }
  return (
    <div className="bd-stack">
      <div>
        <h2 className="bd-h">
          程序 <span className="bd-dim">· {lines.length}/16 行 · 第 n 行存放在 M[n]</span>
        </h2>
        <p className="bd-mode">
          {level.edit === "none" ? (
            <>
              <LockIcon /> 固定程序，本关只观察
            </>
          ) : level.edit === "fill" ? (
            "补全虚线框里的行"
          ) : level.edit === "operand" ? (
            "只改虚线框里的操作数，其余行锁定"
          ) : (
            "自由编程 · 每行可上移、下移、在下方插入、删除"
          )}
        </p>
        {level.edit !== "none" && <Why gate={canEdit} />}
      </div>
      <ol className="bd-lines" aria-label="程序行">
        {lines.map((l, i) => {
          const byte = l.instr ? encode(l.instr) : null;
          return (
            <li
              key={i}
              className="bd-line"
              data-lock={l.lock}
              data-pc={(live.pc === i && live.status === "ready") || undefined}
              data-blank={!l.instr || undefined}
            >
              <span className="bd-line__n">M{i}</span>
              <span className="bd-line__body">
                {l.lock === "fixed" ? (
                  <code>{l.instr ? formatInstr(l.instr) : ""}</code>
                ) : (
                  <InstrControls lab={lab} index={i} line={l} disabled={!canEdit.ok} />
                )}
                <small>
                  {byte === null
                    ? "尚未填写 · 填完才能运行"
                    : `${groupedBits(byte).join(" ")} = ${byte}`}
                </small>
              </span>
              {l.lock === "fixed" ? (
                <span className="bd-line__lock" title="锁定">
                  <LockIcon />
                  <span className="sr-only">锁定</span>
                </span>
              ) : free ? (
                <LineActions lab={lab} index={i} disabled={!canEdit.ok} />
              ) : (
                <span className="bd-chip">{LOCK_ZH[l.lock]}</span>
              )}
            </li>
          );
        })}
      </ol>
      {live.pc >= lines.length && live.status === "ready" && (
        <p className="bd-dim">PC = {live.pc}，已经越过程序末尾：存储器里的数据会被当作指令执行。</p>
      )}
    </div>
  );
}

function TraceTab({ lab }: { lab: Lab }) {
  const { s, act } = lab;
  const rows = s.history.flatMap((h, k) => (h.ev?.record ? [{ k, r: h.ev.record }] : []));
  return (
    <div className="bd-stack">
      <h2 className="bd-h">
        已走过的周期 <span className="bd-dim">· 点一行，板子回到那个周期结束时</span>
      </h2>
      {rows.length === 0 ? (
        <p className="bd-dim">还没有完整的周期。走完第一组 取指 → 译码 → 执行 后，这里会记下它。</p>
      ) : (
        <ol className="bd-trace">
          {rows.map(({ k, r }) => (
            <li key={k}>
              <button
                type="button"
                onClick={() => act.review(k)}
                aria-current={s.cursor === k ? "step" : undefined}
              >
                <span className="bd-trace__c">#{r.cycle + 1}</span>
                <span className="bd-trace__pc">M[{r.pc}]</span>
                <code>{formatInstr(r.instr)}</code>
                <span className="bd-trace__d">
                  {r.changes
                    .map(
                      (c) =>
                        `${typeof c.loc === "number" ? `M[${c.loc}]` : c.loc} ${c.from ?? "—"}→${c.to}`,
                    )
                    .join("，") || "没有变化"}
                  {r.jumped !== null && (r.jumped ? " · 跳转" : " · 不跳转")}
                  {r.alu &&
                    ` · ${r.alu.raw}${r.alu.on ? (r.alu.kind === "carry" ? " 进位" : " 借位") : ""}`}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
      {lab.reviewing && (
        <button type="button" className="pb-btn" onClick={() => act.review(s.history.length - 1)}>
          回到最新状态
        </button>
      )}
    </div>
  );
}

function SubmitTab({ lab }: { lab: Lab }) {
  const { s, act, canSubmit, canTest, level } = lab;
  const j = s.judge;
  const checks = submitChecklist(lab);
  return (
    <div className="bd-stack">
      {s.submit === "error" && (
        <div className="bd-verdict" data-tone="error" role="alert">
          <h2>
            <span aria-hidden="true">! </span>提交没能送达
          </h2>
          <p>判题还没有进行，程序仍在本机。网络恢复后重新提交即可。</p>
          <button
            type="button"
            className="pb-btn pb-btn--go"
            onClick={act.submit}
            disabled={!canSubmit.ok}
          >
            重新提交
          </button>
        </div>
      )}
      {j && !j.ok && (
        <div className="bd-verdict" data-tone="bad" role="alert">
          <h2>
            <span aria-hidden="true">✕ </span>隐藏数据没通过
          </h2>
          <p className="bd-verdict__reason">{j.reason}</p>
          <p>
            反例输入 <b className="bd-mono">{j.counter.data.label}</b>
            {j.publicOk ? " · 公开数据都通过了，这是没考虑到的情况。" : " · 公开数据也有失败。"}
          </p>
          <DiffList row={j.counter} />
          <details className="bd-details">
            <summary>反例的完整轨迹 · {j.counter.trace.length} 个周期</summary>
            <TraceList row={j.counter} limit={30} />
          </details>
          <div className="bd-row">
            <button type="button" className="pb-btn pb-btn--go" onClick={act.replay}>
              {s.datasetId === "counter" ? "从头重放反例" : "把反例装上板子重放"}
            </button>
            <button type="button" className="pb-btn pb-btn--ghost" onClick={act.closeJudge}>
              收起结果
            </button>
          </div>
          {s.datasetId === "counter" && (
            <p className="bd-dim">板子上正在运行反例。逐拍走，找出哪一拍开始和预期不一样。</p>
          )}
        </div>
      )}
      {j && j.ok && (
        <div className="bd-verdict" data-tone="ok" role="status">
          <h2>
            <span aria-hidden="true">✓ </span>第 {level.id} 关通过
          </h2>
          <p>{j.total} 份隐藏数据全部正确，进度已更新。</p>
          <p className="bd-concept">
            <b>带走这个概念</b>
            {level.concept}
          </p>
          <p>
            {j.newlyUnlocked.length
              ? `新解锁：${j.newlyUnlocked.map((id) => `第 ${id} 关`).join("、")}`
              : "这次没有新关卡解锁。"}
          </p>
          <div className="bd-row">
            {nextLevels(lab).map((id) => (
              <button
                key={id}
                type="button"
                className="pb-btn pb-btn--go"
                onClick={() => act.level(id)}
              >
                去第 {id} 关 · {levelById(id).title} →
              </button>
            ))}
          </div>
        </div>
      )}
      <section aria-labelledby="bd-check-h">
        <h2 id="bd-check-h" className="bd-h">
          提交前要做到
        </h2>
        {checks.length ? (
          <ul className="bd-checks">
            {checks.map((c) => (
              <li key={c.label} data-done={c.done || undefined}>
                <span aria-hidden="true">{c.done ? "☑" : "☐"}</span> {c.label}
                <span className="sr-only">{c.done ? "，已完成" : "，未完成"}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="bd-dim">没有额外的观察要求。</p>
        )}
      </section>
      <div className="bd-row">
        <button
          type="button"
          className="pb-btn"
          disabled={!canTest.ok || s.load === "error"}
          onClick={act.tests}
        >
          运行公开用例
        </button>
        <button
          type="button"
          className="pb-btn pb-btn--go"
          disabled={!canSubmit.ok}
          onClick={act.submit}
        >
          {s.submit === "submitting" ? "判题中…" : "提交判题"}
        </button>
      </div>
      <Why gate={canSubmit} />
      {s.tests && <TestTable rows={s.tests} caption="公开用例 · 一次跑完，不影响板子上的状态" />}
    </div>
  );
}
