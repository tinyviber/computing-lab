/**
 * Wire shaping shared by the /draws endpoint and the client sandbox:
 * `toDrawPayload` is the ONLY conversion from an Answer to wire data, so
 * `flags`/`entryId` cannot leak by accident — they are simply absent from
 * the payload shape.
 */

import type { EvalQuestion } from "./corpus.ts";
import type { Answer } from "./responder.ts";
import type { DrawPayload } from "./protocol.ts";
import { applyPhrasing, type Probe } from "./probe.ts";

export function toDrawPayload(
  probe: Probe,
  question: EvalQuestion | undefined,
  answer: Answer,
  drawId: string,
): DrawPayload {
  return {
    probe,
    drawId,
    // The resolved question, not the probe's — C3 probes carry the "*" cursor.
    questionId: question?.id ?? probe.questionId,
    questionText: question ? applyPhrasing(question, probe.phrasing) : "",
    text: answer.text,
    slots: answer.slots.map((s) => ({ fieldId: s.fieldId, slot: s.slot, value: s.value })),
    cites: answer.cites,
  };
}
