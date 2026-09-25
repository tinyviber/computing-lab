/**
 * Selected-device inspector: label, the kind's bounded params, and a
 * delete button for student-added nodes. Fixed furniture shows its lock
 * and keeps params read-only when the stage froze them.
 */

import { KIND_LABEL, NODE_PARAMS, type IsNode, type IsNodeParams } from "../domain/model.ts";

export function DeviceInspector(props: {
  node: IsNode | null;
  disabled: boolean;
  onLabel: (id: string, label: string) => void;
  onParam: (id: string, key: keyof IsNodeParams, value: number) => void;
  onRemove: (id: string) => void;
}) {
  const { node, disabled, onLabel, onParam, onRemove } = props;
  if (!node) {
    return (
      <aside aria-label="设备详情" className="is-inspector">
        <p className="is-inspector-empty">选中一台设备查看参数；点调色板加入新设备。</p>
      </aside>
    );
  }
  const specs = NODE_PARAMS[node.kind];
  const paramsLocked = node.fixedParams === true;
  return (
    <aside aria-label="设备详情" className="is-inspector">
      <header className="is-inspector-head">
        <span className="is-node-kind">{KIND_LABEL[node.kind]}</span>
        <code>{node.id}</code>
      </header>
      <label className="is-field">
        <span>名称</span>
        <input
          disabled={disabled}
          maxLength={24}
          onChange={(event) => onLabel(node.id, event.target.value)}
          value={node.label}
        />
      </label>
      {specs.map((spec) => (
        <label className="is-field" key={spec.key}>
          <span>
            {spec.label}
            {spec.unit ? `（${spec.unit}）` : ""}
          </span>
          <input
            disabled={disabled || paramsLocked}
            max={spec.max}
            min={spec.min}
            onChange={(event) => onParam(node.id, spec.key, Number(event.target.value))}
            step={spec.step}
            type="number"
            value={node.params[spec.key] ?? ""}
          />
          {spec.hint ? <small>{spec.hint}</small> : null}
        </label>
      ))}
      {paramsLocked ? <p className="is-inspector-note">参数由场景校准，本关不可调。</p> : null}
      {!node.fixed ? (
        <button
          className="button button-ghost is-remove"
          disabled={disabled}
          onClick={() => onRemove(node.id)}
          type="button"
        >
          移除设备
        </button>
      ) : (
        <p className="is-inspector-note">场景自带设备，不可移除。</p>
      )}
    </aside>
  );
}
