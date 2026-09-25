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

/**
 * Guided stages (issue #70): most rows are locked — rendered as read-only
 * mnemonics — and the handful in `editableRows` take normal selects with a
 * stage-scoped op list. Rows still equal to their prefill render dimmed
 * ("待补全") so the learner sees which slot is theirs to fill.
 */
function RowEditor(props: {
  index: number;
  row: InstrRow;
  ops: readonly OpName[];
  disabled: boolean;
  locked: boolean;
  blank: boolean;
  active: boolean;
  freeEditor: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onPatch: (patch: { op?: OpName; reg?: 0 | 1; operand?: number }) => void;
  onMove: (dir: -1 | 1) => void;
  onInsertBelow: () => void;
  onRemove: () => void;
}) {
  const { index, row, ops, disabled, locked, blank, active, freeEditor } = props;
  const meaning = opOperandMeaning(row.op);
  const classes = [
    "cpu-row",
    active ? "is-active" : "",
    locked ? "is-locked" : "",
    blank ? "is-blank" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <li className={classes}>
      <span className="cpu-row-addr" title={`存储格 ${index}`}>
        {index}
      </span>
      {locked ? (
        <code className="cpu-row-fixed">{formatInstr(row)}</code>
      ) : (
        <>
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
                  const value = Math.max(
                    0,
                    Math.min(15, Math.round(Number(event.target.value) || 0)),
                  );
                  if (value !== row.operand) props.onPatch({ operand: value });
                }}
                type="number"
                value={row.operand}
              />
              <span className="cpu-row-operand-label">{meaning === "mem" ? "]" : ""}</span>
            </label>
          )}
        </>
      )}
      {blank ? <span className="cpu-row-blank-badge">待补全</span> : null}
      <code className="cpu-row-byte" title={`编码：${formatInstr(row)}`}>
        {toBin(encodeInstr(row))}
      </code>
      {freeEditor ? (
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
      ) : null}
    </li>
  );
}

export function ProgramEditor(props: {
  rows: InstrRow[];
  ops: readonly OpName[];
  /** Guided stages only: op list for editable rows. */
  rowOps?: readonly OpName[];
  /** Rows the learner may edit; empty = all rows (free stages). */
  editableRows?: ReadonlySet<number>;
  /** Rows still holding their prefill placeholder. */
  blankRows?: ReadonlySet<number>;
  /** Row the pending cycle will fetch — highlighted during playback. */
  activeRow?: number | null;
  /** Program occupies cells 0..rows-1 — data lives above that line. */
  disabled: boolean;
  onSetRow: (index: number, patch: { op?: OpName; reg?: 0 | 1; operand?: number }) => void;
  onInsertRow: (index: number) => void;
  onRemoveRow: (index: number) => void;
  onMoveRow: (index: number, dir: -1 | 1) => void;
}) {
  const { rows, ops, rowOps, editableRows, blankRows, activeRow, disabled } = props;
  const guided = editableRows !== undefined;
  return (
    <section aria-label="程序编辑器" className="cpu-editor">
      <div className="cpu-panel-heading">
        <h3>程序</h3>
        <p className="cpu-panel-note">
          {guided
            ? "锁定的行不许动——你只需填亮着的那几格。每行一条指令 = 一个存储格。"
            : "每行一条指令 = 一个存储格；执行到没有 HALT 就会跑出界。"}
        </p>
      </div>
      <ol className="cpu-program">
        {rows.map((row, index) => {
          const editable = !guided || editableRows.has(index);
          return (
            <RowEditor
              active={activeRow === index}
              blank={blankRows?.has(index) === true}
              canMoveDown={index < rows.length - 1}
              canMoveUp={index > 0}
              disabled={disabled}
              freeEditor={!guided}
              index={index}
              key={index}
              locked={!editable}
              onInsertBelow={() => props.onInsertRow(index + 1)}
              onMove={(dir) => props.onMoveRow(index, dir)}
              onPatch={(patch) => props.onSetRow(index, patch)}
              onRemove={() => props.onRemoveRow(index)}
              ops={rowOps ?? ops}
              row={row}
            />
          );
        })}
        {rows.length === 0 ? <li className="cpu-program-empty">还没有指令——加一行开始。</li> : null}
      </ol>
      {!guided ? (
        rows.length < 16 ? (
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
        )
      ) : null}
    </section>
  );
}
