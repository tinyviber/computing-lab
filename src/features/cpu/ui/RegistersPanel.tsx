import { decodeInstr, formatInstr, REG_NAMES } from "../domain/isa.ts";
import type { RegPair, TraceRow } from "../domain/machine.ts";

const toBin = (value: number, width: number) => value.toString(2).padStart(width, "0");

/**
 * M3's column add made visible: for a pending ADD/SUB in the exec phase,
 * lay the 4-bit columns out (augend + addend = 5-bit raw sum) with the
 * carry/borrow column lit when it can't fit — "装不下就丢，低 4 位留下".
 * The augend is `regsBefore` (the register about to change), the addend the
 * referenced memory cell — still uncommitted, so `mem` reads are safe.
 */
function ColumnAdd(props: { row: TraceRow; mem: readonly number[] }) {
  const { row, mem } = props;
  const { op, reg, operand } = row.decoded;
  if (op !== "ADD" && op !== "SUB") return null;
  const regName = REG_NAMES[reg] as keyof RegPair;
  const a = row.regsBefore[regName];
  const b = (mem[operand] ?? 0) & 0xf;
  const raw = op === "ADD" ? a + b : a - b;
  const kept = raw & 0xf;
  const sign = op === "ADD" ? "+" : "−";
  const carries = op === "ADD" ? raw > 0xf : raw < 0;
  // 5 columns: the carry-out lamp column plus the 4 payload bits.
  const top = ` ${toBin(a, 4)}`;
  const bot = ` ${toBin(b, 4)}`;
  const sum = `${carries ? "1" : "0"}${toBin(kept, 4)}`;
  const row5 = (text: string, markCarry: boolean) =>
    text.split("").map((ch, i) => (
      <span
        className={`col${i === 0 && markCarry ? " carry-out is-lit" : i === 0 ? " carry-out" : ""}`}
        key={i}
      >
        {ch}
      </span>
    ));
  return (
    <div className="cpu-coladd" role="note">
      <p className="cpu-coladd-title">
        ALU 列加 · {regName} {sign} M[{operand}]（{a} {sign} {b}）
      </p>
      <div className="cpu-coladd-bits">
        <div>
          <span className="cpu-coladd-op"> </span>
          {row5(top, false)}
        </div>
        <div>
          <span className="cpu-coladd-op">{sign}</span>
          {row5(bot, false)}
        </div>
        <div>
          <span className="cpu-coladd-op">=</span>
          {row5(sum, true)}
        </div>
      </div>
      <p className="cpu-coladd-note">
        {carries
          ? `${a} ${sign} ${b} = ${raw}：4 位装不下——最左那 1 位点亮「第5位灯」后被丢掉，${regName} 只留下 ${kept}。`
          : `${a} ${sign} ${b} = ${raw < 0 ? raw : raw}：4 位刚好装下，第5位灯不亮，${regName} ← ${kept}。`}
      </p>
    </div>
  );
}

function RegCard(props: {
  name: string;
  bits: number;
  value: number;
  changed: boolean;
  /** Predicted value after the pending cycle commits (exec phase). */
  next?: number | null;
  extra?: React.ReactNode;
}) {
  return (
    <div className={`cpu-reg${props.changed ? " is-changed" : ""}`}>
      <span className="cpu-reg-name">{props.name}</span>
      <span className="cpu-reg-value" title={`二进制 ${toBin(props.value, props.bits)}`}>
        {props.value}
      </span>
      {props.next !== null && props.next !== undefined ? (
        <span className="cpu-reg-ghost" title="这个周期提交后的值">
          → {props.next}
        </span>
      ) : null}
      <span className="cpu-reg-bin">{toBin(props.value, props.bits)}</span>
      {props.extra}
    </div>
  );
}

/**
 * The four registers. IR shows its bit-field split `[op 3b | reg 1b |
 * operand 4b]` plus the decoded mnemonic — the "decode" step made visible.
 * The carry lamp lights when the last ADD/SUB spilled past 4 bits.
 *
 * Phase-aware (issue #70 §5.5): during fetch the pending byte is in
 * transit to IR (ghosted); decode highlights the field split; exec shows
 * each register's next value as a ghost "→ n" before the cycle commits.
 */
export function RegistersPanel(props: {
  regs: RegPair;
  prevRegs: RegPair | null;
  /** Predicted regs once the pending cycle commits (exec phase). */
  nextRegs: RegPair | null;
  pc: number;
  prevPc: number | null;
  /** Predicted next PC once the pending cycle commits (exec phase). */
  nextPc: number | null;
  /** Byte the pending cycle fetched — shown during decode and exec. */
  ir: number | null;
  /** Byte in transit to IR during fetch (ghosted). */
  irInFlight?: number | null;
  carried: boolean;
  /** Predicted carry lamp once the pending cycle commits. */
  nextCarried?: boolean | null;
  /**
   * The pending cycle + memory — M3 only. When the exec phase previews an
   * ADD/SUB, the panel draws the 4-bit column add under the carry lamp.
   */
  pendingRow?: TraceRow | null;
  mem?: readonly number[];
}) {
  const {
    regs,
    prevRegs,
    nextRegs,
    pc,
    prevPc,
    nextPc,
    ir,
    irInFlight,
    carried,
    nextCarried,
    pendingRow,
    mem,
  } = props;
  const decoded = ir !== null ? decodeInstr(ir) : null;
  const flight = ir === null && irInFlight !== null && irInFlight !== undefined;
  const lamp = nextCarried ?? carried;
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
          next={nextRegs && nextRegs.A !== regs.A ? nextRegs.A : null}
          value={regs.A}
        />
        <RegCard
          bits={4}
          changed={prevRegs !== null && regs.B !== prevRegs.B}
          name="B"
          next={nextRegs && nextRegs.B !== regs.B ? nextRegs.B : null}
          value={regs.B}
        />
        <RegCard
          bits={4}
          changed={prevPc !== null && pc !== prevPc}
          extra={<span className="cpu-reg-sub">下一条取指</span>}
          name="PC"
          next={nextPc !== null && nextPc !== pc ? nextPc : null}
          value={pc}
        />
        <div className="cpu-reg cpu-reg-ir">
          <span className="cpu-reg-name">IR</span>
          {ir === null || decoded === null ? (
            <span className={`cpu-reg-value${flight ? " is-ghost" : ""}`}>
              {flight ? `${toBin(irInFlight!, 8)} ⇢` : "—"}
            </span>
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
        <div className={`cpu-carry${lamp ? " is-lit" : ""}`} title="第 5 位：运算溢出/借位灯">
          <span className="cpu-carry-lamp" />
          <span className="cpu-carry-label">第5位灯</span>
        </div>
      </div>
      {pendingRow && mem ? <ColumnAdd mem={mem} row={pendingRow} /> : null}
    </section>
  );
}
