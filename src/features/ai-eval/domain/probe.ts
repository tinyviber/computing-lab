/**
 * Probe + phrasing machinery for ai-eval. A probe is the frozen evidence
 * key — `{questionId, phrasing[], k}` — so a transcript row never stores the
 * answer text, only how the answer was drawn.
 */

import { fnv1a, makeRng, type Rng } from "../../../shared/rng.ts";
import type { EvalQuestion } from "./corpus.ts";

/** The five phrasing dimensions students perturb in C2. */
export const PHRASING_DIMS = [
  { id: "order", label: "换个语序" },
  { id: "polite", label: "加敬语" },
  { id: "qualifier", label: "加限定词" },
  { id: "synonym", label: "同义替换" },
  { id: "drop-core", label: "删掉关键词" },
] as const;

export type PhrasingDim = (typeof PHRASING_DIMS)[number]["id"];

/** Matrix column key: "base" (repeat control) or a phrasing dim. */
export const MATRIX_COLUMNS = ["base", ...PHRASING_DIMS.map((d) => d.id)] as const;
export type MatrixColumn = (typeof MATRIX_COLUMNS)[number];

export type Probe = {
  questionId: string;
  phrasing: PhrasingDim[];
  /** Repetition index for the same question+phrasing (0-based). */
  k: number;
};

export const MAX_PROBES_PER_STAGE = 8;
export const MAX_REPEAT = 8;

export function probeKey(probe: Probe): string {
  return `${probe.questionId}|${[...probe.phrasing].sort().join("+")}|${probe.k}`;
}

/**
 * `drawId = hash(seed ‖ questionId ‖ phrasing ‖ k)` — the frozen draw
 * identity. The server recomputes it when replaying a transcript; the same
 * probe always yields the same drawId (draws are idempotent).
 */
export function drawIdOf(seed: number, probe: Probe): string {
  return fnv1a(`${seed}|${probeKey(probe)}`)
    .toString(16)
    .padStart(8, "0");
}

/** The rng stream feeding `ask()` for one draw — seeded off drawId material. */
export function makeDrawRng(seed: number, probe: Probe): Rng {
  return makeRng(fnv1a(`${seed}|${probeKey(probe)}|rng`));
}

/**
 * Apply one phrasing mod to a question's canonical text. Pure string ops —
 * no randomness here; instability comes from the responder, not the probe.
 */
function applyMod(text: string, mod: PhrasingDim, question: EvalQuestion): string {
  switch (mod) {
    case "order": {
      const parts = text
        .split(/[,，]/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 2) return text;
      return [...parts.slice(1), parts[0]].join("，");
    }
    case "polite":
      return `请问，${text}`;
    case "qualifier":
      return `平时，${text}`;
    case "synonym":
      return question.synonym ? text.replaceAll(question.coreTerm, question.synonym) : text;
    case "drop-core":
      return text.replaceAll(question.coreTerm, "").replace(/，{2,}/g, "，");
  }
}

export function applyPhrasing(question: EvalQuestion, mods: readonly PhrasingDim[]): string {
  let text = question.text;
  for (const mod of mods) text = applyMod(text, mod, question);
  return text;
}
