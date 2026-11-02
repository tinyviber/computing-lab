/**
 * The deterministic tick simulation. One synchronous pass over the round:
 * orders arrive, intake writes tickets, the stove cooks one at a time, the
 * runner delivers. Three knobs plug in:
 *
 *   - tickets: a map overriding what intake records per order (the AI
 *     intake's predicted/confirmed tickets). When absent the order's
 *     expected ticket is recorded as-is — 修排队 starts from 小票已录对.
 *   - confirmStalls: ids whose ticket lands one intake slot late — the
 *     再确认一次 cost on the AI stages.
 *   - priority table: at every ≥2-candidate queue decision, pick the
 *     candidate with the largest table value; equal values keep the
 *     first-come-first-served order. When absent, plain FIFO.
 */

import {
  DISHES,
  NOTES,
  TABLES,
  type Candidate,
  type OrderResult,
  type QueuePick,
  type Scenario,
  type ScenarioOrder,
  type SimulationEvent,
  type SimulationRun,
  type Ticket,
} from "./contracts.ts";
import { priorityValue } from "./priority.ts";

export type SimConfig = {
  /** 124-cell priority table; null/absent = first-come-first-served. */
  priority?: readonly number[] | null;
  /**
   * Per-order ticket override for the AI intake stage: intake records
   * this map's ticket instead of parsing the request (or the expected
   * one). Orders missing from the map record nothing.
   */
  tickets?: ReadonlyMap<string, Ticket | null>;
  /**
   * Orders whose intake stalls for one extra slot — the customer is
   * restating (AI confirmation). The stall consumes the intake slot;
   * the ticket lands on the next pass.
   */
  confirmStalls?: ReadonlySet<string>;
};

/** Drops the hidden expected tickets before a scenario leaves the server. */
export function publicScenario(scenario: Scenario): Scenario {
  return {
    id: scenario.id,
    totalTicks: scenario.totalTicks,
    deliveryTicks: scenario.deliveryTicks,
    orders: scenario.orders.map(({ id, request, arrivalTick, cookTicks }) => ({
      id,
      request,
      arrivalTick,
      cookTicks,
    })),
  };
}

type RuntimeOrder = {
  source: ScenarioOrder;
  ticket: Ticket | null;
  receivedTick: number;
  cookStartTick: number;
  readyTick: number;
  deliveredTick: number;
  /** The one-tick confirm stall has already been spent. */
  stalled: boolean;
};

type CookingSlot = { order: RuntimeOrder; doneTick: number };

function fifoQueue(queue: RuntimeOrder[]): RuntimeOrder[] {
  return queue
    .slice()
    .sort(
      (a, b) =>
        a.source.arrivalTick - b.source.arrivalTick || a.source.id.localeCompare(b.source.id),
    );
}

function deadlineFor(order: ScenarioOrder, scenario: Scenario): number {
  const ratio = order.expected?.urgent ? 0.3 : 0.6;
  return Math.trunc(scenario.totalTicks * ratio);
}

function candidateFor(order: RuntimeOrder, tick: number, scenario: Scenario): Candidate {
  const ticket = order.ticket ?? { item: "", note: "", table: "", urgent: false };
  return {
    id: order.source.id,
    item: ticket.item,
    note: ticket.note,
    table: ticket.table,
    urgent: ticket.urgent,
    request: order.source.request,
    arrivalTick: order.source.arrivalTick,
    readyTick: order.readyTick === 0 ? null : order.readyTick,
    waitTicks: Math.max(0, tick - order.source.arrivalTick),
    cookTicks: order.source.cookTicks,
    deadline: deadlineFor(order.source, scenario),
  };
}

function maxInt(a: number, b: number): number {
  return a > b ? a : b;
}

function isRecordableTicket(value: unknown): value is Ticket {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const ticket = value as Record<string, unknown>;
  return (
    typeof ticket.item === "string" &&
    (DISHES as readonly string[]).includes(ticket.item) &&
    typeof ticket.note === "string" &&
    (NOTES as readonly string[]).includes(ticket.note) &&
    typeof ticket.table === "string" &&
    (TABLES as readonly string[]).includes(ticket.table) &&
    typeof ticket.urgent === "boolean"
  );
}

function removeOrder(queue: RuntimeOrder[], target: RuntimeOrder): RuntimeOrder[] {
  const index = queue.indexOf(target);
  return index < 0 ? queue : [...queue.slice(0, index), ...queue.slice(index + 1)];
}

/** Replays one round; the config supplies intake tables and queue picks. */
export function simulate(
  scenario: Scenario,
  config: SimConfig = {},
  stoves = 1,
  intakePerTick = 1,
): SimulationRun {
  const priority = config.priority ?? null;
  const runtime = scenario.orders
    .slice()
    .sort((a, b) => a.arrivalTick - b.arrivalTick || a.id.localeCompare(b.id))
    .map<RuntimeOrder>((source) => ({
      source,
      ticket: null,
      receivedTick: 0,
      cookStartTick: 0,
      readyTick: 0,
      deliveredTick: 0,
      stalled: false,
    }));
  let inbox: RuntimeOrder[] = [];
  let kitchen: RuntimeOrder[] = [];
  let ready: RuntimeOrder[] = [];
  let cooking: CookingSlot[] = [];
  const events: SimulationEvent[] = [];
  const picks: QueuePick[] = [];
  let nextArrival = 0;
  let runnerAvailableTick = 0;

  const choose = (queue: RuntimeOrder[], stage: "kitchen" | "delivery", tick: number) => {
    const ordered = fifoQueue(queue);
    if (ordered.length < 2) return ordered[0];
    const candidates = ordered.map((order) => candidateFor(order, tick, scenario));
    const withValues = candidates.map((candidate) => ({
      candidate,
      value:
        priority === null
          ? null
          : priorityValue(priority, candidate.urgent, candidate.waitTicks, candidate.cookTicks),
    }));
    let best = withValues[0];
    if (priority !== null) {
      for (const entry of withValues) {
        // Strictly greater wins; ties keep the earlier (FIFO) candidate.
        if ((entry.value ?? 0) > (best.value ?? 0)) best = entry;
      }
    }
    picks.push({
      tick,
      stage,
      picked: best.candidate.id,
      candidates: withValues.map((entry) => ({
        id: entry.candidate.id,
        urgent: entry.candidate.urgent,
        waitTicks: entry.candidate.waitTicks,
        cookTicks: entry.candidate.cookTicks,
        value: entry.value,
      })),
    });
    const match = ordered.find((order) => order.source.id === best.candidate.id);
    return match ?? ordered[0];
  };

  for (let tick = 1; tick <= scenario.totalTicks; tick++) {
    while (nextArrival < runtime.length && runtime[nextArrival].source.arrivalTick <= tick) {
      const order = runtime[nextArrival];
      inbox.push(order);
      events.push({ tick, stage: "intake", orderId: order.source.id, action: "arrive" });
      nextArrival++;
    }

    const finished: CookingSlot[] = [];
    for (const slot of cooking) {
      if (slot.doneTick <= tick) {
        slot.order.readyTick = tick;
        ready.push(slot.order);
        events.push({ tick, stage: "kitchen", orderId: slot.order.source.id, action: "ready" });
      } else {
        finished.push(slot);
      }
    }
    cooking = finished;

    for (let processed = 0; inbox.length > 0 && processed < intakePerTick; processed++) {
      const order = fifoQueue(inbox)[0];
      inbox = removeOrder(inbox, order);
      // A confirmed order spends this intake slot on the customer's
      // restatement — the ticket lands next pass.
      if (config.confirmStalls?.has(order.source.id) && !order.stalled) {
        order.stalled = true;
        inbox.push(order);
        events.push({ tick, stage: "intake", orderId: order.source.id, action: "held" });
        continue;
      }
      // A ticket override decides what intake records (AI intake); a
      // missing entry records nothing. Without overrides the stage runs
      // 小票已录对 — the expected ticket is recorded.
      const output = config.tickets
        ? (config.tickets.get(order.source.id) ?? null)
        : (order.source.expected ?? null);
      if (isRecordableTicket(output)) order.ticket = output;
      order.receivedTick = tick;
      kitchen.push(order);
      events.push({ tick, stage: "intake", orderId: order.source.id, action: "ticket" });
    }

    while (cooking.length < stoves && kitchen.length > 0) {
      const order = choose(kitchen, "kitchen", tick);
      kitchen = removeOrder(kitchen, order);
      order.cookStartTick = tick;
      const cookTicks = maxInt(1, order.source.cookTicks);
      cooking.push({ order, doneTick: tick + cookTicks });
      events.push({ tick, stage: "kitchen", orderId: order.source.id, action: "cook" });
    }

    if (ready.length > 0 && tick >= runnerAvailableTick) {
      const order = choose(ready, "delivery", tick);
      ready = removeOrder(ready, order);
      order.deliveredTick = tick;
      runnerAvailableTick = tick + maxInt(1, scenario.deliveryTicks);
      events.push({ tick, stage: "delivery", orderId: order.source.id, action: "send" });
    }
  }

  const hasExpected = runtime.every((order) => order.source.expected != null);
  const orders: OrderResult[] = [];
  let deliveredCount = 0;
  let onTimeCount = 0;
  let correctCount = 0;
  for (const order of runtime) {
    const delivered = order.deliveredTick !== 0;
    const wait = delivered
      ? maxInt(0, order.deliveredTick - order.source.arrivalTick)
      : maxInt(0, scenario.totalTicks - order.source.arrivalTick + 1);
    const correct =
      order.source.expected != null
        ? order.ticket != null &&
          order.ticket.item === order.source.expected.item &&
          order.ticket.note === order.source.expected.note &&
          order.ticket.table === order.source.expected.table &&
          order.ticket.urgent === order.source.expected.urgent
        : null;
    const urgent = order.source.expected?.urgent ?? false;
    const waitTarget = Math.max(1, scenario.totalTicks * (urgent ? 0.3 : 0.6));
    const onTime = delivered && wait < waitTarget;
    orders.push({
      id: order.source.id,
      request: order.source.request,
      correct,
      delivered,
      onTime,
      wait,
      item: order.ticket?.item ?? "",
      note: order.ticket?.note ?? "",
      table: order.ticket?.table ?? "",
      urgent: order.ticket?.urgent ?? false,
      expected: order.source.expected,
    });
    if (delivered) deliveredCount++;
    if (onTime) onTimeCount++;
    if (correct === true) correctCount++;
  }
  return {
    result: {
      correct: hasExpected ? correctCount : 0,
      delivered: deliveredCount,
      onTime: onTimeCount,
      orders,
      events,
      picks,
    },
  };
}
