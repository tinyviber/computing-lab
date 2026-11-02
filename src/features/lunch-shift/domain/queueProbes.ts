/**
 * Stage-3 grading probes — the layered test points for 修排队.
 *
 * Grading a single simulated round lets `return 1 if urgent else 0`
 * coast: a normal order's 18-tick window is so wide that urgent-first
 * almost always saves it anyway. So the grade is instead a battery of
 * 12 crafted queue snapshots — each probe shows a queue state (the
 * candidates listed in arrival order) and asks "who should the kitchen
 * start next?".
 *
 * The right answer is the restaurant's own rule, stated verbatim in
 * the stage task so nothing is hidden: smallest remaining slack
 * (deadline − wait: 9 urgent, 18 normal) goes first, ties keep arrival
 * order. Two guardrails keep every answer unambiguous:
 *
 *  - Every expected winner is still savable: slack > cook + delivery
 *    (2 ticks), so "this order is already doomed, save the other one"
 *    never beats the stated rule.
 *  - Every probe's answer also agrees with the cook-aware version of
 *    the same rule (deadline − wait − cook), so a student who reasons
 *    about remaining work can't lose to a technicality.
 *
 * Calibration (locked by engine.test.ts): a single-axis naive table
 * only earns the layer matching it — urgent-first gets exactly the 3
 * "urgent jumps" probes, FIFO/wait-only get the 9 wait probes but lose
 * all 3 urgent ones — so passing (QUEUE_PASS) genuinely needs both
 * inputs together.
 */

import { priorityValue } from "./priority.ts";

export type ProbeCandidate = { urgent: boolean; wait: number; cook: 1 | 3 };

export type QueueProbe = {
  id: string;
  /** The situation the student reads, e.g. 「一张等了很久的普通单」. */
  title: string;
  /** Candidates in arrival order — the sim's FIFO tie order. */
  candidates: ProbeCandidate[];
  /** Index of the candidate the kitchen should start first. */
  answer: number;
};

const N = (wait: number, cook: 1 | 3 = 3): ProbeCandidate => ({ urgent: false, wait, cook });
const U = (wait: number, cook: 1 | 3 = 3): ProbeCandidate => ({ urgent: true, wait, cook });

/** Remaining ticks before the order times out — the pick rule. */
export function probeSlack(candidate: ProbeCandidate): number {
  return (candidate.urgent ? 9 : 18) - candidate.wait;
}

export const QUEUE_PROBES: QueueProbe[] = [
  // —— 加急要快：刚到的加急单应该插到在等的普通单前面 ——
  {
    id: "K1",
    title: "普通单等了 3 拍，加急单刚到",
    candidates: [N(3), U(1)],
    answer: 1, // slack 15 vs 8
  },
  {
    id: "K2",
    title: "普通单等了 5 拍，加急单刚到",
    candidates: [N(5, 1), U(0)],
    answer: 1, // 13 vs 9
  },
  {
    id: "K3",
    title: "两张普通单在等，加急单刚到",
    candidates: [N(4, 1), U(2, 1), N(1)],
    answer: 1, // 14 vs 7 vs 17
  },
  // —— 等得久的先救：快到期的普通单比刚到的加急单更等不起 ——
  {
    id: "K4",
    title: "普通单等了 12 拍做 3 拍的菜，加急单刚到",
    candidates: [N(12), U(0, 1)],
    answer: 0, // 6 vs 9
  },
  {
    id: "K5",
    title: "普通单等了 14 拍，加急单刚到",
    candidates: [N(14, 1), U(1)],
    answer: 0, // 4 vs 8
  },
  {
    id: "K6",
    title: "普通单等了 14 拍，加急单也等了 4 拍",
    candidates: [N(14, 1), U(4, 1)],
    answer: 0, // 4 vs 5 — the near-tie
  },
  {
    id: "K7",
    title: "普通单等了 12 拍，加急单刚到，又一张普通单",
    candidates: [N(12, 1), U(0, 1), N(2)],
    answer: 0, // 6 vs 9 vs 16
  },
  {
    id: "K8",
    title: "普通单等了 13 拍，加急单等了 2 拍，又来一张普通单",
    candidates: [N(13, 1), U(2), N(4, 1)],
    answer: 0, // 5 vs 7 vs 14
  },
  {
    id: "K9",
    title: "普通单等了 13 拍，加急单也等了 3 拍",
    candidates: [N(13, 1), U(3, 1)],
    answer: 0, // 5 vs 6
  },
  {
    id: "K10",
    title: "普通单等了 14 拍，加急单刚到，还有张普通单在等",
    candidates: [N(14, 1), U(0), N(8)],
    answer: 0, // 4 vs 9 vs 10
  },
  {
    id: "K11",
    title: "等了 12 拍的普通单、刚到的加急单、一张普通单",
    candidates: [N(12), U(1, 1), N(10, 1)],
    answer: 0, // 6 vs 8 vs 8
  },
  {
    id: "K12",
    title: "普通单和加急单剩下的时间一样多",
    candidates: [N(14, 1), U(5, 1)],
    answer: 0, // 4 vs 4 — tie keeps the earlier arrival
  },
];

/** Which candidate the student's table picks — the sim's choose()
 *  rule: largest value wins, ties keep the earlier (FIFO) candidate. */
export function pickProbe(table: readonly number[], probe: QueueProbe): number {
  let best = 0;
  let bestValue = priorityValue(
    table,
    probe.candidates[0].urgent,
    probe.candidates[0].wait,
    probe.candidates[0].cook,
  );
  for (let index = 1; index < probe.candidates.length; index++) {
    const candidate = probe.candidates[index];
    const value = priorityValue(table, candidate.urgent, candidate.wait, candidate.cook);
    if (value > bestValue) {
      best = index;
      bestValue = value;
    }
  }
  return best;
}
