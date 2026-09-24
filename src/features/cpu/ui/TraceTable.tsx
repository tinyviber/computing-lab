import { formatInstr, REG_NAMES } from "../domain/isa.ts";
import type { MachineRun, RunReason } from "../domain/machine.ts";

const REASON_LABEL: Record<RunReason, string> = {
  halted: "停机",
  "ran-off": "跑出存储器",
  timeout: "超过周期上限",
};

/**
 * One row per executed cycle; clicking a row scrubs the machine view to
 * "after that cycle committed". The run's end state shows as a footer row
 * so a ran-off/timeout program still explains itself.
 */
export function TraceTable(props: {
  run: MachineRun | null;
  /** Cycles executed so far — the highlighted row. */
  cursor: number;
  onScrub: (cycle: number) => void;
}) {
  const { run, cursor, onScrub } = props;
  if (!run) return null;
  return (
    <section aria-label="执行轨迹" className="cpu-trace">
      <div className="cpu-panel-heading">
        <h3>执行轨迹</h3>
        <p className="cpu-panel-note">
          每行一个周期；点一行回到那一步。共 {run.trace.length} 个周期，
          {REASON_LABEL[run.reason]}
          {run.selfModFetch ? " · 取到了自己写过的格子" : ""}。
        </p>
      </div>
      <div className="cpu-trace-scroll">
        <table>
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
          <tbody>
            {run.trace.map((row) => {
              const next = run.trace[row.cycle];
              const regsAfter = next ? next.regsBefore : run.final.regs;
              const changed = (reg: "A" | "B") => regsAfter[reg] !== row.regsBefore[reg];
              return (
                <tr
                  className={row.cycle === cursor ? "is-current" : ""}
                  key={row.cycle}
                  onClick={() => onScrub(row.cycle)}
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
          </tbody>
        </table>
      </div>
    </section>
  );
}
