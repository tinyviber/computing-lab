/**
 * Topology canvas: fixed per-stage graphs drawn on the shared lab grid.
 * Nodes are cards (kind + label + configured addresses); links carry the
 * port labels at each end and, when both ends are configured, the subnet
 * tag at the midpoint. During trace playback the visited nodes tint and
 * the step's current node pulses.
 */

import { useMemo } from "react";
import { formatCidr, networkOf, parseIp } from "../domain/addressing.ts";
import type { SimStep } from "../domain/simulate.ts";
import { KIND_LABEL, type NetNode, type NetTopology } from "../domain/topology.ts";

const CELL_W = 180;
const CELL_H = 132;
const PAD_X = 40;
const PAD_Y = 36;
const NODE_W = 128;
const NODE_H = 64;

function center(node: NetNode): { x: number; y: number } {
  return { x: PAD_X + node.x * CELL_W + NODE_W / 2, y: PAD_Y + node.y * CELL_H + NODE_H / 2 };
}

function portAddressText(node: NetNode): string[] {
  const out: string[] = [];
  for (const port of node.ports) {
    if (!port.ip) continue;
    const prefix = port.mask?.startsWith("/") ? Number(port.mask.slice(1)) : null;
    out.push(`${port.id} ${port.ip}${prefix !== null ? `/${prefix}` : ""}`);
  }
  if (node.gateway) out.push(`gw ${node.gateway}`);
  return out;
}

export function NetworkCanvas(props: {
  net: NetTopology;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Trace being played back: cursor = seq of the step under review. */
  trace: SimStep[] | null;
  cursor: number;
  required: ReadonlyMap<string, string>;
}) {
  const { net, selectedId, onSelect, trace, cursor, required } = props;

  const nodeById = useMemo(() => new Map(net.nodes.map((n) => [n.id, n])), [net]);

  const { visited, activeId } = useMemo(() => {
    const visited = new Set<string>();
    let activeId: string | null = null;
    if (trace) {
      for (const step of trace) {
        if (step.seq > cursor) break;
        visited.add(step.nodeId);
        activeId = step.nodeId;
      }
    }
    return { visited, activeId };
  }, [trace, cursor]);

  const linkViews = useMemo(
    () =>
      net.links.map((l) => {
        const aNode = nodeById.get(l.a.node);
        const bNode = nodeById.get(l.b.node);
        if (!aNode || !bNode) return null;
        const ca = center(aNode);
        const cb = center(bNode);
        // Subnet tag when an end is configured (both configured → must match).
        const subnets = [l.a, l.b].map((end) => {
          const n = nodeById.get(end.node)!;
          const p = n.ports.find((x) => x.id === end.port);
          if (!p?.ip || !p.mask) return null;
          const ip = parseIp(p.ip);
          const prefix = p.mask.startsWith("/") ? Number(p.mask.slice(1)) : null;
          if (ip === null || prefix === null) return null;
          return formatCidr(networkOf(ip, prefix), prefix);
        });
        const tag = subnets[0] ?? subnets[1] ?? null;
        const mismatch = subnets[0] !== null && subnets[1] !== null && subnets[0] !== subnets[1];
        return { l, ca, cb, tag, mismatch };
      }),
    [net, nodeById],
  );

  const width = PAD_X * 2 + CELL_W * 4 - (CELL_W - NODE_W);
  const height = PAD_Y * 2 + CELL_H * 2 - (CELL_H - NODE_H);

  return (
    <div className="net-canvas-wrap">
      <svg
        aria-label="网络拓扑"
        className="net-canvas"
        role="img"
        viewBox={`0 0 ${width} ${height}`}
        onClick={() => onSelect(null)}
      >
        {linkViews.map((v, i) =>
          v ? (
            <g key={i}>
              <line
                className={`net-link${v.mismatch ? " net-link-bad" : ""}`}
                x1={v.ca.x}
                y1={v.ca.y}
                x2={v.cb.x}
                y2={v.cb.y}
              />
              <text
                className="net-port-tag"
                x={v.ca.x + (v.cb.x - v.ca.x) * 0.18}
                y={v.ca.y + (v.cb.y - v.ca.y) * 0.18 - 4}
              >
                {v.l.a.port}
              </text>
              <text
                className="net-port-tag"
                x={v.cb.x + (v.ca.x - v.cb.x) * 0.18}
                y={v.cb.y + (v.ca.y - v.cb.y) * 0.18 - 4}
              >
                {v.l.b.port}
              </text>
              {v.tag ? (
                <text
                  className={`net-subnet-tag${v.mismatch ? " net-subnet-bad" : ""}`}
                  x={(v.ca.x + v.cb.x) / 2}
                  y={(v.ca.y + v.cb.y) / 2 + 12}
                >
                  {v.mismatch ? "两端不在同一网段" : v.tag}
                </text>
              ) : null}
            </g>
          ) : null,
        )}
        {net.nodes.map((node) => {
          const c = center(node);
          const addrs = portAddressText(node);
          const needs = [...required.entries()]
            .filter(([k]) => k.startsWith(`${node.id}/`))
            .map(([, v]) => v);
          const cls = [
            "net-node",
            `net-node-${node.kind}`,
            selectedId === node.id ? "net-selected" : "",
            visited.has(node.id) ? "net-visited" : "",
            activeId === node.id ? "net-active" : "",
          ].join(" ");
          return (
            <g
              className={cls}
              key={node.id}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(node.id);
              }}
              transform={`translate(${c.x - NODE_W / 2}, ${c.y - NODE_H / 2})`}
            >
              <rect height={NODE_H} rx={10} width={NODE_W} />
              <text className="net-node-label" x={10} y={20}>
                {node.label}
              </text>
              <text className="net-node-kind" x={NODE_W - 10} y={20} textAnchor="end">
                {KIND_LABEL[node.kind]}
              </text>
              {addrs.slice(0, 2).map((a, i) => (
                <text className="net-node-addr" key={i} x={10} y={36 + i * 13}>
                  {a}
                </text>
              ))}
              {addrs.length === 0 && needs.length > 0 ? (
                <text className="net-node-need" x={10} y={36}>
                  需要 {needs[0]}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <p className="net-canvas-hint">
        点选设备在下方检查器里改配置；端口上的小字是端口号，连线中部是网段。
      </p>
    </div>
  );
}
