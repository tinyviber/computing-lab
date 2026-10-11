import { formatInstr, REG_NAMES } from "../domain/isa.ts";
import type { MachineRun, RunReason, TraceRow } from "../domain/machine.ts";

export const REASON_LABEL: Record<RunReason, string> = {
  halted: "正常结束 · 执行了 HALT",
  "ran-off": "跑飞 · PC 超出 0–15，没有遇到 HALT",
  timeout: "超时 · 达到周期预算，疑似死循环",
};

/**
 * The per-cycle rows shared by the live trace table and the judge's
 * counterexample replay. `trace` is the FULL run — each row's "regs after"
 * reads the next row's `regsBefore` (or `finalRegs` on the last). Only the
 * first `visibleCount` rows render, so a truncated reveal can't mistake the
 * terminal register value for an intermediate one. `cursor`/`onScrub` make
 * the rows interactive; leave them out for a read-only rendering.
 */
export function TraceRows(props: {
  trace: readonly TraceRow[];
  /** Terminal A/B — the last row's "regs after". */
  finalRegs: { A: number; B: number };
  /** Render only the first N rows; regs-after still reads the full trace. */
  visibleCount?: number;
  cursor?: number;
  onScrub?: (cycle: number) => void;
}) {
  const { trace, finalRegs, visibleCount = trace.length, cursor, onScrub } = props;
  return (
    <>
      {trace.slice(0, visibleCount).map((row) => {
        const next = trace[row.cycle];
        const regsAfter = next ? next.regsBefore : finalRegs;
        const changed = (reg: "A" | "B") => regsAfter[reg] !== row.regsBefore[reg];
        return (
          <tr
            className={row.cycle === cursor ? "is-current" : ""}
            key={row.cycle}
            onClick={onScrub ? () => onScrub(row.cycle) : undefined}
          >
            <td>{row.cycle}</td>
            <td>{row.pc}</td>
            <td>
              <code>{formatInstr(row.decoded)}</code>
            </td>
            <td className={changed("A") ? "is-changed" : ""}>{regsAfter.A}</td>
            <td className={changed("B") ? "is-changed" : ""}>{regsAfter.B}</td>
            <td>
              {row.memWrite ? (
                <code>
                  M[{row.memWrite.addr}] {row.memWrite.prev}→{row.memWrite.value}
                </code>
              ) : (
                "—"
              )}
            </td>
            <td>{row.nextPc >= 16 ? "越界" : row.nextPc}</td>
            <td className="cpu-trace-note">
              {row.decoded.op === "JZ"
                ? row.branchTaken
                  ? `${REG_NAMES[row.decoded.reg]}==0，跳`
                  : `${REG_NAMES[row.decoded.reg]}≠0，不跳`
                : row.carried
                  ? "溢出/借位"
                  : ""}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export const TRACE_HEAD = (
  <thead>
    <tr>
      <th>周期</th>
      <th>PC</th>
      <th>指令</th>
      <th>A</th>
      <th>B</th>
      <th>写入</th>
      <th>→PC</th>
      <th>备注</th>
    </tr>
  </thead>
);

/**
 * One row per executed cycle; clicking a row scrubs the machine view to
 * "after that cycle committed". The run's end state shows as a footer row
 * so a ran-off/timeout program still explains itself.
 *
 * Issue #100: the table reveals only cycles already WALKED — rendering the
 * whole `run.trace` up front would spoil every prediction the guided stages
 * ask for. Rows appear as the cursor commits them; the terminal end row
 * (and the run's reason/total in the header) only appear once the machine
 * has actually reached the end. The judge's counterexample replay uses the
 * full `TraceRows`, so post-mortems still see every cycle.
 */
export function TraceTable(props: {
  run: MachineRun | null;
  /** Cycle the machine view is showing — the highlighted row. */
  cursor: number;
  /** Furthest cycle the student has committed — rows only ever accumulate. */
  visited: number;
  onScrub: (cycle: number) => void;
}) {
  const { run, cursor, visited, onScrub } = props;
  if (!run) return null;
  // Rows the student has actually stepped to — never the future. The full
  // trace goes in so each row's "regs after" reads its real next state, not
  // the terminal value.
  const finished = visited >= run.trace.length;
  return (
    <section aria-label="执行轨迹" className="cpu-trace">
      <div className="cpu-panel-heading">
        <h3>执行轨迹</h3>
        <p className="cpu-panel-note">
          {finished ? (
            <>
              共 {run.trace.length} 个周期，{REASON_LABEL[run.reason]}
              {run.selfModFetch ? " · 取到了自己写过的格子" : ""}。
            </>
          ) : (
            "每行一个周期；走一格看一格，点一行回到那一步。"
          )}
        </p>
      </div>
      <div className="cpu-trace-scroll">
        <table>
          {TRACE_HEAD}
          <tbody>
            <TraceRows
              cursor={cursor}
              finalRegs={run.final.regs}
              onScrub={onScrub}
              trace={run.trace}
              visibleCount={Math.min(visited, run.trace.length)}
            />
            {finished ? (
              <tr
                className={`cpu-trace-end${cursor === run.trace.length ? " is-current" : ""}`}
                onClick={() => onScrub(run.trace.length)}
              >
                <td colSpan={8}>
                  结束：{REASON_LABEL[run.reason]}
                  {run.reason === "halted" ? `（第 ${run.trace.length} 个周期）` : ""}；A=
                  {run.final.regs.A}，B={run.final.regs.B}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
