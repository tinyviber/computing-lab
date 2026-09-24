/**
 * Reference topologies: one known-good draft per stage. The domain test
 * asserts each passes the full public + hidden sets for its stage, so a
 * case that no correct wiring can satisfy fails loudly in `bun run
 * test:run` instead of in front of a student.
 */

import type { IsNode, IsTopology } from "./model.ts";
import { getIsStage } from "./stages.ts";

const prefillNodes = (stage: number): IsNode[] => getIsStage(stage)!.prefill.nodes;

export const IS_REFERENCE: Record<number, IsTopology> = {
  // S1: scanner straight into the write port.
  1: {
    nodes: prefillNodes(1),
    links: [{ from: "scan", to: "books", port: "write" }],
  },
  // S2: both scanners merge through one gateway.
  2: {
    nodes: [
      ...prefillNodes(2),
      {
        id: "gw",
        kind: "gateway",
        label: "网关",
        x: 1,
        y: 0,
        fixed: false,
        params: { delay: 0, dropRate: 0 },
      },
    ],
    links: [
      { from: "scan-a", to: "gw", port: "a" },
      { from: "scan-b", to: "gw", port: "b" },
      { from: "gw", to: "books", port: "write" },
    ],
  },
  // S3: writes feed a receipt dashboard.
  3: {
    nodes: prefillNodes(3),
    links: [
      { from: "scan", to: "books", port: "write" },
      { from: "books", to: "desk", port: "in" },
    ],
  },
  // S4: returns detour through the librarian before deleting.
  4: {
    nodes: prefillNodes(4),
    links: [
      { from: "scan-borrow", to: "books", port: "write" },
      { from: "scan-return", to: "librarian", port: "in" },
      { from: "librarian", to: "books", port: "delete" },
    ],
  },
  // S5: threshold 60 — the prefill ships 80 on purpose.
  5: {
    nodes: prefillNodes(5).map((n) =>
      n.id === "sprinkler" ? { ...n, params: { ...n.params, threshold: 60 } } : n,
    ),
    links: [
      { from: "temp", to: "sprinkler", port: "in" },
      { from: "sprinkler", to: "board", port: "in" },
    ],
  },
  // X6: the gateway fans writes out to both dbs.
  6: {
    nodes: prefillNodes(6),
    links: [
      { from: "scan", to: "gw", port: "a" },
      { from: "gw", to: "db-main", port: "write" },
      { from: "gw", to: "db-copy", port: "write" },
    ],
  },
};
