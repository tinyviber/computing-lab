/**
 * Stage-3 grading probes — the layered test points for 修排队.
 *
 * Grading a single simulated round lets `return 1 if urgent else 0`
 * coast: a normal order's 18-tick window is so wide that urgent-first
 * almost always saves it anyway. So the grade is instead a battery of
 * 12 crafted queue snapshots — each probe shows a queue state (the
 * candidates listed in arrival order) and asks "who should the kitchen
 * start next?". The answer follows the restaurant's own rule — 加急单
 * 等满 9 拍、普通单等满 18 拍就算超时, so the order with the smallest
 * remaining slack (deadline − wait) goes first, ties keep arrival
 * order — and contested probes keep a ≥1-tick slack margin so every
 * reasonable function family agrees.
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
    title: "普通单已经等了 16 拍，加急单刚到",
    candidates: [N(16), U(0, 1)],
    answer: 0, // 2 vs 9
  },
  {
    id: "K5",
    title: "普通单等了 15 拍，加急单刚到",
    candidates: [N(15, 1), U(1)],
    answer: 0, // 3 vs 8
  },
  {
    id: "K6",
    title: "普通单就差 1 拍超时，加急单等了 4 拍",
    candidates: [N(17), U(4, 1)],
    answer: 0, // 1 vs 5
  },
  {
    id: "K7",
    title: "普通单等了 14 拍，加急单刚到",
    candidates: [N(14), U(0, 1)],
    answer: 0, // 4 vs 9
  },
  {
    id: "K8",
    title: "普通单等了 15 拍，加急单等了 2 拍，又来一张普通单",
    candidates: [N(15, 1), U(2), N(4, 1)],
    answer: 0, // 3 vs 7 vs 14
  },
  {
    id: "K9",
    title: "普通单等了 16 拍，加急单也等了 6 拍",
    candidates: [N(16, 1), U(6)],
    answer: 0, // 2 vs 3
  },
  {
    id: "K10",
    title: "普通单等了 15 拍，加急单刚到，还有张普通单在等",
    candidates: [N(15, 1), U(0), N(7)],
    answer: 0, // 3 vs 9 vs 11
  },
  {
    id: "K11",
    title: "快超时的普通单、刚到的加急单、一张普通单",
    candidates: [N(16), U(1, 1), N(10, 1)],
    answer: 0, // 2 vs 8 vs 8
  },
  {
    id: "K12",
    title: "普通单和加急单剩下的时间一样多",
    candidates: [N(15), U(6)],
    answer: 0, // 3 vs 3 — tie keeps the earlier arrival
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
