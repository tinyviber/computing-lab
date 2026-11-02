/**
 * The graded final-order set — server-only. Students never receive these
 * requests or expected tickets; the judge runs them and returns only
 * per-order correctness counts.
 *
 * Trap layout (mirrored in engine.test.ts): a tables set built by adding
 * the practice misses literally (不放香菜 / 别太辣 / 付费 / 不用加急 /
 * 炒饭) still misses F02 (别放香菜), F07 (少放点辣) and F08 (加钱走急单 —
 * the paid-express idea in words the tables never listed) — generic words
 * (放香菜 / 辣 / 急单) catch every one.
 * Queue shape: BOTH stage-3 scoring styles reach 12/12 for T in 8..16,
 * while plain FIFO only delivers 8 — a full-marks function stays full.
 */

import {
  buildScenario,
  type FixtureOrder,
} from "../../../src/features/lunch-shift/domain/scenarios.ts";

export const FINAL_FIXTURES: FixtureOrder[] = [
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

export const FINAL_SCENARIO = buildScenario("F", FINAL_FIXTURES);

/**
 * The stage-4 intake view of the final set: ids and customer wording
 * only — the browser's AI needs the raw sentences to predict tickets,
 * but expected tickets, arrival/cook shape and everything else stays
 * server-side. Shipped only once the stage is unlocked (see
 * projectExtras), and even then the student's Python only ever sees
 * (similarity, margin) numbers.
 */
export const FINAL_PUBLIC_ORDERS = FINAL_SCENARIO.orders.map((order) => ({
  id: order.id,
  request: order.request,
}));
