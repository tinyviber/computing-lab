import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { GATE_LABEL, type Bit, type CircuitGraph, type CircuitNode } from "../domain/graph";
import { portsForNode, type CalculatorLessonAction, type PendingWire } from "../lesson/state";
import {
  canvasBounds,
  isPinNode,
  nodeSize,
  portAnchor,
  wirePath,
  PORT_SPACING,
  HEADER_HEIGHT,
} from "./geometry";

type CircuitCanvasProps = {
  graph: CircuitGraph;
  components: Record<string, CircuitGraph>;
  portValues: Record<string, Bit | null>;
  selectedNodeId: string | null;
  pendingWire: PendingWire;
  dispatch: (action: CalculatorLessonAction) => void;
};

function nodeLabel(node: CircuitNode): string {
  if (node.kind === "input" || node.kind === "output") return node.name ?? "?";
  if (node.kind === "const") return String(node.value ?? 0);
  if (node.kind === "component") return node.name ?? "?";
  return GATE_LABEL[node.kind] ?? node.kind;
}

function valueClass(value: Bit | null | undefined): string {
  if (value === 1) return " is-high";
  if (value === 0) return " is-low";
  return " is-floating";
}

export function CircuitCanvas({
  graph,
  components,
  portValues,
  selectedNodeId,
  pendingWire,
  dispatch,
}: CircuitCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
  const bounds = canvasBounds(graph, components);
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const toCanvas = (event: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const onNodePointerDown = (event: ReactPointerEvent, node: CircuitNode) => {
    event.stopPropagation();
    const point = toCanvas(event);
    dragRef.current = { id: node.id, dx: point.x - node.x, dy: point.y - node.y };
    dispatch({ type: "select-node", id: node.id });
    (event.target as Element).setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    const point = toCanvas(event);
    if (pendingWire) setCursor(point);
    const drag = dragRef.current;
    if (!drag) return;
    dispatch({
      type: "move-node",
      id: drag.id,
      x: Math.max(0, Math.round(point.x - drag.dx)),
      y: Math.max(0, Math.round(point.y - drag.dy)),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div className="circuit-canvas-wrap">
      <svg
        aria-label="电路画布"
        className="circuit-canvas"
        height={bounds.height}
        onPointerCancel={endDrag}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onClick={() => {
          if (pendingWire) dispatch({ type: "cancel-wire" });
        }}
        ref={svgRef}
        role="application"
        viewBox={`0 0 ${bounds.width} ${bounds.height}`}
        width={bounds.width}
      >
        <defs>
          <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <path d="M 20 0 L 0 0 0 20" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect
          className="canvas-grid"
          height={bounds.height}
          width={bounds.width}
          fill="url(#grid)"
        />

        <g className="wires">
          {graph.edges.map((edge) => {
            const fromNode = nodesById.get(edge.from.node);
            const toNode = nodesById.get(edge.to.node);
            if (!fromNode || !toNode) return null;
            const from = portAnchor(fromNode, edge.from.port, "out", components);
            const to = portAnchor(toNode, edge.to.port, "in", components);
            const value = portValues[`${edge.from.node}#${edge.from.port}`];
            return (
              <path
                aria-label={`连线 ${nodeLabel(fromNode)} → ${nodeLabel(toNode)}，删除`}
                className={`wire${valueClass(value)}`}
                d={wirePath(from, to)}
                key={edge.id}
                onClick={(event) => {
                  event.stopPropagation();
                  dispatch({ type: "delete-edge", id: edge.id });
                }}
                role="button"
              />
            );
          })}

          {pendingWire && cursor
            ? (() => {
                const fromNode = nodesById.get(pendingWire.from.node);
                if (!fromNode) return null;
                const from = portAnchor(fromNode, pendingWire.from.port, "out", components);
                return <path className="wire is-pending" d={wirePath(from, cursor)} />;
              })()
            : null}
        </g>

        <g className="nodes">
          {graph.nodes.map((node) => {
            const size = nodeSize(node, components);
            const inputs = portsForNode(node, components, "in");
            const outputs = portsForNode(node, components, "out");
            const isSelected = node.id === selectedNodeId;
            const pinValue =
              node.kind === "output" ? portValues[`${node.id}#in`] : portValues[`${node.id}#out`];

            return (
              <g
                className={`circuit-node kind-${node.kind}${isSelected ? " is-selected" : ""}`}
                key={node.id}
                onPointerDown={(event) => onNodePointerDown(event, node)}
                transform={`translate(${node.x} ${node.y})`}
              >
                {isPinNode(node) ? (
                  <>
                    <rect
                      className={`pin-body${valueClass(pinValue)}`}
                      height={size.height}
                      rx={15}
                      width={size.width}
                    />
                    <text className="pin-label" x={size.width / 2} y={size.height / 2 + 4}>
                      {nodeLabel(node)}
                    </text>
                  </>
                ) : (
                  <>
                    <rect className="node-body" height={size.height} rx={6} width={size.width} />
                    <text className="node-label" x={size.width / 2} y={15}>
                      {nodeLabel(node)}
                    </text>
                    {inputs.map((port, index) => (
                      <text
                        className="port-label is-in"
                        key={`l-${port}`}
                        x={5}
                        y={HEADER_HEIGHT + index * PORT_SPACING + PORT_SPACING / 2 + 3}
                      >
                        {port}
                      </text>
                    ))}
                  </>
                )}

                {/* Output ports start a wire. */}
                {outputs.map((port) => {
                  const anchor = portAnchor(node, port, "out", components);
                  return (
                    <circle
                      aria-label={`${nodeLabel(node)} 输出 ${port}`}
                      className={`port is-out${valueClass(portValues[`${node.id}#${port}`])}`}
                      cx={anchor.x - node.x}
                      cy={anchor.y - node.y}
                      key={`o-${port}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        dispatch({ type: "start-wire", from: { node: node.id, port } });
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      r={5}
                      role="button"
                    />
                  );
                })}

                {/* Input ports complete a wire. */}
                {inputs.map((port) => {
                  const anchor = portAnchor(node, port, "in", components);
                  return (
                    <circle
                      aria-label={`${nodeLabel(node)} 输入 ${port}`}
                      className={`port is-in${valueClass(portValues[`${node.id}#${port}`])}`}
                      cx={anchor.x - node.x}
                      cy={anchor.y - node.y}
                      key={`i-${port}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        if (pendingWire)
                          dispatch({ type: "complete-wire", to: { node: node.id, port } });
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      r={5}
                      role="button"
                    />
                  );
                })}

                {/* Toggling a source pin drives the live preview. */}
                {node.kind === "input" || node.kind === "const" ? (
                  <rect
                    aria-label={`切换 ${nodeLabel(node)}，当前 ${node.value ?? 0}`}
                    className="pin-hit"
                    height={size.height}
                    onClick={(event) => {
                      event.stopPropagation();
                      dispatch({ type: "toggle-input", id: node.id });
                    }}
                    role="button"
                    width={size.width}
                  />
                ) : null}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
