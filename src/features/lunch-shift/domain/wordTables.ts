/**
 * Intake word tables — the data the student edits in stage 2 (修接单).
 *
 * The student's Python code only defines four variables; the browser
 * serializes them to JSON and the fixed parser below (shared by the page
 * and the server judge) does the actual reading:
 *
 *   dish_words: {原话里的词: 菜品}  — checked in insertion order, first key
 *                                   found in the request decides the dish;
 *                                   the value must be a menu dish.
 *   note_words: {原话里的词: 备注}  — same rule; no hit writes 「无备注」.
 *   calm_words / rush_words:      — word lists. Calm is checked FIRST: any
 *                                   hit means a normal order; otherwise any
 *                                   rush hit marks it urgent; neither means
 *                                   normal.
 *   桌号 is read by the fixed program (「N号桌」「N 号桌」「桌 N」「桌号 N」
 *   all count) — no word table to tune.
 *
 * The exercise is deliberately mechanical: six public orders with their
 * expected tickets are printed on the panel, and the starter code ships
 * with "____" placeholders the student copies the right words into. The
 * lesson is writing {key: value} dicts and [a, b] lists by hand — not
 * discovering unstated vocabulary.
 */

import { DISHES, NOTES, sameTicket, type Ticket } from "./contracts.ts";
import type { IntakeOrderResult } from "./protocol.ts";

export type WordPair = [string, string];

export type IntakeTables = {
  dish: WordPair[];
  note: WordPair[];
  calm: string[];
  rush: string[];
};

/** Per-table caps — bound memory and keep the submitted payload small. */
export const MAX_WORDS_PER_TABLE = 20;
export const MAX_WORD_RUNES = 10;

/**
 * The starter's unfilled placeholder. Blank entries are dropped silently
 * (not errors) so a half-finished run still produces tickets — the
 * resulting field-level misses are what guides the remaining fills.
 */
export const WORD_BLANK = "____";

function isBlank(raw: unknown): boolean {
  return typeof raw === "string" && raw.trim() === WORD_BLANK;
}

function runeLength(text: string): number {
  return [...text].length;
}

/**
 * The six stage-2 orders — public, expected tickets printed on the
 * panel. Between them they need every blank in the starter code:
 * 「炒饭」→蛋炒饭 and 「牛肉面」→牛肉面 (W2/W3/W5/W6), 「不放香菜」→不要香菜
 * and 「加蛋」→加蛋 (W3/W4), 「急着」 in rush_words (W3), and its
 * counterweight 「不急着」 in calm_words (W4). W1 and the 无备注/平常速度
 * orders show what already works. Ids sort with the other sets (P/Q/F/R).
 */
export const WORD_TABLE_ORDERS: { id: string; request: string; expected: Ticket }[] = [
  {
    id: "W1",
    request: "麻烦送到 3 号桌，一份鸡腿饭，不要香菜。我赶时间，这单要加急。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "3", urgent: true },
  },
  {
    id: "W2",
    request: "5号桌要牛肉面，少辣；我不赶时间，正常做就好。",
    expected: { item: "牛肉面", note: "少辣", table: "5", urgent: false },
  },
  {
    id: "W3",
    request: "请给 6 号桌做炒饭，加蛋，这单急着走。",
    expected: { item: "蛋炒饭", note: "加蛋", table: "6", urgent: true },
  },
  {
    id: "W4",
    request: "2号桌一份鸡腿饭，不放香菜，不急着吃。",
    expected: { item: "鸡腿饭", note: "不要香菜", table: "2", urgent: false },
  },
  {
    id: "W5",
    request: "4号桌牛肉面，无备注，这单付费加急。",
    expected: { item: "牛肉面", note: "无备注", table: "4", urgent: true },
  },
  {
    id: "W6",
    request: "1号桌蛋炒饭，不要香菜，平常速度就好。",
    expected: { item: "蛋炒饭", note: "不要香菜", table: "1", urgent: false },
  },
];

/** The starter tables — exactly what the starter Python code defines,
 *  blanks included (checkIntakeTables drops them). */
export function defaultIntakeTables(): IntakeTables {
  return {
    dish: [
      ["鸡腿饭", "鸡腿饭"],
      ["炒饭", WORD_BLANK],
      ["牛肉面", WORD_BLANK],
    ],
    note: [
      ["不要香菜", "不要香菜"],
      ["少辣", "少辣"],
      ["不放香菜", WORD_BLANK],
      ["加蛋", WORD_BLANK],
    ],
    calm: ["不赶时间", WORD_BLANK],
    rush: ["加急", "赶时间", WORD_BLANK],
  };
}

const TABLE_SUFFIX_PATTERN = /([1-8])\s*号桌/;
const TABLE_PREFIX_PATTERN = /(?:桌号|桌)\s*([1-8])/;

/** Fixed table-number reader — deliberately not part of the word tables. */
export function readTable(request: string): string {
  const suffix = TABLE_SUFFIX_PATTERN.exec(request);
  const prefix = TABLE_PREFIX_PATTERN.exec(request);
  if (suffix && (!prefix || suffix.index <= prefix.index)) return suffix[1];
  if (prefix) return prefix[1];
  return "";
}

export function parseTicket(request: string, tables: IntakeTables): Ticket {
  const ticket: Ticket = { item: "", note: "无备注", table: readTable(request), urgent: false };
  for (const [key, value] of tables.dish) {
    if (key !== "" && request.includes(key)) {
      ticket.item = value;
      break;
    }
  }
  for (const [key, value] of tables.note) {
    if (key !== "" && request.includes(key)) {
      ticket.note = value;
      break;
    }
  }
  if (tables.calm.some((word) => word !== "" && request.includes(word))) {
    ticket.urgent = false;
  } else {
    ticket.urgent = tables.rush.some((word) => word !== "" && request.includes(word));
  }
  return ticket;
}

/** Per-field attribution for the result page: which word decided what. */
export type TicketTrace = {
  ticket: Ticket;
  item: { key: string | null };
  note: { key: string | null };
  urgent: { via: "calm" | "rush" | "none"; key: string | null };
};

export function traceTicket(request: string, tables: IntakeTables): TicketTrace {
  const ticket = parseTicket(request, tables);
  const trace: TicketTrace = {
    ticket,
    item: { key: null },
    note: { key: null },
    urgent: { via: "none", key: null },
  };
  for (const [key] of tables.dish) {
    if (key !== "" && request.includes(key)) {
      trace.item.key = key;
      break;
    }
  }
  for (const [key] of tables.note) {
    if (key !== "" && request.includes(key)) {
      trace.note.key = key;
      break;
    }
  }
  const calmHit = tables.calm.find((word) => word !== "" && request.includes(word));
  if (calmHit !== undefined) {
    trace.urgent = { via: "calm", key: calmHit };
  } else {
    const rushHit = tables.rush.find((word) => word !== "" && request.includes(word));
    if (rushHit !== undefined) trace.urgent = { via: "rush", key: rushHit };
  }
  return trace;
}

function checkWord(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const word = raw.trim();
  if (word === "" || runeLength(word) > MAX_WORD_RUNES) return null;
  return word;
}

function checkPairTable(
  raw: unknown,
  name: string,
  allowed: readonly string[],
  errors: string[],
): WordPair[] {
  if (!Array.isArray(raw)) {
    errors.push(`${name} 要写成一一对应的词表（字典）。`);
    return [];
  }
  if (raw.length > MAX_WORDS_PER_TABLE) {
    errors.push(`${name} 最多 ${MAX_WORDS_PER_TABLE} 个词，现在有 ${raw.length} 个。`);
  }
  const pairs: WordPair[] = [];
  for (const [index, entry] of raw.slice(0, MAX_WORDS_PER_TABLE).entries()) {
    const pair = Array.isArray(entry) ? entry : null;
    if (pair && (isBlank(pair[0]) || isBlank(pair[1]))) continue;
    const key = pair ? checkWord(pair[0]) : null;
    const value = pair && typeof pair[1] === "string" ? pair[1].trim() : null;
    if (key === null) {
      errors.push(
        `${name} 第 ${index + 1} 个词写得不完整，词要去掉空格后剩 1～${MAX_WORD_RUNES} 个字。`,
      );
      continue;
    }
    if (value === null || !(allowed as readonly string[]).includes(value)) {
      errors.push(`${name} 里「${key}」对应的值不在菜单上（可选：${allowed.join("、")}）。`);
      continue;
    }
    pairs.push([key, value]);
  }
  return pairs;
}

function checkListTable(raw: unknown, name: string, errors: string[]): string[] {
  if (!Array.isArray(raw)) {
    errors.push(`${name} 要写成一串词（列表）。`);
    return [];
  }
  if (raw.length > MAX_WORDS_PER_TABLE) {
    errors.push(`${name} 最多 ${MAX_WORDS_PER_TABLE} 个词，现在有 ${raw.length} 个。`);
  }
  const words: string[] = [];
  for (const [index, entry] of raw.slice(0, MAX_WORDS_PER_TABLE).entries()) {
    if (isBlank(entry)) continue;
    const word = checkWord(entry);
    if (word === null) {
      errors.push(
        `${name} 第 ${index + 1} 个词写得不完整，词要去掉空格后剩 1～${MAX_WORD_RUNES} 个字。`,
      );
      continue;
    }
    words.push(word);
  }
  return words;
}

/**
 * Validate a submitted/restored tables object. Returns the usable tables
 * (invalid entries and "____" blanks dropped, lists capped at 20) plus
 * Chinese error text for every rejected entry — the judge refuses
 * submissions with errors; draft restores keep the usable remainder
 * silently.
 */
export function checkIntakeTables(raw: unknown): { tables: IntakeTables; errors: string[] } {
  const errors: string[] = [];
  const empty: IntakeTables = { dish: [], note: [], calm: [], rush: [] };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push("还没有可用的词表，运行代码后才算得出。");
    return { tables: empty, errors };
  }
  const record = raw as Record<string, unknown>;
  const tables: IntakeTables = {
    dish: checkPairTable(record.dish, "dish_words", DISHES, errors),
    note: checkPairTable(record.note, "note_words", NOTES, errors),
    calm: checkListTable(record.calm, "calm_words", errors),
    rush: checkListTable(record.rush, "rush_words", errors),
  };
  return { tables, errors };
}

/** Grade a word-table set against orders, keeping per-field attribution. */
export function evaluateIntake(
  orders: readonly { id: string; request: string; expected: Ticket }[],
  tables: IntakeTables,
): IntakeOrderResult[] {
  return orders.map((order) => {
    const trace = traceTicket(order.request, tables);
    return {
      id: order.id,
      request: order.request,
      correct: sameTicket(trace.ticket, order.expected),
      produced: trace.ticket,
      expected: order.expected,
      itemKey: trace.item.key,
      noteKey: trace.note.key,
      urgentVia: trace.urgent.via,
      urgentKey: trace.urgent.key,
    };
  });
}

/** Draft-restore variant: keep what is valid, say nothing. */
export function sanitizeIntakeTables(raw: unknown): IntakeTables | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return checkIntakeTables(raw).tables;
}
