/**
 * The network canvas: a fixed grid of device cards joined by undirected
 * links. Wiring is two clicks — arm one interface chip, then click a
 * free chip on another device. A wired chip removes its link on click
 * (one wire per interface). During trace playback the canvas lights the
 * node on the current hop and every link a copy has crossed.
 *
 * Links anchor at card edges (point-to-point), not per-iface — the chip
 * row still shows which ends a wire binds.
 */

import { useMemo, useState } from "react";
import {
  GRID_COLS,
  GRID_ROWS,
  KIND_LABEL,
  NODE_IFACES,
  type LinkEnd,
  type NetLink,
  type NetNode,
  type NetTopology,
} from "../domain/model.ts";
import type { SimRun } from "../domain/simulate.ts";
import type { NetStageDef } from "../domain/stages.ts";

const CELL_W = 176;
const CELL_H = 170;
const CARD_W = 160;
const CARD_H = 150;

const sameEnd = (a: LinkEnd, b: LinkEnd) => a.node === b.node && a.iface === b.iface;
const wiredKey = (end: LinkEnd) => `${end.node}|${end.iface}`;
const linkKey = (link: NetLink) => `${wiredKey(link.a)}<>${wiredKey(link.b)}`;
const unordered = (a: string, b: string) => (a <= b ? `${a}<>${b}` : `${b}<>${a}`);

/** Point where a segment center→toward exits the card's rectangle. */
function edgePoint(cx: number, cy: number, tx: number, ty: number) {
  const dx = tx - cx;
  const dy = ty - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const scale = Math.min(
    dx === 0 ? Infinity : CARD_W / 2 / Math.abs(dx),
    dy === 0 ? Infinity : CARD_H / 2 / Math.abs(dy),
  );
  return { x: cx + dx * scale, y: cy + dy * scale };
}

const center = (node: NetNode) => ({
  x: node.x * CELL_W + 6 + CARD_W / 2,
  y: node.y * CELL_H + 6 + CARD_H / 2,
});

export function NetworkCanvas(props: {
  stage: NetStageDef;
  topology: NetTopology;
  disabled: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  wireEditable: boolean;
  run: SimRun | null;
  cursor: number;
  onAddLink: (a: LinkEnd, b: LinkEnd) => void;
  onRemoveLink: (link: NetLink) => void;
}) {
  const {
    topology,
    disabled,
    selectedId,
    onSelect,
    wireEditable,
    run,
    cursor,
    onAddLink,
    onRemoveLink,
  } = props;
  const [pending, setPending] = useState<LinkEnd | null>(null);

  const wired = useMemo(() => {
    const map = new Map<string, NetLink>();
    for (const link of topology.links) {
      map.set(wiredKey(link.a), link);
      map.set(wiredKey(link.b), link);
    }
    return map;
  }, [topology.links]);

  // Playback: the node of the last processed row (hop or drop) lights
  // up; every link a copy emitted across (up to the cursor) stays lit.
  const { activeNode, usedLinks } = useMemo(() => {
    const used = new Set<string>();
    let active: string | null = null;
    if (run) {
      for (const row of run.trace) {
        if (row.step >= cursor) break;
        for (const out of row.outs) used.add(unordered(row.node, out.node));
      }
      // Last processed row — trace and drop lists are each step-sorted.
      const rows = [
        ...run.trace.map((r) => ({ step: r.step, node: r.node })),
        ...run.drops.map((d) => ({ step: d.step, node: d.node })),
      ]
        .filter((r) => r.step < cursor)
        .sort((a, b) => a.step - b.step);
      active = rows.at(-1)?.node ?? null;
    }
    return { activeNode: active, usedLinks: used };
  }, [run, cursor]);

  const pendingNode = pending ? (topology.nodes.find((n) => n.id === pending.node) ?? null) : null;

  const onIfaceClick = (node: NetNode, iface: string) => {
    if (disabled || !wireEditable) return;
    const end: LinkEnd = { node: node.id, iface };
    const existing = wired.get(wiredKey(end));
    if (existing) {
      onRemoveLink(existing);
      setPending(null);
      return;
    }
    if (!pending) {
      setPending(end);
      onSelect(node.id);
      return;
    }
    if (sameEnd(pending, end) || pending.node === node.id) {
      setPending(null);
      return;
    }
    onAddLink(pending, end);
    setPending(null);
  };

  return (
    <section aria-label="网络拓扑画布" className="net-canvas">
      <div className="net-board" style={{ height: GRID_ROWS * CELL_H, width: GRID_COLS * CELL_W }}>
        <svg
          aria-hidden="true"
          className="net-links"
          height={GRID_ROWS * CELL_H}
          width={GRID_COLS * CELL_W}
        >
          {topology.links.map((link) => {
            const aNode = topology.nodes.find((n) => n.id === link.a.node);
            const bNode = topology.nodes.find((n) => n.id === link.b.node);
            if (!aNode || !bNode) return null;
            const ca = center(aNode);
            const cb = center(bNode);
            const a = edgePoint(ca.x, ca.y, cb.x, cb.y);
            const b = edgePoint(cb.x, cb.y, ca.x, ca.y);
            const used = usedLinks.has(unordered(aNode.id, bNode.id));
            return (
              <g key={linkKey(link)}>
                <line
                  className={`net-link${used ? " is-used" : ""}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
                <text className="net-link-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 4}>
                  {link.a.iface}↔{link.b.iface}
                </text>
              </g>
            );
          })}
        </svg>

        {topology.nodes.map((node) => {
          const classes = ["net-node"];
          if (node.id === selectedId) classes.push("is-selected");
          if (node.id === activeNode) classes.push("is-active");
          if (pending && pending.node !== node.id) classes.push("is-wire-target");
          const ifaces = NODE_IFACES[node.kind];
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
              <header className="net-node-head">
                <span className="net-node-kind">{KIND_LABEL[node.kind]}</span>
                <span className="net-node-id">{node.id}</span>
              </header>
              <p className="net-node-label">{node.label || node.id}</p>
              <div className={`net-ifaces net-ifaces-${node.kind}`}>
                {ifaces.map((iface) => {
                  const link = wired.get(wiredKey({ node: node.id, iface }));
                  const other = link
                    ? sameEnd(link.a, { node: node.id, iface })
                      ? link.b
                      : link.a
                    : null;
                  const armed = pending && pending.node === node.id && pending.iface === iface;
                  const classes = ["net-iface"];
                  if (link) classes.push("is-wired");
                  if (armed) classes.push("is-armed");
                  if (pending && !link && pending.node !== node.id) classes.push("is-open");
                  return (
                    <button
                      className={classes.join(" ")}
                      disabled={disabled || !wireEditable}
                      key={iface}
                      onClick={(event) => {
                        event.stopPropagation();
                        onIfaceClick(node, iface);
                      }}
                      title={
                        other
                          ? `${iface} ↔ ${other.node}·${other.iface}（点击移除）`
                          : `${iface}（空闲）`
                      }
                      type="button"
                    >
                      {iface}
                    </button>
                  );
                })}
              </div>
              {node.kind !== "switch" ? (
                <div className="net-node-addrs">
                  {Object.entries(node.addresses).map(([iface, addr]) => (
                    <code key={iface}>
                      {addr.ip}/{addr.prefix}
                    </code>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {pendingNode && pending ? (
        <p className="net-wiring-hint" role="status">
          正在连线：已选 {pendingNode.label || pending.node}·{pending.iface}
          ——点另一台设备的空闲接口完成连接；再点一次可取消。
        </p>
      ) : (
        <p className="net-wiring-hint is-muted">
          {wireEditable
            ? "连线：点接口，再点另一台设备的空闲接口；点已接线的接口可移除。"
            : "本关线路已固定——要改的是参数，不是线。"}
        </p>
      )}
      {pending ? (
        <button
          className="button button-ghost net-cancel-wire"
          onClick={() => setPending(null)}
          type="button"
        >
          取消连线
        </button>
      ) : null}
    </section>
  );
}
