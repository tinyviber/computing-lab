/**
 * Selected-device inspector for the network lab: label, per-interface
 * address editor, the host's default gateway, the router's static table,
 * and — during replay — the switch's MAC table as it stands at the
 * current step. Every field's editability comes from the stage's
 * `editable` list so the same panel works for all five stages.
 */

import { KIND_LABEL, NODE_IFACES, type NetNode, type NetRoute } from "../domain/model.ts";
import type { NetEditCapability } from "../domain/stages.ts";

export type NetInspectorView = {
  /** The selected switch's MAC table at the current cursor step. */
  macTable: Record<string, string> | null;
};

function AddressRow(props: {
  iface: string;
  ip: string;
  prefix: number;
  disabled: boolean;
  onChange: (ip: string, prefix: number) => void;
  onClear?: () => void;
}) {
  const { iface, ip, prefix, disabled, onChange, onClear } = props;
  return (
    <div className="net-field net-field-addr">
      <span>{iface}</span>
      <div className="net-addr-inputs">
        <input
          aria-label={`${iface} 地址`}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value, prefix)}
          placeholder="10.0.1.11"
          value={ip}
        />
        <input
          aria-label={`${iface} 前缀`}
          className="net-prefix"
          disabled={disabled}
          max={32}
          min={0}
          onChange={(e) => onChange(ip, Number(e.target.value))}
          type="number"
          value={prefix}
        />
        {onClear ? (
          <button
            aria-label={`清除 ${iface} 地址`}
            className="button button-ghost"
            disabled={disabled}
            onClick={onClear}
            type="button"
          >
            ✕
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function NetworkInspector(props: {
  node: NetNode | null;
  disabled: boolean;
  editable: readonly NetEditCapability[];
  view: NetInspectorView;
  onLabel: (id: string, label: string) => void;
  onAddress: (id: string, iface: string, addr: { ip: string; prefix: number } | null) => void;
  onGateway: (id: string, gateway: string | null) => void;
  onAddRoute: (id: string) => void;
  onUpdateRoute: (id: string, index: number, patch: Partial<NetRoute>) => void;
  onRemoveRoute: (id: string, index: number) => void;
}) {
  const {
    node,
    disabled,
    editable,
    view,
    onLabel,
    onAddress,
    onGateway,
    onAddRoute,
    onUpdateRoute,
    onRemoveRoute,
  } = props;
  if (!node) {
    return (
      <aside aria-label="设备详情" className="net-inspector">
        <p className="net-inspector-empty">选中一台设备查看地址与转发表。</p>
      </aside>
    );
  }
  const can = (cap: NetEditCapability) => editable.includes(cap);
  const ifaces = NODE_IFACES[node.kind];
  return (
    <aside aria-label="设备详情" className="net-inspector">
      <header className="net-inspector-head">
        <span className="net-node-kind">{KIND_LABEL[node.kind]}</span>
        <code>{node.id}</code>
      </header>
      <label className="net-field">
        <span>名称</span>
        <input
          disabled={disabled || !can("label")}
          maxLength={24}
          onChange={(event) => onLabel(node.id, event.target.value)}
          value={node.label}
        />
      </label>

      {node.kind !== "switch" ? (
        <fieldset className="net-fieldset" disabled={disabled || !can("address")}>
          <legend>接口地址</legend>
          {ifaces.map((iface) => {
            const addr = node.addresses[iface];
            return (
              <AddressRow
                disabled={disabled || !can("address")}
                iface={iface}
                ip={addr?.ip ?? ""}
                key={iface}
                onChange={(ip, prefix) => onAddress(node.id, iface, { ip, prefix })}
                onClear={addr ? () => onAddress(node.id, iface, null) : undefined}
                prefix={addr?.prefix ?? 24}
              />
            );
          })}
          {!can("address") ? <small className="net-inspector-note">地址本关已配好。</small> : null}
        </fieldset>
      ) : (
        <div className="net-field">
          <span>MAC 表</span>
          {view.macTable && Object.keys(view.macTable).length > 0 ? (
            <ul className="net-mactable">
              {Object.entries(view.macTable).map(([mac, iface]) => (
                <li key={mac}>
                  <code>{mac}</code> → {iface}
                </li>
              ))}
            </ul>
          ) : (
            <p className="net-inspector-empty">表还是空的——发一个包它就学。</p>
          )}
        </div>
      )}

      {node.kind === "host" ? (
        <label className="net-field">
          <span>默认网关</span>
          <input
            disabled={disabled || !can("gateway")}
            onChange={(event) =>
              onGateway(node.id, event.target.value.trim() === "" ? null : event.target.value)
            }
            placeholder="10.0.1.254"
            value={node.gateway ?? ""}
          />
          {!can("gateway") ? <small className="net-inspector-note">网关本关已配好。</small> : null}
        </label>
      ) : null}

      {node.kind === "router" ? (
        <fieldset className="net-fieldset" disabled={disabled || !can("routes")}>
          <legend>静态路由表</legend>
          {node.routes.map((route, index) => (
            <div className="net-route-row" key={index}>
              <input
                aria-label={`路由 ${index + 1} 目的`}
                disabled={disabled || !can("routes")}
                onChange={(e) => onUpdateRoute(node.id, index, { dest: e.target.value })}
                placeholder="10.0.3.0"
                value={route.dest}
              />
              <input
                aria-label={`路由 ${index + 1} 前缀`}
                className="net-prefix"
                disabled={disabled || !can("routes")}
                max={32}
                min={0}
                onChange={(e) => onUpdateRoute(node.id, index, { prefix: Number(e.target.value) })}
                type="number"
                value={route.prefix}
              />
              <input
                aria-label={`路由 ${index + 1} 下一跳`}
                disabled={disabled || !can("routes")}
                onChange={(e) => onUpdateRoute(node.id, index, { nextHop: e.target.value })}
                placeholder="下一跳"
                value={route.nextHop}
              />
              <button
                aria-label={`删除路由 ${index + 1}`}
                className="button button-ghost"
                disabled={disabled || !can("routes")}
                onClick={() => onRemoveRoute(node.id, index)}
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
          {can("routes") ? (
            <button
              className="button button-secondary"
              disabled={disabled || node.routes.length >= 8}
              onClick={() => onAddRoute(node.id)}
              type="button"
            >
              ＋ 加一条路由
            </button>
          ) : (
            <small className="net-inspector-note">路由表本关已配好。</small>
          )}
        </fieldset>
      ) : null}
    </aside>
  );
}
