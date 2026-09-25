/**
 * The light canvas: a 4×2 grid of device cards plus SVG-drawn links.
 *
 * Wiring is two clicks — pick a source's out port, then a legal in-port.
 * A driven in-port shows its source; clicking it removes the wire
 * (one driver per port). Editing is paused while playback runs, mirroring
 * the cpu lab's "lock while running" rule.
 */

import { useMemo, useState } from "react";
import { Icon } from "../../../shared/ui/Icon";
import {
  GRID_COLS,
  GRID_ROWS,
  KIND_LABEL,
  NODE_PORTS,
  PORT_LABEL,
  type IsLink,
  type IsNode,
  type IsNodeKind,
  type IsTopology,
} from "../domain/model.ts";
import type { DeviceView } from "../domain/sim.ts";
import type { IsStageDef } from "../domain/stages.ts";

const CELL_W = 168;
const CELL_H = 128;

export function portCenter(node: IsNode, port: string, side: "in" | "out") {
  const spec = NODE_PORTS[node.kind];
  const baseX = node.x * CELL_W;
  const baseY = node.y * CELL_H;
  if (side === "out") {
    const idx = Math.max(0, spec.out.indexOf(port));
    return { x: baseX + CELL_W - 12, y: baseY + 34 + idx * 18 };
  }
  const idx = Math.max(0, spec.in.indexOf(port));
  return { x: baseX + 10, y: baseY + 34 + idx * 18 };
}

export function TopologyCanvas(props: {
  stage: IsStageDef;
  topology: IsTopology;
  disabled: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  views: Record<string, DeviceView> | null;
  onAddNode: (kind: IsNodeKind) => void;
  onAddLink: (link: IsLink) => void;
  onRemoveLink: (link: IsLink) => void;
}) {
  const {
    stage,
    topology,
    disabled,
    selectedId,
    onSelect,
    views,
    onAddNode,
    onAddLink,
    onRemoveLink,
  } = props;
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);

  const driven = useMemo(() => {
    const map = new Map<string, IsLink>();
    for (const link of topology.links) map.set(`${link.to}|${link.port}`, link);
    return map;
  }, [topology.links]);

  const cancelPending = () => setPendingFrom(null);

  const onOutPort = (node: IsNode) => {
    if (disabled) return;
    setPendingFrom((cur) => (cur === node.id ? null : node.id));
    onSelect(node.id);
  };

  const onInPort = (node: IsNode, port: string) => {
    if (disabled) return;
    const existing = driven.get(`${node.id}|${port}`);
    if (existing) {
      onRemoveLink(existing);
      return;
    }
    if (!pendingFrom || pendingFrom === node.id) return;
    onAddLink({ from: pendingFrom, to: node.id, port });
    setPendingFrom(null);
  };

  return (
    <section aria-label="设备画布" className="is-canvas">
      <div className="is-palette" role="toolbar" aria-label="设备调色板">
        {stage.devices.map((kind) => (
          <button
            className="button button-secondary is-palette-item"
            disabled={disabled || topology.nodes.length >= stage.maxDevices}
            key={kind}
            onClick={() => onAddNode(kind)}
            type="button"
          >
            ＋ {KIND_LABEL[kind]}
          </button>
        ))}
        <span className="is-palette-note">
          {topology.nodes.length} / {stage.maxDevices} 台设备
        </span>
      </div>

      <div className="is-board" style={{ height: GRID_ROWS * CELL_H, width: GRID_COLS * CELL_W }}>
        <svg
          aria-hidden="true"
          className="is-links"
          height={GRID_ROWS * CELL_H}
          width={GRID_COLS * CELL_W}
        >
          {topology.links.map((link) => {
            const from = topology.nodes.find((n) => n.id === link.from);
            const to = topology.nodes.find((n) => n.id === link.to);
            if (!from || !to) return null;
            const a = portCenter(from, "out", "out");
            const b = portCenter(to, link.port, "in");
            const mid = (a.x + b.x) / 2;
            return (
              <path
                className="is-link"
                d={`M ${a.x} ${a.y} C ${mid} ${a.y}, ${mid} ${b.y}, ${b.x} ${b.y}`}
                key={`${link.from}|${link.to}|${link.port}`}
              />
            );
          })}
          {pendingFrom
            ? (() => {
                const from = topology.nodes.find((n) => n.id === pendingFrom);
                if (!from) return null;
                const a = portCenter(from, "out", "out");
                return <circle className="is-pending-dot" cx={a.x} cy={a.y} r={5} />;
              })()
            : null}
        </svg>

        {topology.nodes.map((node) => {
          const spec = NODE_PORTS[node.kind];
          const view = views?.[node.id];
          const classes = ["is-node"];
          if (node.id === selectedId) classes.push("is-selected");
          if (view && !view.up) classes.push("is-down");
          if (view?.active) classes.push("is-active");
          if (pendingFrom && pendingFrom !== node.id && spec.in.length > 0) {
            classes.push("is-wire-target");
          }
          return (
            <div
              aria-label={`${KIND_LABEL[node.kind]} ${node.label || node.id}`}
              className={classes.join(" ")}
              key={node.id}
              onClick={() => onSelect(node.id)}
              role="button"
              style={{ left: node.x * CELL_W + 6, top: node.y * CELL_H + 6 }}
              tabIndex={0}
            >
              <header className="is-node-head">
                <span className="is-node-kind">{KIND_LABEL[node.kind]}</span>
                {node.fixed ? <Icon name="lock" size={10} /> : null}
              </header>
              <p className="is-node-label">{node.label || node.id}</p>
              <div className="is-node-ports">
                <div className="is-node-ins">
                  {spec.in.map((port) => {
                    const link = driven.get(`${node.id}|${port}`);
                    return (
                      <button
                        className={`is-port is-port-in${link ? " is-driven" : ""}${
                          pendingFrom && !link ? " is-open" : ""
                        }`}
                        disabled={disabled}
                        key={port}
                        onClick={(event) => {
                          event.stopPropagation();
                          onInPort(node, port);
                        }}
                        title={
                          link
                            ? `${PORT_LABEL[port] ?? port} ← ${link.from}（点击移除）`
                            : `${PORT_LABEL[port] ?? port}（空闲）`
                        }
                        type="button"
                      >
                        {PORT_LABEL[port] ?? port}
                        {link ? ` ← ${link.from}` : ""}
                      </button>
                    );
                  })}
                </div>
                <div className="is-node-outs">
                  {spec.out.map((port) => (
                    <button
                      className={`is-port is-port-out${pendingFrom === node.id ? " is-armed" : ""}`}
                      disabled={disabled}
                      key={port}
                      onClick={(event) => {
                        event.stopPropagation();
                        onOutPort(node);
                      }}
                      title="输出（点此开始连线）"
                      type="button"
                    >
                      {PORT_LABEL[port] ?? port} →
                    </button>
                  ))}
                </div>
              </div>
              {view ? (
                <p className="is-node-stat">
                  {node.kind === "sensor" ? `已发 ${view.emitted}` : null}
                  {node.kind === "gateway" ? `转发 ${view.forwarded} · 丢 ${view.dropped}` : null}
                  {node.kind === "db" ? `${view.stored.length} 条` : null}
                  {node.kind === "actuator" ? (view.active ? "动作中" : "待机") : null}
                  {node.kind === "dashboard" ? `收到 ${view.seen}` : null}
                  {node.kind === "human" ? `队列 ${view.pending}` : null}
                  {view && !view.up ? " · 宕机" : null}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      {pendingFrom ? (
        <p className="is-wiring-hint" role="status">
          正在连线：从「{pendingFrom}」输出 —— 点一个空闲输入口完成连接；再点输出可取消。
        </p>
      ) : (
        <p className="is-wiring-hint is-muted">
          连线：点设备的「输出 →」，再点另一台设备的输入口。点已接线的输入口可移除。
        </p>
      )}
      {pendingFrom ? (
        <button
          className="button button-ghost is-cancel-wire"
          onClick={cancelPending}
          type="button"
        >
          取消连线
        </button>
      ) : null}
    </section>
  );
}
