import { Icon } from "../../../shared/ui/Icon";
import {
  encodeInstr,
  formatInstr,
  opOperandMeaning,
  opUsesReg,
  REG_NAMES,
  type InstrRow,
  type OpName,
} from "../domain/isa.ts";

const toBin = (byte: number) => byte.toString(2).padStart(8, "0");

const OPERAND_LABEL: Record<ReturnType<typeof opOperandMeaning>, string> = {
  mem: "格子号",
  addr: "跳到第几条",
  imm: "立即数",
  none: "",
};

/** One editor row = one instruction = one memory cell. */
function RowEditor(props: {
  index: number;
  row: InstrRow;
  ops: readonly OpName[];
  disabled: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (patch: { op?: OpName; reg?: 0 | 1; operand?: number }) => void;
  onMove: (dir: -1 | 1) => void;
  onInsertBelow: () => void;
  onRemove: () => void;
}) {
  const { index, row, ops, disabled } = props;
  const meaning = opOperandMeaning(row.op);
  return (
    <li className="cpu-row">
      <span className="cpu-row-addr" title={`存储格 ${index}`}>
        {index}
      </span>
      <select
        aria-label={`第 ${index} 行指令`}
        className="cpu-row-op"
        disabled={disabled}
        onChange={(event) => props.onPatch({ op: event.target.value as OpName })}
        value={row.op}
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </select>
      {opUsesReg(row.op) ? (
        <select
          aria-label={`第 ${index} 行寄存器`}
          className="cpu-row-reg"
          disabled={disabled}
          onChange={(event) => props.onPatch({ reg: Number(event.target.value) as 0 | 1 })}
          value={row.reg}
        >
          {REG_NAMES.map((name, i) => (
            <option key={name} value={i}>
              {name}
            </option>
          ))}
        </select>
      ) : (
        <span className="cpu-row-reg is-unused" aria-hidden="true">
          —
        </span>
      )}
      {meaning === "none" ? (
        <span className="cpu-row-operand is-unused" aria-hidden="true">
          —
        </span>
      ) : (
        <label className="cpu-row-operand">
          <span className="cpu-row-operand-label">
            {meaning === "mem" ? `M[` : meaning === "addr" ? "→" : "="}
          </span>
          <input
            aria-label={`第 ${index} 行${OPERAND_LABEL[meaning]}`}
            disabled={disabled}
            max={15}
            min={0}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isInteger(value)) props.onPatch({ operand: value });
            }}
            onBlur={(event) => {
              const value = Math.max(0, Math.min(15, Math.round(Number(event.target.value) || 0)));
              if (value !== row.operand) props.onPatch({ operand: value });
            }}
            type="number"
            value={row.operand}
          />
          <span className="cpu-row-operand-label">{meaning === "mem" ? "]" : ""}</span>
        </label>
      )}
      <code className="cpu-row-byte" title={`编码：${formatInstr(row)}`}>
        {toBin(encodeInstr(row))}
      </code>
      <span className="cpu-row-actions">
        <button
          aria-label="上移"
          disabled={disabled || !props.canMoveUp}
          onClick={() => props.onMove(-1)}
          title="上移一行"
          type="button"
        >
          ↑
        </button>
        <button
          aria-label="下移"
          disabled={disabled || !props.canMoveDown}
          onClick={() => props.onMove(1)}
          title="下移一行"
          type="button"
        >
          ↓
        </button>
        <button
          aria-label="在下方插入一行"
          disabled={disabled}
          onClick={props.onInsertBelow}
          title="在下方插入一行"
          type="button"
        >
          +
        </button>
        <button
          aria-label="删除此行"
          disabled={disabled}
          onClick={props.onRemove}
          title="删除此行"
          type="button"
        >
          <Icon name="x" size={11} />
        </button>
      </span>
    </li>
  );
}

export function ProgramEditor(props: {
  rows: InstrRow[];
  ops: readonly OpName[];
  /** Program occupies cells 0..rows-1 — data lives above that line. */
  disabled: boolean;
  onSetRow: (index: number, patch: { op?: OpName; reg?: 0 | 1; operand?: number }) => void;
  onInsertRow: (index: number) => void;
  onRemoveRow: (index: number) => void;
  onMoveRow: (index: number, dir: -1 | 1) => void;
}) {
  const { rows, ops, disabled } = props;
  return (
    <section aria-label="程序编辑器" className="cpu-editor">
      <div className="cpu-panel-heading">
        <h3>程序</h3>
        <p className="cpu-panel-note">每行一条指令 = 一个存储格；执行到没有 HALT 就会跑出界。</p>
      </div>
      <ol className="cpu-program">
        {rows.map((row, index) => (
          <RowEditor
            canMoveDown={index < rows.length - 1}
            canMoveUp={index > 0}
            disabled={disabled}
            index={index}
            key={index}
            onInsertBelow={() => props.onInsertRow(index + 1)}
            onMove={(dir) => props.onMoveRow(index, dir)}
            onPatch={(patch) => props.onSetRow(index, patch)}
            onRemove={() => props.onRemoveRow(index)}
            ops={ops}
            row={row}
          />
        ))}
        {rows.length === 0 ? <li className="cpu-program-empty">还没有指令——加一行开始。</li> : null}
      </ol>
      {rows.length < 16 ? (
        <button
          className="button button-ghost cpu-add-row"
          disabled={disabled}
          onClick={() => props.onInsertRow(rows.length)}
          type="button"
        >
          + 添加一条指令
        </button>
      ) : (
        <p className="cpu-panel-note">存储器只有 16 格，程序最多 16 行。</p>
      )}
    </section>
  );
}
