/**
 * The rule-table editor: each row is 当 <传感器> <op> <阈值> → <执行器> <开/关>.
 * Row order is the priority order — first hit wins per actuator, no hit
 * keeps the previous state. Under the table, a live echo reads the table
 * back in plain language plus a causal preview against the current
 * readings: 「现在 T=31.0 → 加热器 开；风扇 保持原状」.
 *
 * The editor only emits leaf conditions (C1–C3 palette); the domain's
 * all/any group shape stays reserved for later stages.
 */

import {
  ACTUATOR_LABEL,
  SENSOR_LABEL,
  SENSOR_RANGE,
  SENSOR_UNIT,
  fmtFixed,
  type ActuatorId,
  type Readings,
  type SensorId,
} from "../domain/model.ts";
import {
  CMP_LABEL,
  CMP_OPS,
  holds,
  rowText,
  type CmpOp,
  type CondLeaf,
  type RuleRow,
} from "../domain/rules.ts";

const LEAF: CondLeaf = { kind: "leaf", sensor: "airTemp", op: "<", value: 200 };

function rowPreview(rules: RuleRow[], actuator: ActuatorId, read: Readings): "on" | "off" | "hold" {
  const hit = rules.find((r) => r.actuator === actuator && holds(r.when, read));
  return hit ? hit.set : "hold";
}

export function RuleTableEditor(props: {
  rules: RuleRow[];
  sensors: readonly SensorId[];
  actuators: readonly ActuatorId[];
  maxRules: number;
  disabled?: boolean;
  previewRead: Readings | null;
  onChange: (rules: RuleRow[]) => void;
}) {
  const { rules, sensors, actuators, maxRules, disabled, previewRead, onChange } = props;

  const patchRow = (index: number, patch: Partial<RuleRow>) => {
    onChange(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  };
  const patchLeaf = (index: number, patch: Partial<CondLeaf>) => {
    const row = rules[index];
    if (row.when.kind !== "leaf") return;
    onChange(
      rules.map((r, i) => (i === index ? { ...r, when: { ...r.when, ...patch } as CondLeaf } : r)),
    );
  };
  const removeRow = (index: number) => onChange(rules.filter((_, i) => i !== index));
  const moveRow = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };
  const addRow = () =>
    onChange([
      ...rules,
      {
        when: {
          ...LEAF,
          sensor: sensors[0],
          value:
            Math.round((SENSOR_RANGE[sensors[0]][0] + SENSOR_RANGE[sensors[0]][1]) / 2 / 10) * 10,
        },
        actuator: actuators[0],
        set: "on",
      },
    ]);

  const previewLines = previewRead
    ? actuators.map((a) => {
        const verdict = rowPreview(rules, a, previewRead);
        return `${ACTUATOR_LABEL[a]} ${verdict === "hold" ? "保持原状（无命中）" : verdict === "on" ? "开" : "关"}`;
      })
    : [];

  return (
    <div className="gh-rule-editor">
      <table className="gh-rule-table">
        <thead>
          <tr>
            <th className="gh-rule-order">#</th>
            <th>当 读数满足</th>
            <th>执行器</th>
            <th>动作</th>
            <th aria-label="行操作" />
          </tr>
        </thead>
        <tbody>
          {rules.map((rule, i) => {
            const leaf = rule.when.kind === "leaf" ? rule.when : null;
            const [lo, hi] = leaf ? SENSOR_RANGE[leaf.sensor] : [0, 100];
            return (
              <tr key={i}>
                <td className="gh-rule-order">
                  {i + 1}
                  <span className="gh-rule-move">
                    <button
                      aria-label="上移"
                      disabled={disabled || i === 0}
                      onClick={() => moveRow(i, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label="下移"
                      disabled={disabled || i === rules.length - 1}
                      onClick={() => moveRow(i, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                  </span>
                </td>
                <td>
                  {leaf ? (
                    <span className="gh-cond">
                      <select
                        disabled={disabled || sensors.length <= 1}
                        onChange={(e) => patchLeaf(i, { sensor: e.target.value as SensorId })}
                        value={leaf.sensor}
                      >
                        {sensors.map((s) => (
                          <option key={s} value={s}>
                            {SENSOR_LABEL[s]}
                          </option>
                        ))}
                      </select>
                      <select
                        disabled={disabled}
                        onChange={(e) => patchLeaf(i, { op: e.target.value as CmpOp })}
                        value={leaf.op}
                      >
                        {CMP_OPS.map((op) => (
                          <option key={op} value={op}>
                            {CMP_LABEL[op]}
                          </option>
                        ))}
                      </select>
                      <input
                        disabled={disabled}
                        max={fmtFixed(hi)}
                        min={fmtFixed(lo)}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          if (Number.isFinite(v)) patchLeaf(i, { value: Math.round(v * 10) });
                        }}
                        step={0.5}
                        type="number"
                        value={fmtFixed(leaf.value)}
                      />
                      <span className="gh-unit">{SENSOR_UNIT[leaf.sensor]}</span>
                    </span>
                  ) : (
                    <span className="gh-cond-note">复合条件（此关卡仅支持单条件）</span>
                  )}
                </td>
                <td>
                  <select
                    disabled={disabled}
                    onChange={(e) => patchRow(i, { actuator: e.target.value as ActuatorId })}
                    value={rule.actuator}
                  >
                    {actuators.map((a) => (
                      <option key={a} value={a}>
                        {ACTUATOR_LABEL[a]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select
                    disabled={disabled}
                    onChange={(e) => patchRow(i, { set: e.target.value === "on" ? "on" : "off" })}
                    value={rule.set}
                  >
                    <option value="on">开</option>
                    <option value="off">关</option>
                  </select>
                </td>
                <td>
                  <button
                    aria-label="删除此行"
                    className="button button-ghost gh-rule-del"
                    disabled={disabled}
                    onClick={() => removeRow(i)}
                    type="button"
                  >
                    ×
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="gh-rule-foot">
        <button
          className="button button-secondary"
          disabled={disabled || rules.length >= maxRules}
          onClick={addRow}
          type="button"
        >
          + 加一行规则
        </button>
        <span className="gh-rule-cap">
          {rules.length} / {maxRules} 行 · 每拍从上往下取第一条命中行
        </span>
      </div>

      <ul className="gh-rule-echo">
        {rules.map((r, i) => (
          <li key={i}>
            {i + 1}. {rowText(r)}
          </li>
        ))}
        <li className="gh-rule-fallthrough">否则：执行器保持原状（上拍的状态延续）</li>
      </ul>

      {previewRead ? (
        <p className="gh-rule-preview">
          现在 T={fmtFixed(previewRead.airTemp)}°C → 你的规则会让：{previewLines.join("；")}
        </p>
      ) : null}
    </div>
  );
}
