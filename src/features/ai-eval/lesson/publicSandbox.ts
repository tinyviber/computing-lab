/**
 * Practice sandbox: the public corpus + public question set ship in the
 * bundle so students can poke the responder before the graded stages. Draws
 * run the same `ask()` the server uses — only the seed differs (a local
 * sandbox seed, not the user's judge seed).
 */

import { fnv1a, makeRng } from "../../../shared/rng.ts";
import { PUBLIC_BANK } from "../domain/corpus.ts";
import { toDrawPayload } from "../domain/fixtures.ts";
import { drawIdOf, type Probe } from "../domain/probe.ts";
import { ask, type Temp } from "../domain/responder.ts";
import type { DrawPayload } from "../domain/protocol.ts";

const SANDBOX_SEED = fnv1a("ai-eval|sandbox");

/** Public practice questions shown in the sandbox picker. */
export function sandboxQuestions() {
  return PUBLIC_BANK.questions.map((q) => ({ id: q.id, text: q.text, category: q.category }));
}

/**
 * One sandbox draw — identical responder semantics to the judged stages.
 * `temp` defaults to 0.3 so students see both flips and corruptions.
 */
export function sandboxDraw(questionId: string, k: number, temp: Temp = 0.3): DrawPayload | null {
  const question = PUBLIC_BANK.questions.find((q) => q.id === questionId);
  if (!question || k < 0 || k > 15) return null;
  const probe: Probe = { questionId, phrasing: [], k };
  const answer = ask(
    probe,
    PUBLIC_BANK,
    temp,
    makeRng(fnv1a(`${SANDBOX_SEED}|${questionId}|${k}`)),
  );
  return toDrawPayload(probe, question, answer, drawIdOf(SANDBOX_SEED, probe));
}
