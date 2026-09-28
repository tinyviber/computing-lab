/**
 * 校园百事通 — a scripted retrieval-style responder over a synthetic campus
 * fact corpus. Pure function: `ask(probe, bank, temp, rng)` is identical in
 * the browser sandbox and on the judge server given the same rng stream, so
 * the server can replay a student's transcript bit-for-bit.
 *
 * Failure knobs (issue #61 §3):
 *   - near-score flip: top1/top2 inside eps(temp) → rng picks → 措辞敏感
 *   - below-θ confabulation: fluent fabricated slots → 一本正经地编
 *   - halluRate(temp): one slot value corrupted with a distractor
 *   - misciteRate(temp): cites the runner-up entry instead of the real one
 *   - renderVariant: template choice per draw → same answer, new wording
 *
 * All string/integer ops. No Math.random, Date.now, or network.
 */

import type { Rng } from "../../../shared/rng.ts";
import {
  fieldIdOf,
  questionOf,
  truthOf,
  type EvalBank,
  type FactEntry,
  type SlotKey,
} from "./corpus.ts";
import { applyPhrasing, type Probe } from "./probe.ts";

/* ----------------------------- constants ----------------------------- */

/** Retrieval temperature — only ever these three values. */
export type Temp = 0 | 0.3 | 0.8;
export const TEMPS: readonly Temp[] = [0, 0.3, 0.8];

/** Below this retrieval score the responder confabulates (域外乱答). */
export const THETA = 3;

/** top1–top2 margin below which the draw flips between candidates. */
export function epsOf(temp: number): number {
  const t = snapTemp(temp);
  return t === 0 ? 0 : t === 0.3 ? 0.9 : 2.2;
}
/** Probability a slot value is replaced by a distractor. */
export function halluRateOf(temp: number): number {
  const t = snapTemp(temp);
  return t === 0 ? 0 : t === 0.3 ? 0.18 : 0.55;
}
/** Probability the citation points at the runner-up entry. */
export function misciteRateOf(temp: number): number {
  const t = snapTemp(temp);
  return t === 0 ? 0 : t === 0.3 ? 0.12 : 0.4;
}

export function snapTemp(temp: number): Temp {
  if (temp <= 0.15) return 0;
  if (temp <= 0.55) return 0.3;
  return 0.8;
}

/* ------------------------------ answer ------------------------------- */

export type AnswerSlot = { fieldId: string; slot: SlotKey; value: string };

export type Answer = {
  /** Rendered text; each slot value appears as a `⟦i⟧` marker. */
  text: string;
  slots: AnswerSlot[];
  cites: string[];
  /** Entry the answer was built from; null when confabulated. */
  entryId: string | null;
  flags: { confabulated: boolean; corrupted: boolean; miscited: boolean };
};

/**
 * Field-level identity of an answer — entry id + sorted `fieldId=value`
 * pairs. Cites and surface wording are excluded on purpose: two draws are
 * "the same answer" iff they carry the same claimed facts.
 */
export function answerKeyOf(answer: Answer): string {
  const facts = answer.slots
    .map((s) => `${s.fieldId}=${s.value}`)
    .sort()
    .join(";");
  return `${answer.entryId ?? "?"}|${facts}`;
}

/* ---------------------------- text scoring --------------------------- */

export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function bigrams(text: string): Set<string> {
  const norm = normalizeText(text);
  const out = new Set<string>();
  if (norm.length === 0) return out;
  if (norm.length === 1) {
    out.add(norm);
    return out;
  }
  for (let i = 0; i < norm.length - 1; i += 1) out.add(norm.slice(i, i + 2));
  return out;
}

function entryBigrams(entry: FactEntry): Set<string> {
  return bigrams(`${entry.keywords.join("")}${entry.topic}`);
}

function keywordHits(queryNorm: string, entry: FactEntry): number {
  let hits = 0;
  for (const kw of entry.keywords) {
    if (kw.length > 0 && queryNorm.includes(normalizeText(kw))) hits += 1;
  }
  return hits;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export type ScoredEntry = { entry: FactEntry; score: number };

/** score = 2 · keywordHits + bigramJaccard — hits dominate, jaccard breaks ties. */
export function scoreEntries(queryText: string, corpus: readonly FactEntry[]): ScoredEntry[] {
  const norm = normalizeText(queryText);
  const queryBig = bigrams(queryText);
  return corpus
    .map((entry) => ({
      entry,
      score: 2 * keywordHits(norm, entry) + jaccard(queryBig, entryBigrams(entry)),
    }))
    .sort((a, b) => b.score - a.score || a.entry.id.localeCompare(b.entry.id));
}

/* ---------------------------- distractors ---------------------------- */

const DISTRACTORS: Record<SlotKey, string[]> = {
  time: ["9:20", "14:15", "17:45", "19:00", "12:30", "8:10", "21:15", "16:20"],
  place: ["西楼一层", "南门值班室", "综合楼天台", "图书馆负一层", "行政楼203", "体育馆器材室"],
  num: ["2", "8", "12", "15", "20", "30"],
  name: ["后勤老师", "值周老师", "图书管理员", "食堂经理", "教务主任"],
  item: ["红烧排骨", "牛肉面", "绿豆汤", "登记册", "备用钥匙", "活动手册"],
};

/** Pick a distractor for `slot` that differs from `truth`. */
function distractorFor(slot: SlotKey, truth: string | undefined, rng: Rng): string {
  const pool = DISTRACTORS[slot];
  let idx = Math.floor(rng() * pool.length);
  if (pool[idx] === truth) idx = (idx + 1) % pool.length;
  return pool[idx];
}

/* ------------------------------ ask() -------------------------------- */

const SLOT_MARK = /\{([a-z]+)\}/g;

/**
 * Render an entry's answer for one draw: pick a template via rng, then emit
 * `⟦i⟧` markers for every slot the template mentions (in mention order).
 */
function renderAnswer(
  entry: FactEntry,
  rng: Rng,
  valueFor: (slot: SlotKey) => string,
): { text: string; slots: AnswerSlot[] } {
  const template = entry.templates[Math.floor(rng() * entry.templates.length)];
  const slots: AnswerSlot[] = [];
  const text = template.replace(SLOT_MARK, (_m, key: string) => {
    const slot = key as SlotKey;
    const truth = entry.slots[slot];
    if (truth === undefined) return "";
    const idx = slots.length;
    slots.push({ fieldId: fieldIdOf(entry.id, slot), slot, value: valueFor(slot) });
    return `⟦${idx}⟧`;
  });
  return { text, slots };
}

export function ask(probe: Probe, bank: EvalBank, temp: Temp, rng: Rng): Answer {
  const t = snapTemp(temp);
  const question = questionOf(bank, probe.questionId);
  const rendered = applyPhrasing(
    question ?? {
      id: probe.questionId,
      category: "",
      text: probe.questionId,
      targetEntryId: "",
      coreTerm: "",
    },
    probe.phrasing,
  );

  const scored = scoreEntries(rendered, bank.corpus);
  const top1 = scored[0];
  const runnerUp = scored[1];

  // Near-score flip: everything within eps of top1 is a candidate (cap 3).
  const eps = epsOf(t);
  const zone = scored.filter((s) => top1.score - s.score <= eps).slice(0, 3);
  const pick = rng();
  const chosen = zone[Math.floor(pick * zone.length)];

  if (chosen.score < THETA) {
    // Below θ: confabulate — fluent template of the nearest entry, all slot
    // values fabricated. fieldIds still point at real fields so a verify
    // reveals the mismatch.
    const { text, slots } = renderAnswer(chosen.entry, rng, (slot) =>
      distractorFor(slot, chosen.entry.slots[slot], rng),
    );
    return {
      text,
      slots,
      cites: [chosen.entry.id],
      entryId: null,
      flags: { confabulated: true, corrupted: false, miscited: false },
    };
  }

  const { text, slots } = renderAnswer(chosen.entry, rng, (slot) => chosen.entry.slots[slot] ?? "");

  const flags = { confabulated: false, corrupted: false, miscited: false };
  if (slots.length > 0 && rng() < halluRateOf(t)) {
    const idx = Math.floor(rng() * slots.length);
    const slot = slots[idx];
    slot.value = distractorFor(slot.slot, truthOf(bank.corpus, slot.fieldId) ?? undefined, rng);
    flags.corrupted = true;
  }

  const cites = [chosen.entry.id];
  if (runnerUp && rng() < misciteRateOf(t)) {
    cites[0] = runnerUp.entry.id;
    flags.miscited = true;
  }

  return { text, slots, cites, entryId: chosen.entry.id, flags };
}

/**
 * Deterministically plant one slot corruption on an otherwise-normal answer
 * (the C3 dispense plan uses it; harmless to ship — the "planted defects"
 * premise is stated in the lab copy).
 */
export function plantCorruption(answer: Answer, corpus: readonly FactEntry[], rng: Rng): void {
  if (answer.slots.length === 0) return;
  const idx = Math.floor(rng() * answer.slots.length);
  const slot = answer.slots[idx];
  slot.value = distractorFor(slot.slot, truthOf(corpus, slot.fieldId) ?? undefined, rng);
  answer.flags.corrupted = true;
}

/* --------------------------- defect surface -------------------------- */

/**
 * Slots whose claimed value disagrees with the corpus — the fieldIds a C3
 * "存疑" verdict is allowed to cite. Covers confabulation and corruption
 * uniformly: whatever the answer claims is checked against the fact table.
 */
export function defectFieldIds(answer: Answer, corpus: readonly FactEntry[]): string[] {
  const out: string[] = [];
  for (const slot of answer.slots) {
    if (truthOf(corpus, slot.fieldId) !== slot.value) out.push(slot.fieldId);
  }
  return out;
}
