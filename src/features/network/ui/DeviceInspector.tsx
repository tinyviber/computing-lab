/**
 * Selected-device inspector — the only place students edit. Hosts get
 * ip/mask and gateway inputs, routers get route rows; editable surfaces
 * follow the stage's `edit` flags, everything else renders read-only.
 */

import { formatMask } from "../domain/addressing.ts";
import type { NetEdit } from "../domain/scenario.ts";
import { KIND_LABEL, type NetNode } from "../domain/topology.ts";

export function NetDeviceInspector(props: {
  node: NetNode | null;
  edit: NetEdit;
  required: ReadonlyMap<string, string>;
  onPort: (nodeId: string, portId: string, field: "ip" | "mask", value: string) => void;
  onGateway: (nodeId: string, value: string) => void;
  onAddRoute: (nodeId: string) => void;
  onSetRoute: (nodeId: string, row: number, field: "prefix" | "nextHop", value: string) => void;
  onRemoveRoute: (nodeId: string, row: number) => void;
}) {
  const { node, edit, required, onPort, onGateway, onAddRoute, onSetRoute, onRemoveRoute } = props;
  if (!node) {
    return (
      <aside aria-label="设备详情" className="net-inspector">
        <p className="net-inspector-empty">选中一台设备查看或修改它的配置。</p>
      </aside>
    );
  }
  return (
    <aside aria-label="设备详情" className="net-inspector">
      <header className="net-inspector-head">
        <span className="net-kind-chip">{KIND_LABEL[node.kind]}</span>
        <strong>{node.label}</strong>
      </header>

      {node.ports
        .filter((p) => p.id !== undefined && node.kind !== "switch")
        .map((port) => {
          const need = required.get(`${node.id}/${port.id}`);
          const maskEcho = port.mask?.startsWith("/")
            ? ` = ${formatMask(Number(port.mask.slice(1)))}`
            : "";
          return (
            <div className="net-port-block" key={port.id}>
              <p className="net-port-title">
                <code>{port.id}</code>
                {need ? <span className="net-port-need">须属 {need}</span> : null}
              </p>
              <label className="net-field">
                <span>IP 地址</span>
                <input
                  disabled={!edit.address}
                  onChange={(e) => onPort(node.id, port.id, "ip", e.target.value)}
                  placeholder="例如 10.0.1.11"
                  value={port.ip ?? ""}
                />
              </label>
              <label className="net-field">
                <span>子网掩码{maskEcho}</span>
                <input
                  disabled={!edit.address}
                  onChange={(e) => onPort(node.id, port.id, "mask", e.target.value)}
                  placeholder="/24 或 255.255.255.0"
                  value={port.mask ?? ""}
                />
              </label>
            </div>
          );
        })}

      {node.kind === "switch" ? (
        <p className="net-inspector-note">交换机工作在二层，只记 MAC 表；端口不配地址。</p>
      ) : null}

      {node.kind === "host" ? (
        <label className="net-field">
          <span>默认网关</span>
          <input
            disabled={!edit.gateway}
            onChange={(e) => onGateway(node.id, e.target.value)}
            placeholder={edit.gateway ? "本网段路由器接口的地址" : "本关不用配"}
            value={node.gateway ?? ""}
          />
        </label>
      ) : null}

      {node.kind === "router" ? (
        <div className="net-port-block">
          <p className="net-port-title">
            <code>路由表</code>
            <span className="net-port-need">直连网段不用写；下一跳必须在线</span>
          </p>
          {(node.routes ?? []).map((r, i) => (
            <div className="net-route-row" key={i}>
              <input
                aria-label="路由前缀"
                disabled={!edit.routes}
                onChange={(e) => onSetRoute(node.id, i, "prefix", e.target.value)}
                placeholder="10.x.2.0/24"
                value={r.prefix}
              />
              <span className="net-route-via">经</span>
              <input
                aria-label="下一跳"
                disabled={!edit.routes}
                onChange={(e) => onSetRoute(node.id, i, "nextHop", e.target.value)}
                placeholder="10.x.255.2"
                value={r.nextHop}
              />
              <button
                className="button button-ghost net-route-del"
                disabled={!edit.routes}
                onClick={() => onRemoveRoute(node.id, i)}
                type="button"
              >
                删
              </button>
            </div>
          ))}
          {edit.routes ? (
            <button
              className="button button-ghost"
              disabled={(node.routes ?? []).length >= 8}
              onClick={() => onAddRoute(node.id)}
              type="button"
            >
              + 加一条路由
            </button>
          ) : (
            <p className="net-inspector-note">路由表本关只读。</p>
          )}
        </div>
      ) : null}
    </aside>
  );
}
