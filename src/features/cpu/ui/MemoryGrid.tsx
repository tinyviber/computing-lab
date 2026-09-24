import { useState } from "react";
import { decodeInstr, formatInstr, MEM_CELLS } from "../domain/isa.ts";

const toHex = (byte: number) => byte.toString(16).toUpperCase().padStart(2, "0");

/**
 * The unified memory: 16 cells × 8 bits, program in the low cells and data
 * above the divider. "指令 / 数据" toggles how every cell renders — the
 * same byte is either an instruction encoding or a number, which is the
 * whole point of a stored-program machine.
 *
 * Highlights: the cell PC is about to fetch (`is-pc`), the cell written by
 * the last executed STORE (`is-write`), and stage-declared scratch cells.
 */
export function MemoryGrid(props: {
  mem: number[];
  /** Program size — cells [0, programRows) render as code. */
  programRows: number;
  /** Cell PC will fetch next (−1 when the run ended). */
  fetchCell: number;
  /** Cell written in the last executed cycle, if any. */
  writtenCell: number | null;
  scratchCells: readonly number[];
}) {
  const { mem, programRows, fetchCell, writtenCell, scratchCells } = props;
  const [view, setView] = useState<"instr" | "data">("instr");
  const scratch = new Set(scratchCells);

  return (
    <section aria-label="存储器" className="cpu-memory">
      <div className="cpu-panel-heading">
        <h3>存储器 · 16 格 × 8 位</h3>
        <div className="cpu-view-toggle" role="group" aria-label="显示方式">
          <button
            aria-pressed={view === "instr"}
            className={view === "instr" ? "is-active" : ""}
            onClick={() => setView("instr")}
            type="button"
          >
            指令
          </button>
          <button
            aria-pressed={view === "data"}
            className={view === "data" ? "is-active" : ""}
            onClick={() => setView("data")}
            type="button"
          >
            数据
          </button>
        </div>
      </div>
      <ol className="cpu-mem-grid">
        {mem.slice(0, MEM_CELLS).map((byte, addr) => {
          const isProgram = addr < programRows;
          const classes = [
            "cpu-mem-cell",
            isProgram ? "is-code" : "is-data",
            addr === fetchCell ? "is-pc" : "",
            addr === writtenCell ? "is-write" : "",
            scratch.has(addr) ? "is-scratch" : "",
          ]
            .filter(Boolean)
            .join(" ");
          const decoded = decodeInstr(byte);
          return (
            <li className={classes} key={addr}>
              <span className="cpu-mem-addr">
                {addr === fetchCell ? <em title="PC 下一次取指的位置">→</em> : null}
                {addr}
              </span>
              <span className="cpu-mem-value">
                {view === "instr" ? <code>{toHex(byte)}</code> : <strong>{byte}</strong>}
              </span>
              <span className="cpu-mem-label">
                {view === "instr"
                  ? formatInstr(decoded)
                  : isProgram
                    ? "代码格"
                    : `数据 ${byte & 0xf}`}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="cpu-mem-legend">
        <span>
          <i className="cpu-legend-code" /> 代码区 0–{Math.max(0, programRows - 1)}
        </span>
        <span>
          <i className="cpu-legend-data" /> 数据区 {programRows}–15
        </span>
        {scratchCells.length > 0 ? (
          <span>
            <i className="cpu-legend-scratch" /> 草稿格 {scratchCells.join("、")}
          </span>
        ) : null}
      </p>
    </section>
  );
}
