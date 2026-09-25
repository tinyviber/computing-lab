import { decodeInstr, encodeInstr, formatInstr, OPCODES, type InstrRow } from "../domain/isa.ts";

const toBin = (byte: number) => byte.toString(2).padStart(8, "0");

/**
 * The byte playground (issue #70 C4): flip bits, see the field split and
 * the decoded instruction — a byte IS an instruction encoding. The byte
 * lives in lesson state so guided prompts can require real manipulation
 * (`requiresByte`) instead of admiring a preset. The program's own bytes
 * are offered as presets so the learner can verify "cell 2 really is
 * 224 = HALT" with their own eyes.
 */
export function BytePlayground(props: {
  byte: number;
  onByte: (value: number) => void;
  programBytes: number[];
}) {
  const { byte, onByte } = props;
  const decoded = decodeInstr(byte);
  // All 8 opcode patterns are valid — every byte decodes to something.
  const opName = OPCODES[(byte >> 5) & 0b111];
  const bits = toBin(byte);
  const fieldBits = [bits.slice(0, 3), bits.slice(3, 4), bits.slice(4)];

  const toggle = (bit: number) => onByte(byte ^ (1 << bit));

  const built = (row: InstrRow) => encodeInstr(row);

  return (
    <section aria-label="字节游乐场" className="cpu-byteplay">
      <div className="cpu-panel-heading">
        <h3>字节游乐场</h3>
        <p className="cpu-panel-note">
          一个存储格 = 8 位 = 一条指令。点下面的位翻转，看译码器怎么读它。
        </p>
      </div>
      <div className="cpu-byteplay-row">
        <div className="cpu-byteplay-bits" role="group" aria-label="位开关">
          {bits.split("").map((bit, i) => {
            const field = i < 3 ? 0 : i === 3 ? 1 : 2;
            return (
              <button
                aria-label={`第 ${i} 位`}
                aria-pressed={bit === "1"}
                className={`cpu-bit cpu-bit-f${field}${bit === "1" ? " is-on" : ""}`}
                key={i}
                onClick={() => toggle(7 - i)}
                type="button"
              >
                {bit}
              </button>
            );
          })}
        </div>
        <div className="cpu-byteplay-fields">
          <span>
            <code className="cpu-ir-op">{fieldBits[0]}</code> 指令（{opName}）
          </span>
          <span>
            <code className="cpu-ir-reg">{fieldBits[1]}</code> 寄存器（
            {decoded.reg === 0 ? "A" : "B"}）
          </span>
          <span>
            <code className="cpu-ir-operand">{fieldBits[2]}</code> 操作数（{decoded.operand}）
          </span>
        </div>
        <p className="cpu-byteplay-decode">
          字节 <strong>{byte}</strong> = <code>{formatInstr(decoded)}</code>
        </p>
      </div>
      <p className="cpu-byteplay-presets">
        试试：
        {props.programBytes.map((b, i) => (
          <button
            className={`cpu-preset${b === byte ? " is-active" : ""}`}
            key={`p${i}`}
            onClick={() => onByte(b)}
            type="button"
          >
            程序格{i} = {b}
          </button>
        ))}
        <button
          className={`cpu-preset${byte === built({ op: "ADD", reg: 0, operand: 14 }) ? " is-active" : ""}`}
          onClick={() => onByte(built({ op: "ADD", reg: 0, operand: 14 }))}
          type="button"
        >
          ADD A,M[14]
        </button>
      </p>
    </section>
  );
}
