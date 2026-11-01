// Shared semantic widgets. They carry content, state and accessibility only;
// each direction styles them under its own root class and decides where they live.

import { useEffect, useId, useState, type ReactNode } from "react";
import {
  bits,
  decode,
  fields,
  formatInstr,
  groupedBits,
  OP_INFO,
  OPS,
  type Instr,
  type Op,
} from "./isa";
import { edits, type Lab } from "./lab";
import { isUnlocked, LEVELS, REQUIRES, type Line, type Question } from "./levels";
import { locLabel, type TestRow } from "./judge";
import { PHASE_ZH, STATUS_ZH, type Loc } from "./machine";
import type { Snap } from "./lab";
import { gateAt } from "./levels";

export const cx = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(" ");

/* ---------- level map ---------- */

export type LevelState = "passed" | "current" | "open" | "locked";

export function levelState(lab: Lab, id: number): LevelState {
  if (lab.s.levelId === id) return "current";
  if (lab.s.passed.includes(id)) return "passed";
  return isUnlocked(id, lab.s.passed) ? "open" : "locked";
}

export const STATE_ZH: Record<LevelState, string> = {
  passed: "已通过",
  current: "当前",
  open: "可进入",
  locked: "未解锁",
};
export const STATE_GLYPH: Record<LevelState, string> = {
  passed: "✓",
  current: "●",
  open: "○",
  locked: "🔒",
};
export const requiresText = (id: number) =>
  REQUIRES[id].length ? `需先通过 ${REQUIRES[id].join(" 和 ")}` : "";
export const CORE = LEVELS.filter((l) => l.kind === "core");
export const CHALLENGES = LEVELS.filter((l) => l.kind === "challenge");

/* ---------- persistence ---------- */

export interface SaveView {
  tone: "ok" | "busy" | "warn" | "error";
  glyph: string;
  text: string;
  retry?: () => void;
}

export function saveView(lab: Lab): SaveView {
  const { s, act } = lab;
  if (s.load === "error")
    return { tone: "error", glyph: "!", text: "草稿载入失败", retry: act.loadRetry };
  if (s.conflict) return { tone: "warn", glyph: "⇄", text: "草稿版本冲突" };
  switch (s.save) {
    case "saving":
      return { tone: "busy", glyph: "◌", text: "保存中…" };
    case "dirty":
      return { tone: "busy", glyph: "●", text: "有改动待保存" };
    case "error":
      return { tone: "error", glyph: "!", text: "保存失败 · 改动仍在本机", retry: act.saveRetry };
    default:
      return { tone: "ok", glyph: "✓", text: `已保存 ${s.savedAt}` };
  }
}

export function SaveStatus({ lab, className }: { lab: Lab; className?: string }) {
  const v = saveView(lab);
  return (
    <div className={cx("save", className)} data-tone={v.tone} role="status" aria-live="polite">
      <span className="save__glyph" aria-hidden="true">
        {v.glyph}
      </span>
      <span className="save__text">{v.text}</span>
      {v.retry && (
        <button type="button" className="save__retry" onClick={v.retry}>
          重试
        </button>
      )}
    </div>
  );
}

/* ---------- questions ---------- */

export function QuestionBlock({
  lab,
  q,
  as: H = "h3",
  className,
  locked,
}: {
  lab: Lab;
  q: Question;
  as?: "h2" | "h3" | "h4";
  className?: string;
  /** Reason the options are not answerable yet (e.g. the gate has not been reached). */
  locked?: string;
}) {
  const id = useId();
  const rec = lab.s.answers[q.id];
  const tried = rec?.tried ?? [];
  const done = !!rec?.correct;
  const byteLocked =
    (q.trigger.kind === "byte" && !lab.byteAnswerable) || (!!locked && !rec?.correct);
  const last =
    !done && tried.length ? q.options.find((o) => o.id === tried[tried.length - 1]) : undefined;
  const kicker =
    q.trigger.kind === "gate"
      ? `第 ${q.trigger.cycle + 1} 周期 · ${PHASE_ZH[q.trigger.phase]}之前 · 预测`
      : "字节观察 · 作答";
  return (
    <section
      className={cx("q", className)}
      data-state={done ? "done" : last ? "retry" : byteLocked ? "locked" : "open"}
      aria-labelledby={id}
    >
      <p className="q__kicker">{kicker}</p>
      <H className="q__prompt" id={id}>
        {q.prompt}
      </H>
      <div className="q__options" role="group" aria-label="选项">
        {q.options.map((o, i) => {
          const wrong = tried.includes(o.id) && !o.correct;
          const right = done && o.correct;
          return (
            <button
              key={o.id}
              type="button"
              className="q__opt"
              data-mark={right ? "right" : wrong ? "wrong" : undefined}
              disabled={done || byteLocked || wrong}
              onClick={() => lab.act.answer(q.id, o.id)}
            >
              <span className="q__key" aria-hidden="true">
                {right ? "✓" : wrong ? "✕" : String.fromCharCode(65 + i)}
              </span>
              <span className="q__text">{o.text}</span>
              {(right || wrong) && (
                <span className="sr-only">{right ? "（正确）" : "（已排除）"}</span>
              )}
            </button>
          );
        })}
      </div>
      {locked && !done && (
        <p className="q__lock">
          <span aria-hidden="true">⏳ </span>
          {locked}
        </p>
      )}
      {!locked && byteLocked && q.trigger.kind === "byte" && (
        <p className="q__lock">
          <span aria-hidden="true">🔒 </span>先把 byte 拨成 <code>{bits(q.trigger.target)}</code>{" "}
          再作答 · 现在是 <code>{bits(lab.s.byteValue)}</code>
        </p>
      )}
      <div aria-live="polite">
        {last && (
          <p className="q__why">
            <strong>✕ 「{last.text}」不对。</strong>
            {last.why} 换一个再试。
          </p>
        )}
        {done && (
          <p className="q__reveal">
            <strong>✓ 揭示</strong> {q.reveal}
          </p>
        )}
      </div>
      {lab.s.answerSync !== "ok" && tried.length > 0 && (
        <p className="q__sync" data-tone={lab.s.answerSync}>
          {lab.s.answerSync === "saving" ? (
            "正在记录答案…"
          ) : (
            <>
              答案没能记录到服务器，本机已保留，可以继续。
              <button type="button" onClick={lab.act.answerRetry}>
                重新记录
              </button>
            </>
          )}
        </p>
      )}
    </section>
  );
}

/* ---------- byte bench ---------- */

const FIELD_OF = (bit: number) => (bit >= 5 ? "op" : bit === 4 ? "reg" : "operand");

export function ByteBench({ lab, className }: { lab: Lab; className?: string }) {
  const v = lab.s.byteValue;
  const f = fields(v);
  const instr = decode(v);
  const q = lab.byteQuestion;
  const target = q?.trigger.kind === "byte" ? q.trigger.target : null;
  const off = target === null ? 0 : [...bits(v ^ target)].filter((b) => b === "1").length;
  const [gOp, gReg, gN] = groupedBits(v);
  return (
    <section className={cx("bb", className)} aria-label="字节观察台">
      <div className="bb__bits" role="group" aria-label="逐位切换，从最高位到最低位">
        {[7, 6, 5, 4, 3, 2, 1, 0].map((i) => {
          const on = ((v >> i) & 1) === 1;
          return (
            <button
              key={i}
              type="button"
              className="bb__bit"
              data-field={FIELD_OF(i)}
              aria-pressed={on}
              aria-label={`第 ${i} 位，权 ${2 ** i}，现在是 ${on ? 1 : 0}`}
              onClick={() => lab.act.byte(v ^ (1 << i))}
            >
              <span className="bb__digit">{on ? 1 : 0}</span>
              <span className="bb__weight">{2 ** i}</span>
            </button>
          );
        })}
      </div>
      <dl className="bb__fields">
        <div data-field="op">
          <dt>操作码</dt>
          <dd>
            <code>{gOp}</code> → {instr.op}
          </dd>
        </div>
        <div data-field="reg">
          <dt>寄存器</dt>
          <dd>
            <code>{gReg}</code> → {f.reg ? "B" : "A"}
          </dd>
        </div>
        <div data-field="operand">
          <dt>操作数</dt>
          <dd>
            <code>{gN}</code> → {f.operand}
          </dd>
        </div>
      </dl>
      <div className="bb__readings">
        <p>
          <span className="bb__label">按数值读</span>
          <strong className="bb__value">{v}</strong>
        </p>
        <p>
          <span className="bb__label">按指令读</span>
          <strong className="bb__instr">{formatInstr(instr)}</strong>
        </p>
      </div>
      {target !== null && (
        <p className="bb__target" data-hit={off === 0} aria-live="polite">
          目标 <code>{bits(target)}</code> ·{" "}
          {off === 0 ? "✓ 已拨到目标，可以作答" : `还差 ${off} 位`}
        </p>
      )}
      <div className="bb__sources">
        <span className="bb__label">从程序取编码作起点</span>
        {lab.lines.map((l, i) =>
          l.instr ? (
            <button key={i} type="button" onClick={() => lab.act.byte(lab.live.mem[i])}>
              M[{i}]
            </button>
          ) : null,
        )}
        <button type="button" onClick={() => lab.act.byte(0)}>
          清零
        </button>
      </div>
    </section>
  );
}

/* ---------- program editing ---------- */

const operandText = (op: Op, n: number) => {
  const k = OP_INFO[op].operand;
  return k === "mem" ? `M[${n}]` : k === "addr" ? `第 ${n} 格` : `${n}`;
};

export function InstrControls({
  lab,
  index,
  line,
  disabled,
}: {
  lab: Lab;
  index: number;
  line: Line;
  disabled?: boolean;
}) {
  const { level, lines, act } = lab;
  const ops: readonly Op[] =
    line.lock === "fill" ? (level.fillOps ?? level.ops) : line.lock === "free" ? level.ops : OPS;
  const instr = line.instr;
  const shown = line.instr ?? line.stub ?? null;
  const set = (next: Instr) => act.edit(edits.set(lines, index, next));
  const info = shown ? OP_INFO[shown.op] : null;
  const opEditable = line.lock === "fill" || line.lock === "free";
  const lbl = `第 ${index} 行`;
  return (
    <span className="ic" data-lock={line.lock}>
      {opEditable ? (
        <select
          className="ic__op"
          aria-label={`${lbl} 指令`}
          disabled={disabled}
          value={instr?.op ?? ""}
          onChange={(e) =>
            set({ op: e.target.value as Op, reg: instr?.reg ?? "A", operand: instr?.operand ?? 0 })
          }
        >
          {!instr && <option value="">选择指令…</option>}
          {ops.map((op) => (
            <option key={op} value={op}>
              {op}
            </option>
          ))}
        </select>
      ) : (
        <span className="ic__fixed">{shown?.op}</span>
      )}
      {shown &&
        info?.usesReg &&
        (opEditable ? (
          <select
            className="ic__reg"
            aria-label={`${lbl} 寄存器`}
            disabled={disabled || !instr}
            value={shown.reg}
            onChange={(e) => instr && set({ ...instr, reg: e.target.value as "A" | "B" })}
          >
            <option value="A">A</option>
            <option value="B">B</option>
          </select>
        ) : (
          <span className="ic__fixed">{shown.reg}</span>
        ))}
      {shown && info?.operand !== "none" && line.lock === "fixed" && (
        <span className="ic__fixed">{operandText(shown.op, shown.operand)}</span>
      )}
      {shown && info?.operand !== "none" && line.lock !== "fixed" && (
        <select
          className="ic__n"
          aria-label={`${lbl} 操作数`}
          data-blank={!instr || undefined}
          disabled={disabled}
          value={instr ? instr.operand : ""}
          onChange={(e) => set({ ...shown, operand: Number(e.target.value) })}
        >
          {!instr && <option value="">选择…</option>}
          {Array.from({ length: 16 }, (_, n) => (
            <option key={n} value={n}>
              {operandText(shown.op, n)}
            </option>
          ))}
        </select>
      )}
    </span>
  );
}

export function LineActions({
  lab,
  index,
  disabled,
}: {
  lab: Lab;
  index: number;
  disabled?: boolean;
}) {
  const { lines, act } = lab;
  const full = lines.length >= 16;
  return (
    <span className="la" role="group" aria-label={`第 ${index} 行操作`}>
      <button
        type="button"
        aria-label={`第 ${index} 行上移`}
        title="上移"
        disabled={disabled || index === 0}
        onClick={() => act.edit(edits.move(lines, index, -1))}
      >
        ↑
      </button>
      <button
        type="button"
        aria-label={`第 ${index} 行下移`}
        title="下移"
        disabled={disabled || index === lines.length - 1}
        onClick={() => act.edit(edits.move(lines, index, 1))}
      >
        ↓
      </button>
      <button
        type="button"
        aria-label={`在第 ${index} 行下方插入`}
        title={full ? "最多 16 行" : "在下方插入"}
        disabled={disabled || full}
        onClick={() => act.edit(edits.insert(lines, index + 1))}
      >
        ＋
      </button>
      <button
        type="button"
        aria-label={`删除第 ${index} 行`}
        title="删除"
        disabled={disabled || lines.length <= 1}
        onClick={() => act.edit(edits.remove(lines, index))}
      >
        ✕
      </button>
    </span>
  );
}

export const LOCK_ZH: Record<Line["lock"], string> = {
  fixed: "锁定",
  fill: "待补全",
  operand: "可改操作数",
  free: "可编辑",
};

/* ---------- tests, judging, sync ---------- */

export function TestTable({ rows, caption }: { rows: TestRow[]; caption?: string }) {
  return (
    <table className="tt">
      {caption && <caption>{caption}</caption>}
      <thead>
        <tr>
          <th scope="col">输入</th>
          <th scope="col">结果</th>
          <th scope="col">周期</th>
          <th scope="col">说明</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.data.id} data-ok={r.ok}>
            <th scope="row">{r.data.label}</th>
            <td>
              <span className="tt__mark" aria-hidden="true">
                {r.ok ? "✓" : "✕"}
              </span>
              {r.ok ? "通过" : "失败"}
            </td>
            <td>
              {r.cycles}
              {r.budget !== null && <span className="tt__budget"> / {r.budget}</span>}
            </td>
            <td>{r.ok ? STATUS_ZH[r.status] : r.reasons.join("；")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function DiffList({ row }: { row: TestRow }) {
  return (
    <table className="dl">
      <thead>
        <tr>
          <th scope="col">位置</th>
          <th scope="col">预期</th>
          <th scope="col">实际</th>
        </tr>
      </thead>
      <tbody>
        {row.diffs.map((d) => (
          <tr key={String(d.loc)} data-ok={d.ok}>
            <th scope="row">{locLabel(d.loc)}</th>
            <td>{d.expected}</td>
            <td>
              {d.actual} <span aria-hidden="true">{d.ok ? "✓" : "✕"}</span>
              <span className="sr-only">{d.ok ? "一致" : "不一致"}</span>
            </td>
          </tr>
        ))}
        <tr data-ok={row.status === "halted"}>
          <th scope="row">终态</th>
          <td>正常停机</td>
          <td>
            {STATUS_ZH[row.status]}{" "}
            <span aria-hidden="true">{row.status === "halted" ? "✓" : "✕"}</span>
          </td>
        </tr>
        {row.budget !== null && (
          <tr data-ok={row.cycles <= row.budget}>
            <th scope="row">周期</th>
            <td>≤ {row.budget}</td>
            <td>
              {row.cycles} <span aria-hidden="true">{row.cycles <= row.budget ? "✓" : "✕"}</span>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

export function TraceList({ row, limit = 40 }: { row: TestRow; limit?: number }) {
  const shown = row.trace.slice(0, limit);
  return (
    <ol className="tl" aria-label="反例执行轨迹">
      {shown.map((r) => (
        <li key={r.cycle}>
          <span className="tl__c">#{r.cycle + 1}</span>
          <span className="tl__pc">M[{r.pc}]</span>
          <code className="tl__i">{formatInstr(r.instr)}</code>
          <span className="tl__d">
            {r.changes
              .filter((c) => c.loc !== "PC")
              .map((c) => `${typeof c.loc === "number" ? `M[${c.loc}]` : c.loc}=${c.to}`)
              .join(" ") || (r.jumped === true ? "跳转" : r.jumped === false ? "不跳转" : "—")}
          </span>
        </li>
      ))}
      {row.trace.length > limit && (
        <li className="tl__more">…还有 {row.trace.length - limit} 个周期</li>
      )}
    </ol>
  );
}

export function ConflictPanel({
  lab,
  className,
  heading = "h3",
}: {
  lab: Lab;
  className?: string;
  heading?: "h2" | "h3";
}) {
  const c = lab.s.conflict;
  if (!c) return null;
  const H = heading;
  const col = (title: string, at: string, lines: Line[], tag: string) => (
    <figure className="cf__col" data-side={tag}>
      <figcaption>
        <strong>{title}</strong>
        <span>{at}</span>
      </figcaption>
      <ol start={0}>
        {lines.map((l, i) => (
          <li key={i}>
            <span className="cf__n">{i}</span>
            <code>{l.instr ? formatInstr(l.instr) : "（空）"}</code>
          </li>
        ))}
      </ol>
    </figure>
  );
  return (
    <section
      className={cx("cf", className)}
      aria-labelledby="cf-title"
      role="alertdialog"
      aria-describedby="cf-desc"
    >
      <H id="cf-title">两份草稿不一致</H>
      <p id="cf-desc">
        另一台设备保存过这一关。两份都还在，选一份继续；另一份会被替换。
        {c.syncFailed && " 上次同步也失败了，可以先重试。"}
      </p>
      <div className="cf__cols">
        {col("本机草稿", c.localAt, c.local, "local")}
        {col("服务器草稿", c.serverAt, c.server, "server")}
      </div>
      <div className="cf__actions">
        <button type="button" className="cf__primary" onClick={() => lab.act.conflict("local")}>
          恢复本机版本
        </button>
        <button type="button" onClick={() => lab.act.conflict("server")}>
          接受服务器版本
        </button>
        {c.syncFailed && (
          <button type="button" onClick={() => lab.act.conflict("retry")}>
            重试同步
          </button>
        )}
      </div>
    </section>
  );
}

export function CalculatorNote({ lab, className }: { lab: Lab; className?: string }) {
  if (!lab.level.needsCalculator || lab.s.calculatorDone || lab.s.calcDismissed) return null;
  return (
    <aside className={cx("calc", className)} aria-label="学习建议">
      <p>
        <strong>建议：</strong>本关用到「Calculator」课程里的 4
        位加法器和进位。你还没学完那一课——可以先去看看，也可以直接继续。
      </p>
      <div>
        <a href="#calculator" onClick={(e) => e.preventDefault()}>
          打开 Calculator 课程
        </a>
        <button type="button" onClick={lab.act.calcDismiss}>
          知道了，继续本关
        </button>
      </div>
    </aside>
  );
}

export function Hints({ lab, className }: { lab: Lab; className?: string }) {
  const n = lab.s.hintsShown[lab.level.id] ?? 0;
  const all = lab.level.hints;
  return (
    <div className={cx("hints", className)}>
      {n > 0 && (
        <ol>
          {all.slice(0, n).map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ol>
      )}
      {n < all.length && (
        <button type="button" onClick={lab.act.hint}>
          {n === 0 ? "给我一个提示" : "再来一个提示"}{" "}
          <span className="hints__count">
            ({n}/{all.length})
          </span>
        </button>
      )}
    </div>
  );
}

/** Gate text shown next to a disabled control, so the reason is never colour-only or hidden. */
export function Why({
  gate,
  className,
}: {
  gate: { ok: boolean; reason: string };
  className?: string;
}) {
  if (gate.ok) return null;
  return <span className={cx("why", className)}>{gate.reason}</span>;
}

export function Visually({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}

/* ---------- derived view helpers ---------- */

/** The gate question at the live machine position (blocking or just answered), if any. */
export function gateHere(lab: Lab): Question | null {
  if (lab.live.status !== "ready") return null;
  return gateAt(lab.level, lab.live.cycle, lab.live.phase) ?? null;
}

/** Where a gate question sits, in student language. */
export const gateWhere = (q: Question) =>
  q.trigger.kind === "gate"
    ? `第 ${q.trigger.cycle + 1} 周期 · ${PHASE_ZH[q.trigger.phase]}之前`
    : "拨到目标 byte 之后";

export interface Marks {
  fetch?: number;
  read?: number;
  write?: number;
  /** Previous value of every location this beat changed. */
  from: Map<Loc, number | null>;
}

/** What one beat touched: memory access and changed locations (from the beat's own event only). */
export function marksOf(snap: Snap | null | undefined): Marks {
  const from = new Map<Loc, number | null>();
  if (!snap?.ev) return { from };
  for (const c of snap.ev.changes) from.set(c.loc, c.from);
  const a = snap.m.access;
  return { fetch: a.fetch, read: a.read, write: a.write, from };
}

export interface CheckItem {
  label: string;
  done: boolean;
}

/** Submit preconditions as a visible checklist (mirrors canSubmit). */
export function submitChecklist(lab: Lab): CheckItem[] {
  const { level, s, obs, ready } = lab;
  const items: CheckItem[] = [];
  if (level.edit !== "none") items.push({ label: "程序没有空行", done: ready });
  if (level.questions.length) {
    const ok = level.questions.filter((q) => s.answers[q.id]?.correct).length;
    items.push({
      label: `引导题答对 ${ok}/${level.questions.length}`,
      done: ok === level.questions.length,
    });
  }
  if (level.observe === "all-public-halted") {
    for (const d of level.publicData)
      items.push({ label: `${d.label} 走到停机`, done: obs.halted.includes(d.id) });
  }
  if (level.observe === "both-branches") {
    items.push({ label: "亲眼看到 JZ 跳转", done: obs.jzTaken });
    items.push({ label: "亲眼看到 JZ 不跳转", done: obs.jzNotTaken });
  }
  return items;
}

/** Levels worth offering after a pass: newly unlocked first, then any open, unpassed level. */
export function nextLevels(lab: Lab): number[] {
  const j = lab.s.judge;
  const fresh = j?.ok ? j.newlyUnlocked : [];
  const open = lab.unlocked.filter(
    (id) => !lab.s.passed.includes(id) && id !== lab.level.id && !fresh.includes(id),
  );
  return [...fresh, ...open].slice(0, 3);
}

/** Matches a media query; used where narrow screens need a different structure, not just smaller boxes. */
export function useMedia(query: string) {
  const [match, setMatch] = useState(
    () => typeof matchMedia !== "undefined" && matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return match;
}

/** Small stroke lock icon (no emoji, so it inherits each direction's ink colour). */
export function LockIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      aria-hidden="true"
      focusable="false"
      className="lock-icon"
    >
      <rect
        x="2"
        y="5.5"
        width="8"
        height="5.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path d="M4 5.5V4a2 2 0 0 1 4 0v1.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}
