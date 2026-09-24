import { decodeInstr, formatInstr } from "../domain/isa.ts";
import type { RegPair } from "../domain/machine.ts";

const toBin = (value: number, width: number) => value.toString(2).padStart(width, "0");

function RegCard(props: {
  name: string;
  bits: number;
  value: number;
  changed: boolean;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`cpu-reg${props.changed ? " is-changed" : ""}`}>
      <span className="cpu-reg-name">{props.name}</span>
      <span className="cpu-reg-value" title={`二进制 ${toBin(props.value, props.bits)}`}>
        {props.value}
      </span>
      <span className="cpu-reg-bin">{toBin(props.value, props.bits)}</span>
      {props.extra}
    </div>
  );
}

/**
 * The four registers. IR shows its bit-field split `[op 3b | reg 1b |
 * operand 4b]` plus the decoded mnemonic — the "decode" step made visible.
 * The carry lamp lights when the last ADD/SUB spilled past 4 bits.
 */
export function RegistersPanel(props: {
  regs: RegPair;
  prevRegs: RegPair | null;
  pc: number;
  prevPc: number | null;
  ir: number | null;
  carried: boolean;
}) {
  const { regs, prevRegs, pc, prevPc, ir, carried } = props;
  const decoded = ir !== null ? decodeInstr(ir) : null;
  return (
    <section aria-label="寄存器" className="cpu-registers">
      <div className="cpu-panel-heading">
        <h3>寄存器</h3>
        <p className="cpu-panel-note">十进制为主，悬停看二进制。变动的那一格会高亮。</p>
      </div>
      <div className="cpu-reg-grid">
        <RegCard
          bits={4}
          changed={prevRegs !== null && regs.A !== prevRegs.A}
          name="A"
          value={regs.A}
        />
        <RegCard
          bits={4}
          changed={prevRegs !== null && regs.B !== prevRegs.B}
          name="B"
          value={regs.B}
        />
        <RegCard
          bits={4}
          changed={prevPc !== null && pc !== prevPc}
          extra={<span className="cpu-reg-sub">下一条取指</span>}
          name="PC"
          value={pc}
        />
        <div className={`cpu-reg cpu-reg-ir${carried ? "" : ""}`}>
          <span className="cpu-reg-name">IR</span>
          {ir === null || decoded === null ? (
            <span className="cpu-reg-value">—</span>
          ) : (
            <>
              <span className="cpu-ir-fields" title={`编码 ${toBin(ir, 8)}`}>
                <code className="cpu-ir-op">{toBin(ir, 8).slice(0, 3)}</code>
                <code className="cpu-ir-reg">{toBin(ir, 8).slice(3, 4)}</code>
                <code className="cpu-ir-operand">{toBin(ir, 8).slice(4)}</code>
              </span>
              <span className="cpu-ir-legend">
                <span>指令</span>
                <span>寄存器</span>
                <span>操作数</span>
              </span>
              <code className="cpu-reg-sub">{formatInstr(decoded)}</code>
            </>
          )}
        </div>
        <div className={`cpu-carry${carried ? " is-lit" : ""}`} title="第 5 位：运算溢出/借位灯">
          <span className="cpu-carry-lamp" />
          <span className="cpu-carry-label">第5位灯</span>
        </div>
      </div>
    </section>
  );
}
