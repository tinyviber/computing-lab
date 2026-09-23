/**
 * Task-sheet (任务单) domain: question schema, validation, and the public
 * projection. The full SheetSchema embeds grading data (accept lists, correct
 * option ids, reference answers); students only ever receive publicSchema().
 * Server imports this module for authoritative validation and grading — the
 * same boundary rule as lab judging.
 */

export const SHEET_LIMITS = {
  questions: { min: 0, max: 50 },
  prompt: 2000,
  optionText: 200,
  blankAccept: 200,
  acceptsPerBlank: 10,
  blanksPerQuestion: 10,
  optionsPerQuestion: 10,
  maxScore: 100,
  title: 120,
  description: 2000,
  shortAnswer: 5000,
} as const;

export type FillBlank = { id: string; accept: string[]; caseSensitive?: boolean };

export type FillQuestion = {
  id: string;
  type: "fill";
  prompt: string;
  required: boolean;
  /** Total points for this question, split evenly across blanks. */
  score: number;
  blanks: FillBlank[];
};

export type ChoiceOption = { id: string; text: string };

export type ChoiceQuestion = {
  id: string;
  type: "choice";
  prompt: string;
  required: boolean;
  score: number;
  multiple: boolean;
  options: ChoiceOption[];
  correctOptionIds: string[];
  /** Multi-select only: award partial credit for an incomplete correct set. */
  partialCredit?: boolean;
};

export type ShortQuestion = {
  id: string;
  type: "short";
  prompt: string;
  required: boolean;
  maxScore: number;
  referenceAnswer?: string;
};

export type Question = FillQuestion | ChoiceQuestion | ShortQuestion;

export type SheetSchema = { version: 1; questions: Question[] };

export type PublicFillQuestion = Omit<FillQuestion, "blanks"> & {
  blanks: { id: string }[];
};
export type PublicChoiceQuestion = Omit<ChoiceQuestion, "correctOptionIds">;
export type PublicShortQuestion = Omit<ShortQuestion, "referenceAnswer">;
export type PublicQuestion = PublicFillQuestion | PublicChoiceQuestion | PublicShortQuestion;
export type PublicSheetSchema = { version: 1; questions: PublicQuestion[] };

/** Student-facing projection: strips every grading field from the schema. */
export function publicSchema(schema: SheetSchema): PublicSheetSchema {
  return {
    version: 1,
    questions: schema.questions.map((q): PublicQuestion => {
      if (q.type === "fill") {
        return {
          id: q.id,
          type: "fill",
          prompt: q.prompt,
          required: q.required,
          score: q.score,
          blanks: q.blanks.map((b) => ({ id: b.id })),
        };
      }
      if (q.type === "choice") {
        return {
          id: q.id,
          type: "choice",
          prompt: q.prompt,
          required: q.required,
          score: q.score,
          multiple: q.multiple,
          options: q.options,
          partialCredit: q.partialCredit,
        };
      }
      return {
        id: q.id,
        type: "short",
        prompt: q.prompt,
        required: q.required,
        maxScore: q.maxScore,
      };
    }),
  };
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

function isText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function isScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    value <= SHEET_LIMITS.maxScore
  );
}

function uniqueIds(values: { id: string }[]): boolean {
  return new Set(values.map((v) => v.id)).size === values.length;
}

export type SchemaValidation = { ok: true; schema: SheetSchema } | { ok: false; error: string };

/**
 * Structural validation at the server boundary. `partial` relaxes the
 * completeness rules (empty accept lists, unmarked correct options, empty
 * prompts) so in-progress drafts can autosave; assigning a sheet always
 * re-validates in strict mode.
 */
export function validateSheetSchema(raw: unknown, opts?: { partial?: boolean }): SchemaValidation {
  const partial = opts?.partial === true;
  if (!raw || typeof raw !== "object") return { ok: false, error: "invalid-schema" };
  const { questions } = raw as { questions?: unknown };
  if (
    !Array.isArray(questions) ||
    questions.length < SHEET_LIMITS.questions.min ||
    questions.length > SHEET_LIMITS.questions.max
  ) {
    return { ok: false, error: "invalid-questions" };
  }
  const out: Question[] = [];
  for (const item of questions) {
    if (!item || typeof item !== "object") return { ok: false, error: "invalid-question" };
    const q = item as Record<string, unknown>;
    if (!isId(q.id) || !isText(q.prompt, SHEET_LIMITS.prompt)) {
      return { ok: false, error: "invalid-question" };
    }
    if (!partial && q.prompt.trim() === "") return { ok: false, error: "invalid-question" };
    const base = {
      id: q.id,
      prompt: q.prompt.trim(),
      required: q.required === true,
    };
    if (q.type === "fill") {
      if (!isScore(q.score) || !Array.isArray(q.blanks)) {
        return { ok: false, error: "invalid-fill" };
      }
      if (q.blanks.length < 1 || q.blanks.length > SHEET_LIMITS.blanksPerQuestion) {
        return { ok: false, error: "invalid-fill" };
      }
      const blanks: FillBlank[] = [];
      for (const b of q.blanks) {
        if (!b || typeof b !== "object") return { ok: false, error: "invalid-fill" };
        const blank = b as Record<string, unknown>;
        if (!isId(blank.id) || !Array.isArray(blank.accept)) {
          return { ok: false, error: "invalid-fill" };
        }
        const accept = blank.accept.filter(
          (a): a is string => isText(a, SHEET_LIMITS.blankAccept) && a.trim().length > 0,
        );
        if ((!partial && accept.length < 1) || accept.length > SHEET_LIMITS.acceptsPerBlank) {
          return { ok: false, error: "invalid-fill" };
        }
        blanks.push({
          id: blank.id,
          accept: accept.map((a) => a.trim()),
          caseSensitive: blank.caseSensitive === true,
        });
      }
      if (!uniqueIds(blanks)) return { ok: false, error: "invalid-fill" };
      out.push({ ...base, type: "fill", score: q.score, blanks });
    } else if (q.type === "choice") {
      if (!isScore(q.score) || !Array.isArray(q.options) || !Array.isArray(q.correctOptionIds)) {
        return { ok: false, error: "invalid-choice" };
      }
      if (q.options.length > SHEET_LIMITS.optionsPerQuestion) {
        return { ok: false, error: "invalid-choice" };
      }
      const options: ChoiceOption[] = [];
      for (const o of q.options) {
        if (!o || typeof o !== "object") return { ok: false, error: "invalid-choice" };
        const opt = o as Record<string, unknown>;
        if (!isId(opt.id) || !isText(opt.text, SHEET_LIMITS.optionText)) {
          return { ok: false, error: "invalid-choice" };
        }
        // Empty option rows are dropped — drafts may hold them mid-edit, and
        // strict validation below still requires enough real options.
        if (opt.text.trim() === "") continue;
        options.push({ id: opt.id, text: opt.text.trim() });
      }
      if (!partial && options.length < 2) return { ok: false, error: "invalid-choice" };
      if (!uniqueIds(options)) return { ok: false, error: "invalid-choice" };
      const optionIds = new Set(options.map((o) => o.id));
      const correctOptionIds = (q.correctOptionIds as unknown[]).filter(
        (id): id is string => typeof id === "string" && optionIds.has(id),
      );
      const multiple = q.multiple === true;
      if (new Set(correctOptionIds).size !== correctOptionIds.length) {
        return { ok: false, error: "invalid-choice" };
      }
      if (
        !partial &&
        (correctOptionIds.length < 1 || (!multiple && correctOptionIds.length !== 1))
      ) {
        return { ok: false, error: "invalid-choice" };
      }
      out.push({
        ...base,
        type: "choice",
        score: q.score,
        multiple,
        options,
        correctOptionIds,
        partialCredit: q.partialCredit === true,
      });
    } else if (q.type === "short") {
      const maxScore = q.maxScore === 0 && partial ? 1 : q.maxScore;
      if (!isScore(maxScore)) return { ok: false, error: "invalid-short" };
      const referenceAnswer = q.referenceAnswer;
      if (referenceAnswer !== undefined && !isText(referenceAnswer, SHEET_LIMITS.prompt)) {
        return { ok: false, error: "invalid-short" };
      }
      out.push({ ...base, type: "short", maxScore, referenceAnswer });
    } else {
      return { ok: false, error: "invalid-question-type" };
    }
  }
  if (!uniqueIds(out)) return { ok: false, error: "duplicate-question-id" };
  return { ok: true, schema: { version: 1, questions: out } };
}
