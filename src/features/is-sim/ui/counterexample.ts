/**
 * Which devices a failed judgement names — so the canvas can mark the same
 * nodes the counterexample text calls out by id.
 */

import type { IsTopology } from "../domain/model.ts";
import type { IsCounterexample, IsJudgeResult } from "../domain/protocol.ts";

/** Per-list cap shared by the diff text and the canvas marks. */
export const COUNTEREXAMPLE_LISTED = 3;

/**
 * Node ids named by the counterexample's per-device lists, capped exactly
 * like the diff text, deduped in first-seen order. `dropped` names a link
 * rather than a culprit device, so it is left out (no causal guessing).
 */
export function counterexampleNodeIds(c: IsCounterexample): string[] {
  const lists: ReadonlyArray<ReadonlyArray<{ node: string }>> = [
    c.dbDiff,
    c.seenDiff,
    c.firedDiff,
    c.unapproved,
    c.pending,
  ];
  const ids = lists.flatMap((list) =>
    list.slice(0, COUNTEREXAMPLE_LISTED).map((item) => item.node),
  );
  return [...new Set(ids)];
}

/**
 * Identity key for "is the canvas still showing the judged topology?".
 * Sanitized topologies emit object keys in a fixed order, so equal keys
 * mean the same nodes, params and links.
 */
export function topologyKey(topology: IsTopology): string {
  return JSON.stringify(topology);
}

/**
 * Nodes to mark on the canvas: only for a failed verdict with a
 * counterexample, only while the canvas still shows the topology that
 * verdict graded (`judgedKey`), and only ids that still exist there.
 */
export function flaggedNodeIds(
  outcome: IsJudgeResult | null,
  judgedKey: string | null,
  topology: IsTopology,
): ReadonlySet<string> {
  const counterexample = outcome?.testSummary.counterexample;
  if (!outcome || outcome.passed || !counterexample || judgedKey !== topologyKey(topology)) {
    return new Set();
  }
  const present = new Set(topology.nodes.map((n) => n.id));
  return new Set(counterexampleNodeIds(counterexample).filter((id) => present.has(id)));
}
