import type { OpName } from "../domain/isa.ts";

/**
 * The instruction shelf (issue #70 §5.1): a persistent strip of plain-
 * language cards for the ops the stage allows. It never hides behind a
 * hover — the learner should be able to glance sideways mid-step.
 */
const CARD: Record<OpName, { syntax: string; plain: string }> = {
  LOAD: { syntax: "LOAD A,M[格子号]", plain: "把格子里存的数抄进寄存器" },
  STORE: { syntax: "STORE A,M[格子号]", plain: "把寄存器里的数写回格子" },
  ADD: { syntax: "ADD A,M[格子号]", plain: "寄存器 + 格子，和写回寄存器" },
  SUB: { syntax: "SUB A,M[格子号]", plain: "寄存器 − 格子，差写回寄存器" },
  JZ: { syntax: "JZ A,→第n行", plain: "寄存器是 0 就跳到第 n 行，否则继续下一行" },
  JMP: { syntax: "JMP →第n行", plain: "无条件跳到第 n 行" },
  LDI: { syntax: "LDI A,=n", plain: "把常数 n 直接装进寄存器" },
  HALT: { syntax: "HALT", plain: "停机——程序正常结束的唯一方式" },
};

export function InstructionShelf(props: { ops: readonly OpName[] }) {
  return (
    <section aria-label="指令卡片" className="cpu-shelf">
      <div className="cpu-panel-heading">
        <h3>指令卡片</h3>
        <p className="cpu-panel-note">这一关能用的指令都在这儿。</p>
      </div>
      <ol className="cpu-shelf-grid">
        {props.ops.map((op) => (
          <li className="cpu-shelf-card" key={op}>
            <code className="cpu-shelf-op">{CARD[op].syntax}</code>
            <span className="cpu-shelf-plain">{CARD[op].plain}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
