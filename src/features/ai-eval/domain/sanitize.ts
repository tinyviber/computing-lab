/**
 * Draft sanitizer — whitelist-style, so `passed`, `score`, `fact`,
 * `entryId`, `flags`, answer text, etc. are dropped rather than persisted
 * (anti-cheat: the draft may never carry answer material or verdict
 * shortcuts; the judge replays draws instead).
 *
 * Server-managed fields (`_srv`, `verifyLog`, `predictedAt`) are carried
 * over from the *prior stored draft* — never taken from client input — so
 * autosaves can't wipe or forge issued draws, verified fields, or the
 * prediction timestamp.
 */

import type { MatrixColumn, PhrasingDim, Probe } from "./probe.ts";
import { MATRIX_COLUMNS, PHRASING_DIMS } from "./probe.ts";
import {
  MAX_TRANSCRIPT_ROWS,
  MAX_VERDICTS,
  STABILITY_RATINGS,
  type AiEvalDraft,
  type IssuedDraw,
  type ServerDraftMarks,
  type StabilityRating,
  type TranscriptRow,
  type VerdictChoice,
} from "./protocol.ts";

const DIMS = new Set<string>(PHRASING_DIMS.map((d) => d.id));
const COLUMNS = new Set<string>(MATRIX_COLUMNS);
const RATINGS = new Set<string>(STABILITY_RATINGS);
const VERDICTS = new Set(["trust", "doubt", "human"]);
const DRAW_ID = /^[0-9a-f]{4,24}$/;
const SHORT = /^.{1,60}$/u;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, re = SHORT): v is string => typeof v === "string" && re.test(v);
const int = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

function sanitizeProbe(raw: unknown): Probe | null {
  if (!isRecord(raw)) return null;
  if (!str(raw.questionId)) return null;
  const phrasing = Array.isArray(raw.phrasing)
    ? raw.phrasing.filter((m): m is PhrasingDim => typeof m === "string" && DIMS.has(m))
    : [];
  if (!int(raw.k, 0, 15)) return null;
  return { questionId: raw.questionId, phrasing, k: raw.k };
}

function sanitizeTranscript(raw: unknown): TranscriptRow[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptRow[] = [];
  for (const row of raw) {
    if (out.length >= MAX_TRANSCRIPT_ROWS) break;
    if (!isRecord(row)) continue;
    const probe = sanitizeProbe(row.probe);
    if (!probe || !str(row.drawId, DRAW_ID) || !int(row.collectedAt, 1, 64)) continue;
    out.push({ probe, drawId: row.drawId, collectedAt: row.collectedAt });
  }
  return out;
}

function sanitizeRatings(raw: unknown): Record<string, StabilityRating> {
  const out: Record<string, StabilityRating> = {};
  if (!isRecord(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (Object.keys(out).length >= 8) break;
    if (str(key) && typeof v === "string" && RATINGS.has(v)) {
      out[key] = v as StabilityRating;
    }
  }
  return out;
}

function sanitizePredictions(raw: unknown): Partial<Record<PhrasingDim, boolean>> {
  const out: Partial<Record<PhrasingDim, boolean>> = {};
  if (!isRecord(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (DIMS.has(key) && typeof v === "boolean") out[key as PhrasingDim] = v;
  }
  return out;
}

function sanitizeMatrix(raw: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!isRecord(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (!COLUMNS.has(key) || !Array.isArray(v)) continue;
    const cells = v.filter((d): d is string => str(d, DRAW_ID)).slice(0, 3);
    if (cells.length > 0) out[key as MatrixColumn] = cells;
  }
  return out;
}

function sanitizeVerdicts(raw: unknown): Record<string, VerdictChoice> {
  const out: Record<string, VerdictChoice> = {};
  if (!isRecord(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (Object.keys(out).length >= MAX_VERDICTS) break;
    if (!str(key, DRAW_ID) || !isRecord(v)) continue;
    if (typeof v.v !== "string" || !VERDICTS.has(v.v)) continue;
    const fieldId = str(v.fieldId) ? v.fieldId : undefined;
    out[key] = { v: v.v as VerdictChoice["v"], ...(fieldId ? { fieldId } : {}) };
  }
  return out;
}

function sanitizeVerifyLog(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((f): f is string => str(f)).slice(0, 24);
}

function sanitizeIssued(raw: unknown): IssuedDraw[] {
  if (!Array.isArray(raw)) return [];
  const out: IssuedDraw[] = [];
  for (const row of raw) {
    if (out.length >= 40) break;
    if (!isRecord(row)) continue;
    const probe = sanitizeProbe(row.probe);
    if (!probe || !str(row.drawId, DRAW_ID) || !int(row.seq, 1, 4096)) continue;
    out.push({ probe, drawId: row.drawId, seq: row.seq });
  }
  return out;
}

/** Carry server marks verbatim from prior (structurally cleaned). */
function carryServerMarks(raw: unknown): ServerDraftMarks | undefined {
  if (!isRecord(raw)) return undefined;
  return {
    seq: int(raw.seq, 0, 4096) ? raw.seq : 0,
    issued: sanitizeIssued(raw.issued),
    firstDrawSeq: int(raw.firstDrawSeq, 1, 4096) ? raw.firstDrawSeq : null,
  };
}

/**
 * Sanitize a stage draft. `prior` is the stored draft this write replaces —
 * server-managed fields flow only from it. Stage gates which student fields
 * are kept (a C1 draft can't smuggle C3 verdicts).
 */
export function sanitizeAiEvalDraft(
  stageIndex: number,
  raw: unknown,
  prior: AiEvalDraft | undefined,
): AiEvalDraft {
  const src = isRecord(raw) ? raw : {};
  const draft: AiEvalDraft = {
    transcript: sanitizeTranscript(src.transcript),
    ratings: stageIndex === 1 ? sanitizeRatings(src.ratings) : {},
    predictions: stageIndex === 2 ? sanitizePredictions(src.predictions) : {},
    matrix: stageIndex === 2 ? sanitizeMatrix(src.matrix) : {},
    verdicts: stageIndex === 3 ? sanitizeVerdicts(src.verdicts) : {},
    // Server-managed — carried from prior, never from client input.
    verifyLog: sanitizeVerifyLog(prior?.verifyLog),
    predictedAt: prior?.predictedAt ?? null,
    ...(prior?._srv ? { _srv: carryServerMarks(prior._srv) } : {}),
  };
  return draft;
}
