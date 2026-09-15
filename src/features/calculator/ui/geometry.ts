/**
 * Canvas geometry. Presentation-only: node boxes, port anchors, wire paths.
 */

import type { CircuitGraph, CircuitNode } from "../domain/graph";
import { portsForNode } from "../lesson/state";

export const NODE_WIDTH = 78;
export const HEADER_HEIGHT = 22;
export const PORT_SPACING = 18;
export const PIN_WIDTH = 64;
export const PIN_HEIGHT = 30;

export function isPinNode(node: CircuitNode): boolean {
  return node.kind === "input" || node.kind === "output" || node.kind === "const";
}

export function nodeSize(
  node: CircuitNode,
  components: Record<string, CircuitGraph>,
): { width: number; height: number } {
  if (isPinNode(node)) return { width: PIN_WIDTH, height: PIN_HEIGHT };
  const ins = portsForNode(node, components, "in").length;
  const outs = portsForNode(node, components, "out").length;
  const rows = Math.max(ins, outs, 1);
  return { width: NODE_WIDTH, height: HEADER_HEIGHT + rows * PORT_SPACING + 8 };
}

/** Anchor point of one port, in canvas coordinates. */
export function portAnchor(
  node: CircuitNode,
  port: string,
  direction: "in" | "out",
  components: Record<string, CircuitGraph>,
): { x: number; y: number } {
  const { width, height } = nodeSize(node, components);
  if (isPinNode(node)) {
    return {
      x: direction === "out" ? node.x + width : node.x,
      y: node.y + height / 2,
    };
  }
  const ports = portsForNode(node, components, direction);
  const index = Math.max(0, ports.indexOf(port));
  return {
    x: direction === "out" ? node.x + width : node.x,
    y: node.y + HEADER_HEIGHT + index * PORT_SPACING + PORT_SPACING / 2,
  };
}

/** Smooth cubic wire between two anchors. */
export function wirePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const dx = Math.max(24, Math.abs(to.x - from.x) * 0.5);
  return `M ${from.x} ${from.y} C ${from.x + dx} ${from.y}, ${to.x - dx} ${to.y}, ${to.x} ${to.y}`;
}

export function canvasBounds(
  graph: CircuitGraph,
  components: Record<string, CircuitGraph>,
): { width: number; height: number } {
  let width = 820;
  let height = 420;
  for (const node of graph.nodes) {
    const size = nodeSize(node, components);
    width = Math.max(width, node.x + size.width + 60);
    height = Math.max(height, node.y + size.height + 60);
  }
  return { width, height };
}
