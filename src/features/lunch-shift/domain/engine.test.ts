/**
 * Order-set and simulator properties for the lunch-shift lab. These
 * numbers are the lesson's difficulty curve — change them deliberately,
 * never silently.
 *
 *  - 修排队 set: FIFO 8/12, urgent-first 10/12, urgent + wait-boost
 *    reaches 12/12 for every threshold in 8..16 (not one magic number).
 *  - 正式集 (mirrored below): the full-marks queue formulas stay full
 *    marks with all tickets recorded right; AI ticket overrides and
 *    confirmation stalls replay deterministically.
 *  - 附加挑战: the fixed FIFO run on the rush set leaves 11 problem
 *    orders (urgent AND normal, 6 undelivered, priced by menu); the
 *    bad-review scoring makes all extreme policies fail, and the optimal
 *    3.79@70 needs half-price delivered refunds, not just lost ones.
 */

import { describe, expect, it } from "vitest";
import { priorityIndex, PRIORITY_TABLE_SIZE, checkPriorityTable } from "./priority.ts";
import { pickProbe, probeSlack, QUEUE_PROBES } from "./queueProbes.ts";
import { findFullWidthPunctuation } from "./runErrors.ts";
import { buildScenario, QUEUE_SCENARIO } from "./scenarios.ts";
import {
  bestCompensation,
  checkCompensateTable,
  COMPENSATE_PASS_REVIEWS,
  COMPENSATE_PASS_SPEND,
  COMPENSATE_TABLE_SIZE,
  compensateCost,
  compensateIndex,
  compensateLateOrders,
  evaluateCompensation,
} from "./compensate.ts";
import { simulate } from "./simulator.ts";

function tableFor(fn: (urgent: boolean, wait: number, cook: number) => number): number[] {
  const table = new Array(PRIORITY_TABLE_SIZE);
  for (const urgent of [false, true])
    for (let wait = 0; wait <= 30; wait++)
      for (const cook of [1, 3]) table[priorityIndex(urgent, wait, cook)] = fn(urgent, wait, cook);
  return table;
}

const boost = (t: number) => tableFor((u, w) => (u ? 1 : 0) + (w >= t ? 1 : 0));
/** Overwrite style — the skeleton's natural fill: urgent→1, then wait≥T→2. */
const overwrite = (t: number) => tableFor((u, w) => (w >= t ? 2 : u ? 1 : 0));

// Mirrors the hidden final set in server/judge/lunch-shift/hiddenSet.ts.
const FINAL_FIXTURES = [
  {
    request: "送到 6 号桌一份蛋炒饭，不要香菜，我不赶时间。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "6", urgent: false },
    cookTicks: 1,
    arrivalTick: 3,
  },
  {
    request: "2号桌鸡腿饭，别放香菜，这单我加急。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "2", urgent: true },
    cookTicks: 1,
    arrivalTick: 3,
  },
  {
    request: "请给 4 号桌做牛肉面，少辣，正常就好。",
    expected: { item: "牛肉面", note: "少辣", table: "4", urgent: false },
    cookTicks: 3,
    arrivalTick: 4,
  },
  {
    request: "3号桌蛋炒饭，加蛋，急着走，付费加急。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "3", urgent: true },
    cookTicks: 3,
    arrivalTick: 1,
  },
  {
    request: "1号桌鸡腿饭，不要香菜，不赶时间，慢慢做。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "1", urgent: false },
    cookTicks: 1,
    arrivalTick: 1,
  },
  {
    request: "8号桌来一份炒饭，无备注，正常做。",
    expected: { item: "蛋炒饭", note: "无备注", table: "8", urgent: false },
    cookTicks: 3,
    arrivalTick: 12,
  },
  {
    request: "7号桌牛肉面，少放点辣，不用加急。",
    expected: { item: "牛肉面", note: "少辣", table: "7", urgent: false },
    cookTicks: 3,
    arrivalTick: 1,
  },
  {
    request: "5号桌鸡腿饭，加蛋，加钱走急单。",
    expected: { item: "鸡腿饭", note: "加蛋", table: "5", urgent: true },
    cookTicks: 1,
    arrivalTick: 11,
  },
  {
    request: "6号桌牛肉面，少辣，走加急通道，我赶时间。",
    expected: { item: "牛肉面", note: "少辣", table: "6", urgent: true },
    cookTicks: 3,
    arrivalTick: 13,
  },
  {
    request: "给2号桌做牛肉面加蛋，要加急，我赶时间。",
    expected: { item: "牛肉面", note: "加蛋", table: "2", urgent: true },
    cookTicks: 1,
    arrivalTick: 1,
  },
  {
    request: "4号桌蛋炒饭，平常速度，不要催。",
    expected: { item: "蛋炒饭", note: "无备注", table: "4", urgent: false },
    cookTicks: 3,
    arrivalTick: 15,
  },
  {
    request: "8号桌鸡腿饭，不要香菜，我要加急。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "8", urgent: true },
    cookTicks: 1,
    arrivalTick: 16,
  },
];

const FINAL = buildScenario("F", FINAL_FIXTURES);

describe("修排队 probes — the layered grade", () => {
  const probeScore = (table: number[] | null) =>
    QUEUE_PROBES.filter((probe) => pickProbe(table ?? [], probe) === probe.answer).length;

  // Every probe's answer must be what the deadline rule gives: strictly
  // the smallest slack, ties settled by arrival order.
  it("each probe's answer is the min-slack pick (FIFO breaks ties)", () => {
    for (const probe of QUEUE_PROBES) {
      const slacks = probe.candidates.map(probeSlack);
      expect(slacks.indexOf(Math.min(...slacks))).toBe(probe.answer);
    }
  });

  it("naive urgent-first earns ONLY the 3 加急要快 probes", () => {
    expect(probeScore(tableFor((u) => (u ? 1 : 0)))).toBe(3);
  });

  it("FIFO earns the 9 wait probes but loses all 3 urgent ones", () => {
    expect(probeScore(tableFor(() => 0))).toBe(9);
  });

  it("wait-only likewise earns 9 and cannot pass either", () => {
    expect(probeScore(tableFor((_u, w) => w))).toBe(9);
  });

  it("the taught families ace all 12 across a range of thresholds", () => {
    for (let t = 8; t <= 12; t++) {
      expect(probeScore(boost(t)), `boost(${t})`).toBe(12);
      expect(probeScore(overwrite(t)), `overwrite(${t})`).toBe(12);
    }
    // The deadline-math forms — min slack, and min slack minus cook —
    // both agree with every probe's answer (no hidden-rule traps).
    expect(probeScore(tableFor((u, w) => w - (u ? 9 : 18)))).toBe(12);
    expect(probeScore(tableFor((u, w, c) => w - c - (u ? 9 : 18)))).toBe(12);
  });

  it("a wait threshold past the contested orders collapses like naive urgent-first", () => {
    expect(probeScore(boost(13))).toBe(9);
    expect(probeScore(boost(15))).toBe(3);
    expect(probeScore(overwrite(15))).toBe(3);
  });

  // The rule's contract: every expected winner could still be delivered
  // on time if the kitchen starts it now (wait + cook + delivery < deadline).
  it("every expected winner is still savable", () => {
    for (const probe of QUEUE_PROBES) {
      const winner = probe.candidates[probe.answer];
      const limit = winner.urgent ? 9 : 18;
      expect(winner.wait + winner.cook + 2, probe.id).toBeLessThan(limit);
    }
  });
});

describe("修排队 preview round", () => {
  // The 12-order scenario stays as the panel's sandbox preview — it no
  // longer gates the pass, but it should still show the same dynamics.
  it("FIFO delivers 8/12 on time", () => {
    expect(simulate(QUEUE_SCENARIO, { priority: null }).result.onTime).toBe(8);
  });

  it("urgent-first delivers 11/12 on time — one normal order starves", () => {
    const run = simulate(QUEUE_SCENARIO, { priority: tableFor((u) => (u ? 1 : 0)) }).result;
    expect(run.onTime).toBe(11);
    expect(run.orders.filter((order) => !order.onTime).map((order) => order.id)).toEqual(["Q07"]);
  });

  it("urgent + wait-boost reaches 12/12 for every threshold 8..16", () => {
    for (let t = 8; t <= 16; t++) {
      expect(simulate(QUEUE_SCENARIO, { priority: boost(t) }).result.onTime).toBe(12);
    }
  });
});

describe("正式集 (mirrored hidden set)", () => {
  // No ticket override → intake records the expected ticket — the same
  // baseline the queue set uses, so queue formulas transfer 1:1.
  it("all tickets recorded right + full-marks queue = 12/12 on time (24/24)", () => {
    const run = simulate(FINAL, { priority: boost(10) }).result;
    expect(run.correct).toBe(12);
    expect(run.onTime).toBe(12);
  });

  it("the full-marks queue formula stays full marks on the final set", () => {
    for (const t of [8, 10, 12]) {
      const run = simulate(FINAL, { priority: boost(t) }).result;
      expect(run.onTime).toBe(12);
    }
  });

  it("the overwrite style also reaches 12/12 on the final set for T 8..16", () => {
    for (let t = 8; t <= 16; t++) {
      const run = simulate(FINAL, { priority: overwrite(t) }).result;
      expect(run.onTime).toBe(12);
    }
  });

  it("urgent-first alone is NOT full marks on the final set either", () => {
    // Stage-4 must keep the starvation lesson: solving it in stage 3 pays off.
    const run = simulate(FINAL, {
      priority: tableFor((u) => (u ? 1 : 0)),
    }).result;
    expect(run.onTime).toBe(11);
  });
});

describe("智能接单 sim mechanics", () => {
  // The judge replays normalized AI rows: submitted ticket per order,
  // confirmed orders swapped to the expected ticket + a one-tick stall.
  const allCorrect = () => new Map(FINAL.orders.map((order) => [order.id, order.expected!]));

  it("a submitted ticket overrides intake — an AI miss records wrong", () => {
    const tickets = allCorrect();
    tickets.set("F11", { item: "蛋炒饭", note: "少辣", table: "4", urgent: false });
    const run = simulate(FINAL, { tickets, priority: boost(10) }).result;
    expect(run.correct).toBe(11);
    expect(run.orders.find((order) => order.id === "F11")?.correct).toBe(false);
  });

  it("an order missing from the tickets map records nothing", () => {
    const tickets = allCorrect();
    tickets.delete("F03");
    const run = simulate(FINAL, { tickets, priority: boost(10) }).result;
    expect(run.orders.find((order) => order.id === "F03")?.correct).toBe(false);
    expect(run.correct).toBe(11);
  });

  it("a confirmed order spends one intake slot restating, then lands right", () => {
    const ticketTickOf = (run: ReturnType<typeof simulate>, id: string) =>
      (run.result.events ?? []).find((e) => e.action === "ticket" && e.orderId === id)!.tick;
    const baseline = simulate(FINAL, { tickets: allCorrect(), priority: boost(10) });
    const sim = simulate(FINAL, {
      tickets: allCorrect(),
      confirmStalls: new Set(["F01"]),
      priority: boost(10),
    });
    const held = (sim.result.events ?? []).filter((e) => e.action === "held");
    // Only F01 pays the restatement — exactly one intake slot.
    expect(held.map((e) => e.orderId)).toEqual(["F01"]);
    // Its ticket lands one tick later than it would have.
    expect(ticketTickOf(sim, "F01")).toBe(ticketTickOf(baseline, "F01") + 1);
    expect(sim.result.orders.find((order) => order.id === "F01")?.correct).toBe(true);
    expect(sim.result.correct).toBe(12);
  });
});

describe("compensate (附加挑战)", () => {
  // The fixed run everyone pays for — same as the judge: plain FIFO on
  // the 20-order rush set leaves 11 orders late or undelivered.
  const late = compensateLateOrders();

  const compensateTableFor = (
    fn: (urgent: boolean, overtime: number, delivered: boolean, price: number) => number,
  ): number[] => {
    const table = new Array(COMPENSATE_TABLE_SIZE).fill(0);
    for (const u of [false, true])
      for (let o = 0; o <= 30; o++)
        for (const d of [false, true])
          for (let p = 0; p <= 30; p++) table[compensateIndex(u, o, d, p)] = fn(u, o, d, p);
    return table;
  };

  it("the first-come-first-served run leaves 11 problem orders, urgent included", () => {
    expect(late).toHaveLength(11);
    expect(late.filter((o) => o.urgent)).toHaveLength(8);
    expect(late.filter((o) => !o.delivered)).toHaveLength(6);
    expect(late.filter((o) => !o.urgent && !o.delivered)).toHaveLength(3);
    expect(late.filter((o) => o.delivered).map((o) => o.id)).toEqual([
      "R06",
      "R08",
      "R10",
      "R12",
      "R14",
    ]);
    // Every order carries its menu price — 蛋炒饭 is cheap to refund.
    expect(late.find((o) => o.id === "R19")?.price).toBe(12);
    expect(late.find((o) => o.id === "R17")?.price).toBe(22);
  });

  it("checkCompensateTable bounds the 3844-cell shape and 0/1/2 values", () => {
    expect(checkCompensateTable(new Array(COMPENSATE_TABLE_SIZE).fill(0)).table).not.toBeNull();
    expect(checkCompensateTable(new Array(124).fill(0)).table).toBeNull();
    const bad = new Array(COMPENSATE_TABLE_SIZE).fill(0);
    bad[10] = 3;
    const { errors } = checkCompensateTable(bad);
    expect(errors[0]).toContain("只能返回 0、1 或 2");
    expect(checkCompensateTable(bad).table).toBeNull();
  });

  it("a refund costs the order's own price — half delivered, full lost", () => {
    expect(compensateCost(true, 12, 2)).toBe(6);
    expect(compensateCost(true, 22, 2)).toBe(11);
    expect(compensateCost(false, 12, 2)).toBe(12);
    expect(compensateCost(false, 22, 2)).toBe(22);
    expect(compensateCost(false, 22, 1)).toBe(2);
    expect(compensateCost(false, 22, 0)).toBe(0);
  });

  it("all three extreme policies fail on different lines — the trade-off is real", () => {
    const none = evaluateCompensation(
      late,
      compensateTableFor(() => 0),
    );
    const snacks = evaluateCompensation(
      late,
      compensateTableFor(() => 1),
    );
    const refunds = evaluateCompensation(
      late,
      compensateTableFor(() => 2),
    );
    expect(none.badReviewPoints).toBe(860); // 8.60 expected bad reviews
    expect(snacks.badReviewPoints).toBe(580); // still over the 4.00 line
    expect(refunds.badReviewPoints).toBe(212); // lowest reviews…
    expect(refunds.spend).toBe(142); // …but way over the 70 元 budget
    for (const bill of [none, snacks, refunds]) {
      expect(
        bill.badReviewPoints <= COMPENSATE_PASS_REVIEWS && bill.spend <= COMPENSATE_PASS_SPEND,
      ).toBe(false);
    }
  });

  it("refunding every undelivered order breaks the budget at any risk mix", () => {
    // Full refunds on all 6 lost orders already cost 100 元.
    const blind = evaluateCompensation(
      late,
      compensateTableFor((_u, _o, d) => (d ? 1 : 2)),
    );
    expect(blind.spend).toBe(110);
    expect(blind.spend).toBeGreaterThan(COMPENSATE_PASS_SPEND);
  });

  it("ignoring delivered refunds misses the line by one point", () => {
    // Refund cheap undelivered + every delivered overtime ≥6, snack the
    // rest — 4.01 reviews, one point over. Half-price delivered refunds
    // are cheap; the pass needs them.
    const near = evaluateCompensation(
      late,
      compensateTableFor((_u, o, d, p) => ((!d && p <= 12) || (d && o >= 6) ? 2 : 1)),
    );
    expect(near.badReviewPoints).toBe(401);
    expect(near.badReviewPoints).toBeGreaterThan(COMPENSATE_PASS_REVIEWS);
    expect(near.spend).toBeLessThanOrEqual(COMPENSATE_PASS_SPEND);
  });

  it("the optimal rule is reachable and passes on the dot", () => {
    // Refund cheap (≤12) undelivered + every urgent delivered late ≥4
    // ticks — refunding a delivered order is half price, so expensive
    // looking delivered orders still pay off.
    const sharp = evaluateCompensation(
      late,
      compensateTableFor((u, o, d, p) => ((!d && p <= 12) || (d && u && o >= 4) ? 2 : 1)),
    );
    expect(sharp.badReviewPoints).toBe(379);
    expect(sharp.spend).toBe(70);
    expect(
      sharp.badReviewPoints <= COMPENSATE_PASS_REVIEWS && sharp.spend <= COMPENSATE_PASS_SPEND,
    ).toBe(true);
  });

  it("the best bill inside the spend cap is locked", () => {
    const best = bestCompensation(late);
    expect(best.badReviewPoints).toBe(379); // 3.79 expected bad reviews
    expect(best.spend).toBe(70);
  });

  it("best compensation must choose one tier per input, not per order", () => {
    // Two identical (normal, 0, undelivered, 16 元) orders share one table
    // cell: a student function can snack both or refund both, never split.
    const orders = [
      { id: "A", urgent: false, overtime: 0, delivered: false, price: 16 },
      { id: "B", urgent: false, overtime: 0, delivered: false, price: 16 },
    ];
    expect(bestCompensation(orders, 15)).toEqual({
      badReviewPoints: 120, // snack both: 60% × 2 — refunding both costs 32
      spend: 4,
    });
  });
});

describe("priority table validation", () => {
  it("accepts exactly 124 finite numbers", () => {
    expect(checkPriorityTable(new Array(124).fill(0)).table).not.toBeNull();
  });

  it("rejects wrong length and non-finite values", () => {
    expect(checkPriorityTable(new Array(5).fill(0)).table).toBeNull();
    const bad = new Array(124).fill(0);
    bad[7] = Number.NaN;
    const { errors } = checkPriorityTable(bad);
    expect(errors[0]).toContain("第 8 个值");
    expect(checkPriorityTable([...new Array(123).fill(0), Infinity]).table).toBeNull();
    expect(checkPriorityTable([...new Array(123).fill(0), "1"]).table).toBeNull();
  });
});

describe("full-width punctuation scan", () => {
  it("flags punctuation in code but skips strings and comments", () => {
    const code = 'x = {"别急": "别急"}  # 注释里：中文标点没事\ny：= 1';
    const hits = findFullWidthPunctuation(code);
    expect(hits).toEqual([{ line: 2, ch: "：" }]);
  });

  it("accepts the starter code with Chinese words inside strings", () => {
    const code = `dish_words = {"鸡腿饭": "鸡腿饭", "蛋炒饭": "蛋炒饭"}\ncalm_words = ["不赶时间", "不急着"]`;
    expect(findFullWidthPunctuation(code)).toEqual([]);
  });
});
