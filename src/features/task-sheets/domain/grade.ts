/**
 * Authoritative auto-grading for task sheets. Runs server-side at submit time
 * (grading authority lives in the server); the client may reuse it only for
 * previews. Fill answers normalize through trim + full→half width + case fold
 * unless the blank opts into case sensitivity.
 */

import type { Question, SheetSchema } from "./schema.ts";

export type AnswerValue =
  | { type: "fill"; blanks: Record<string, string> }
  | { type: "choice"; optionIds: string[] }
  | { type: "short"; text: string };

export type AnswerMap = Record<string, AnswerValue>;

export type BlankGrading = { answer: string; correct: boolean };
export type QuestionGrading =
  | { type: "fill"; score: number; max: number; blanks: Record<string, BlankGrading> }
  | {
      type: "choice";
      score: number;
      max: number;
      selected: string[];
      correctOptionIds: string[];
      correct: boolean;
    }
  | { type: "short"; score: number | null; max: number; text: string };

export type AutoGradeResult = {
  /** Points earned on auto-graded questions (fill + choice). */
  autoScore: number;
  /** Points possible on auto-graded questions. */
  autoTotal: number;
  /** Points possible on manually reviewed questions. */
  manualTotal: number;
  perQuestion: Record<string, QuestionGrading>;
};

/** Student-facing projection of grading: never leaks the accepted answers. */
export function publicGrading(grading: Record<string, QuestionGrading>) {
  const out: Record<
    string,
    | { type: "fill"; score: number; max: number; blanks: Record<string, { correct: boolean }> }
    | { type: "choice"; score: number; max: number; selected: string[]; correct: boolean }
    | { type: "short"; score: number | null; max: number; text: string }
  > = {};
  for (const [qid, g] of Object.entries(grading)) {
    if (g.type === "fill") {
      const blanks: Record<string, { correct: boolean }> = {};
      for (const [bid, b] of Object.entries(g.blanks)) blanks[bid] = { correct: b.correct };
      out[qid] = { type: "fill", score: g.score, max: g.max, blanks };
    } else if (g.type === "choice") {
      out[qid] = {
        type: "choice",
        score: g.score,
        max: g.max,
        selected: g.selected,
        correct: g.correct,
      };
    } else {
      out[qid] = { type: "short", score: g.score, max: g.max, text: g.text };
    }
  }
  return out;
}

/** trim + fullwidth→halfwidth + case fold (unless the blank opts out). */
export function normalizeFillText(value: string, caseSensitive?: boolean): string {
  let s = value.trim();
  // Fullwidth ASCII variants (！-～) → halfwidth; fullwidth space → space.
  s = s.replace(/[\uFF01-\uFF5E\u3000]/g, (ch) => {
    const code = ch.charCodeAt(0);
    return code === 0x3000 ? " " : String.fromCharCode(code - 0xfee0);
  });
  s = s.replace(/\s+/g, " ");
  return caseSensitive ? s : s.toLowerCase();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function gradeFill(q: Extract<Question, { type: "fill" }>, raw: AnswerValue | undefined) {
  const given = raw?.type === "fill" ? raw.blanks : {};
  const perBlank = q.score / q.blanks.length;
  const blanks: Record<string, BlankGrading> = {};
  let score = 0;
  for (const blank of q.blanks) {
    const answer = typeof given[blank.id] === "string" ? given[blank.id] : "";
    const normalized = normalizeFillText(answer, blank.caseSensitive);
    const correct =
      normalized !== "" &&
      blank.accept.some((a) => normalizeFillText(a, blank.caseSensitive) === normalized);
    if (correct) score += perBlank;
    blanks[blank.id] = { answer, correct };
  }
  return { type: "fill" as const, score: round2(score), max: q.score, blanks };
}

function gradeChoice(q: Extract<Question, { type: "choice" }>, raw: AnswerValue | undefined) {
  const selected = raw?.type === "choice" && Array.isArray(raw.optionIds) ? raw.optionIds : [];
  const valid = new Set(q.options.map((o) => o.id));
  const picked = [...new Set(selected.filter((id) => valid.has(id)))];
  const correctSet = new Set(q.correctOptionIds);
  const hit = picked.filter((id) => correctSet.has(id)).length;
  const wrong = picked.length - hit;
  const exact = hit === correctSet.size && wrong === 0;
  let score = 0;
  if (exact) {
    score = q.score;
  } else if (q.multiple && q.partialCredit && correctSet.size > 0) {
    // 漏选按比例得分，错选扣回部分分但不倒扣。
    score = round2(Math.max(0, ((hit - wrong) / correctSet.size) * q.score));
  }
  return {
    type: "choice" as const,
    score,
    max: q.score,
    selected: picked,
    correctOptionIds: q.correctOptionIds,
    correct: exact,
  };
}

export function autoGrade(schema: SheetSchema, answers: AnswerMap): AutoGradeResult {
  const perQuestion: Record<string, QuestionGrading> = {};
  let autoScore = 0;
  let autoTotal = 0;
  let manualTotal = 0;
  for (const q of schema.questions) {
    const raw = answers[q.id];
    if (q.type === "fill") {
      const graded = gradeFill(q, raw);
      perQuestion[q.id] = graded;
      autoScore += graded.score;
      autoTotal += q.score;
    } else if (q.type === "choice") {
      const graded = gradeChoice(q, raw);
      perQuestion[q.id] = graded;
      autoScore += graded.score;
      autoTotal += q.score;
    } else {
      perQuestion[q.id] = {
        type: "short",
        score: null,
        max: q.maxScore,
        text: raw?.type === "short" ? raw.text : "",
      };
      manualTotal += q.maxScore;
    }
  }
  return { autoScore: round2(autoScore), autoTotal: round2(autoTotal), manualTotal, perQuestion };
}

/**
 * Validate submitted answers against the schema: unknown questions/ids are
 * dropped silently but required questions must contain a non-empty answer.
 * Returns null when the map is acceptable.
 */
export function validateAnswers(schema: SheetSchema, answers: AnswerMap): string | null {
  for (const q of schema.questions) {
    const raw = answers[q.id];
    if (!q.required) continue;
    if (!raw || raw.type !== q.type) return "required-question-unanswered";
    if (q.type === "fill" && raw.type === "fill") {
      const empty = q.blanks.some((b) => !raw.blanks[b.id] || raw.blanks[b.id].trim() === "");
      if (empty) return "required-question-unanswered";
    } else if (q.type === "choice" && raw.type === "choice" && raw.optionIds.length === 0) {
      return "required-question-unanswered";
    } else if (q.type === "short" && raw.type === "short" && raw.text.trim() === "") {
      return "required-question-unanswered";
    }
  }
  return null;
}

/** Sanitize an untrusted answers payload into the typed AnswerMap. */
export function sanitizeAnswers(schema: SheetSchema, raw: unknown): AnswerMap {
  const out: AnswerMap = {};
  if (!raw || typeof raw !== "object") return out;
  const source = raw as Record<string, unknown>;
  const SHORT_MAX = 5000;
  for (const q of schema.questions) {
    const value = source[q.id];
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (q.type === "fill" && v.type === "fill" && v.blanks && typeof v.blanks === "object") {
      const blanks: Record<string, string> = {};
      for (const b of q.blanks) {
        const text = (v.blanks as Record<string, unknown>)[b.id];
        if (typeof text === "string") blanks[b.id] = text.slice(0, 500);
      }
      out[q.id] = { type: "fill", blanks };
    } else if (q.type === "choice" && v.type === "choice" && Array.isArray(v.optionIds)) {
      const valid = new Set(q.options.map((o) => o.id));
      out[q.id] = {
        type: "choice",
        optionIds: v.optionIds.filter(
          (id): id is string => typeof id === "string" && valid.has(id),
        ),
      };
    } else if (q.type === "short" && v.type === "short" && typeof v.text === "string") {
      out[q.id] = { type: "short", text: v.text.slice(0, SHORT_MAX) };
    }
  }
  return out;
}
