/**
 * ai-eval judge (issue #61 §5). The submission is evidence: every claim is
 * replayed against the same per-user seed, so grading re-derives what the
 * student saw rather than trusting the transcript.
 *
 *  - C1: each rating is checked against the distinct-answer profile of the
 *    draws actually issued; "stable" additionally requires every issued
 *    draw for that question to have been collected (no cherry-picking).
 *  - C2: predictions must have been persisted before the first draw
 *    (`predictedAt < firstDrawSeq`, both server-stamped); the matrix is
 *    replayed at temp 0 and the most-sensitive phrasing dim must be found.
 *  - C3: verdicts form a confusion matrix over planted defects; a "doubt"
 *    verdict is only legal when its cited fieldId went through /verify.
 */

import type { DatabaseSync } from "node:sqlite";
import { truthOf } from "../../../src/features/ai-eval/domain/corpus.ts";
import {
  drawIdOf,
  MATRIX_COLUMNS,
  PHRASING_DIMS,
  type PhrasingDim,
} from "../../../src/features/ai-eval/domain/probe.ts";

import {
  C1_MIN_OBS,
  C1_OBS_FOR_STABLE,
  C2_MIN_ACCURACY,
  C2_MIN_CELLS,
  C2_MIN_DIMS,
  C3_DRAW_COUNT,
  C3_MAX_DEFER,
  C3_MAX_FALSE_FLAG,
  C3_MIN_RECALL,
  RATING_LABELS,
  slotKeyOf,
  VOLATILE_RATIO,
  type AiEvalCategory,
  type AiEvalCounterexample,
  type AiEvalDraft,
  type AiEvalJudgeResult,
  type AiEvalTestSummary,
  type DrawPayload,
  type IssuedDraw,
  type StabilityRating,
  type TranscriptRow,
  type VerdictChoice,
} from "../../../src/features/ai-eval/domain/protocol.ts";
import { sanitizeAiEvalDraft } from "../../../src/features/ai-eval/domain/sanitize.ts";
import {
  aiEvalStageUnlocked,
  getAiEvalStage,
  nextAiEvalStage,
} from "../../../src/features/ai-eval/domain/stages.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";
import { c1Plan, HIDDEN_CORPUS, produceDraw, stageSeedFor } from "./hiddenBank.ts";

/* ------------------------------- helpers ----------------------------- */

type StageGrade = {
  score: number;
  total: number;
  passed: boolean;
  categories: AiEvalCategory[];
  counterexample: AiEvalCounterexample | null;
  degenerate: AiEvalTestSummary["degenerate"];
  error: AiEvalTestSummary["error"];
};

function fail(
  total: number,
  error: StageGrade["error"],
  counterexample: AiEvalCounterexample | null,
): StageGrade {
  return {
    score: 0,
    total,
    passed: false,
    categories: [],
    counterexample,
    degenerate: null,
    error,
  };
}

/**
 * Replays the transcript: every row's drawId must equal the server-side
 * recomputation AND appear in the issued-draws ledger. Returns the issued
 * entry for each row, or null when the transcript is forged.
 */
function replayTranscript(
  seed: number,
  issued: IssuedDraw[],
  transcript: TranscriptRow[],
): IssuedDraw[] | null {
  const byId = new Map(issued.map((i) => [i.drawId, i]));
  const out: IssuedDraw[] = [];
  for (const row of transcript) {
    if (drawIdOf(seed, row.probe) !== row.drawId) return null;
    const entry = byId.get(row.drawId);
    if (!entry) return null;
    if (
      entry.probe.questionId !== row.probe.questionId ||
      entry.probe.k !== row.probe.k ||
      entry.probe.phrasing.join("+") !== row.probe.phrasing.join("+")
    )
      return null;
    out.push(entry);
  }
  return out;
}

/* --------------------------------- C1 --------------------------------- */

type C1Classification = StabilityRating | "unknown";

function classifyDistinct(distinct: number, obs: number): C1Classification {
  if (obs < C1_MIN_OBS) return "unknown";
  if (distinct === 1) return obs >= C1_OBS_FOR_STABLE ? "stable" : "wobbly";
  return distinct / obs >= VOLATILE_RATIO ? "volatile" : "wobbly";
}

function gradeC1(userId: string, seed: number, draft: AiEvalDraft): StageGrade {
  const plan = c1Plan(seed);
  const srv = draft._srv ?? { seq: 0, issued: [], firstDrawSeq: null };

  const replayed = replayTranscript(seed, srv.issued, draft.transcript);
  if (!replayed) return fail(plan.length, "transcript-mismatch", null);

  // Per-question observations: collected rows replayed to draw payloads.
  const obsByQuestion = new Map<string, string[]>();
  const issuedByQuestion = new Map<string, number>();
  for (const i of srv.issued) {
    issuedByQuestion.set(i.probe.questionId, (issuedByQuestion.get(i.probe.questionId) ?? 0) + 1);
  }
  for (const row of draft.transcript) {
    const payload = produceDraw(userId, 1, row.probe);
    if (!payload) return fail(plan.length, "transcript-mismatch", null);
    // Same canonicalization the C1 board shows: sorted fieldId=value pairs.
    const key = slotKeyOf(payload.slots);
    const arr = obsByQuestion.get(row.probe.questionId) ?? [];
    arr.push(key);
    obsByQuestion.set(row.probe.questionId, arr);
  }

  const perItem = plan.map((item) => {
    const obs = obsByQuestion.get(item.question.id) ?? [];
    const distinct = new Set(obs).size;
    const issuedCount = issuedByQuestion.get(item.question.id) ?? 0;
    let computed = classifyDistinct(distinct, obs.length);
    // A "stable" finding additionally needs every issued draw collected —
    // otherwise a lucky identical subset could launder an unstable question.
    if (computed === "stable" && obs.length !== issuedCount) computed = "wobbly";
    const rating = draft.ratings[item.question.id];
    const hit = rating !== undefined && rating === computed;
    return { item, obs: obs.length, distinct, issuedCount, computed, rating, hit };
  });

  // Negatives first (issue §5).
  for (const it of perItem) {
    if (it.rating === "stable" && it.obs < C1_MIN_OBS) {
      return fail(plan.length, "insufficient-observations", {
        kind: "rating",
        itemId: it.item.question.id,
        expected: `≥${C1_MIN_OBS} 次观察`,
        actual: `${it.obs} 次观察`,
      });
    }
  }
  const rated = perItem.filter((i) => i.rating !== undefined);
  if (
    rated.length === plan.length &&
    new Set(perItem.map((i) => i.rating)).size === 1 &&
    new Set(perItem.map((i) => i.computed)).size > 1
  ) {
    return { ...fail(plan.length, null, null), degenerate: "all-same-rating" };
  }

  const score = perItem.filter((i) => i.hit).length;
  const miss = perItem.find((i) => !i.hit);
  const counterexample: AiEvalCounterexample | null = miss
    ? {
        kind: "rating",
        itemId: miss.item.question.id,
        expected: RATING_LABELS[miss.computed === "unknown" ? "wobbly" : miss.computed],
        actual: miss.rating ? RATING_LABELS[miss.rating] : "未判定",
        evidence: {
          answerExcerpt: `收集 ${miss.obs} 条，不同答案 ${miss.distinct} 个`,
        },
      }
    : null;

  return {
    score,
    total: plan.length,
    passed: score >= Math.ceil(plan.length * 0.75),
    categories: [
      {
        name: "稳定度判定",
        passed: score,
        total: plan.length,
      },
    ],
    counterexample,
    degenerate: null,
    error: null,
  };
}

/* --------------------------------- C2 --------------------------------- */

function gradeC2(
  userId: string,
  seed: number,
  draft: AiEvalDraft,
  stored: AiEvalDraft | undefined,
): StageGrade {
  const srv = draft._srv ?? { seq: 0, issued: [], firstDrawSeq: null };

  const replayed = replayTranscript(seed, srv.issued, draft.transcript);
  if (!replayed) return fail(MATRIX_COLUMNS.length, "transcript-mismatch", null);

  // Predictions are graded from the STORED draft — the server's witness of
  // what was on file before the first draw (predictedAt < firstDrawSeq).
  const predictions = stored?.predictions ?? {};
  const predictedAt = stored?.predictedAt ?? null;
  if (predictedAt === null || srv.firstDrawSeq === null || predictedAt >= srv.firstDrawSeq) {
    return fail(PHRASING_DIMS.length, "prediction-after-draw", {
      kind: "prediction",
      itemId: "predictions",
      expected: "先预测再探测",
      actual: "预测晚于首次探测",
    });
  }

  // Structural: repeat-control column + ≥2 dims with ≥2 cells.
  const baseIds = draft.matrix.base ?? [];
  const dimCoverage = PHRASING_DIMS.filter(
    (d) => (draft.matrix[d.id]?.length ?? 0) >= C2_MIN_CELLS,
  );
  if (baseIds.length < C2_MIN_CELLS || dimCoverage.length < C2_MIN_DIMS) {
    return fail(PHRASING_DIMS.length, null, {
      kind: "prediction",
      itemId: "matrix",
      expected: "基准列 ≥2 格，至少 2 个维度各 ≥2 格",
      actual: `基准列 ${baseIds.length} 格，维度覆盖 ${dimCoverage.length}`,
    });
  }

  // Replay the matrix: every drawId must be an issued draw of this question.
  const keyOfDraw = (drawId: string): string | null => {
    const issued = srv.issued.find((i) => i.drawId === drawId);
    if (!issued) return null;
    const payload = produceDraw(userId, 2, issued.probe);
    if (!payload) return null;
    return payload.slots
      .map((s) => `${s.fieldId}=${s.value}`)
      .sort()
      .join(";");
  };
  const baseKeys = baseIds.map(keyOfDraw);
  if (baseKeys.some((k) => k === null))
    return fail(PHRASING_DIMS.length, "transcript-mismatch", null);
  const baseKey = baseKeys[0];
  if (!baseKeys.every((k) => k === baseKey)) {
    // Repeat control disagreed — impossible for real draws at temp 0, so
    // treat as forged matrix cells.
    return fail(PHRASING_DIMS.length, "transcript-mismatch", null);
  }

  const changed = new Map<PhrasingDim, number>();
  for (const dim of PHRASING_DIMS) {
    const cells = draft.matrix[dim.id] ?? [];
    let n = 0;
    for (const id of cells) {
      const k = keyOfDraw(id);
      if (k === null) return fail(PHRASING_DIMS.length, "transcript-mismatch", null);
      if (k !== baseKey) n += 1;
    }
    changed.set(dim.id, n);
  }
  // Most-sensitive dim = argmax changed cells (stable order on ties).
  const argmax = PHRASING_DIMS.reduce((a, b) =>
    (changed.get(b.id) ?? 0) > (changed.get(a.id) ?? 0) ? b : a,
  );

  // Accuracy over the 5 dims: does prediction match observed change?
  // A dim "changed" when its cells differ from base in a majority.
  const actualChange = (dim: PhrasingDim): boolean => {
    const cells = draft.matrix[dim]?.length ?? 0;
    return cells > 0 && (changed.get(dim) ?? 0) > cells / 2;
  };
  let hits = 0;
  for (const dim of PHRASING_DIMS) {
    const predicted = predictions[dim.id] === true;
    if (predicted === actualChange(dim.id)) hits += 1;
  }
  const accuracy = hits / PHRASING_DIMS.length;
  const foundSensitive = predictions[argmax.id] === true && (changed.get(argmax.id) ?? 0) > 0;
  const passed = accuracy >= C2_MIN_ACCURACY && foundSensitive;

  const miss = PHRASING_DIMS.find((d) => (predictions[d.id] === true) !== actualChange(d.id));
  const counterexample: AiEvalCounterexample | null = miss
    ? {
        kind: "prediction",
        itemId: miss.id,
        expected: actualChange(miss.id) ? "答案会变" : "答案不变",
        actual: predictions[miss.id] === true ? "预测会变" : "预测不变",
      }
    : !foundSensitive
      ? {
          kind: "prediction",
          itemId: argmax.id,
          expected: "最敏感维度应预测「会变」",
          actual: "预测不变",
        }
      : null;

  return {
    score: hits,
    total: PHRASING_DIMS.length,
    passed,
    categories: [
      {
        name: "问法敏感度",
        passed: hits,
        total: PHRASING_DIMS.length,
      },
    ],
    counterexample,
    degenerate: null,
    error: null,
  };
}

/* --------------------------------- C3 --------------------------------- */

function gradeC3(userId: string, seed: number, draft: AiEvalDraft): StageGrade {
  const srv = draft._srv ?? { seq: 0, issued: [], firstDrawSeq: null };

  const replayed = replayTranscript(seed, srv.issued, draft.transcript);
  if (!replayed) return fail(C3_DRAW_COUNT, "transcript-mismatch", null);

  const verifyLog = new Set(draft.verifyLog);

  // Ground truth: replay every issued draw and find its defective fields —
  // a fieldId whose claimed value disagrees with the fact table.
  const items: { issued: IssuedDraw; payload: DrawPayload; defects: string[] }[] = [];
  for (const issued of srv.issued) {
    const payload = produceDraw(userId, 3, issued.probe);
    if (!payload) return fail(C3_DRAW_COUNT, "transcript-mismatch", null);
    items.push({
      issued,
      payload,
      defects: payload.slots
        .filter((s) => truthOf(HIDDEN_CORPUS, s.fieldId) !== s.value)
        .map((s) => s.fieldId),
    });
  }

  const verdicts = draft.verdicts;
  for (const drawId of Object.keys(verdicts)) {
    if (!srv.issued.some((i) => i.drawId === drawId)) {
      return fail(items.length, "transcript-mismatch", null);
    }
  }

  let hits = 0;
  let falseFlags = 0;
  let deferrals = 0;
  let defectCount = 0;
  let cleanCount = 0;
  const missed: { drawId: string; fieldId: string; truth: string | null }[] = [];
  const overFlagged: { drawId: string }[] = [];

  const choices = { trust: 0, doubt: 0, human: 0 };

  for (const row of items) {
    const v: VerdictChoice | undefined = verdicts[row.issued.drawId];
    const defective = row.defects.length > 0;
    if (defective) defectCount += 1;
    else cleanCount += 1;

    if (v === undefined || v.v === "human") {
      deferrals += 1;
      if (defective)
        missed.push({ drawId: row.issued.drawId, fieldId: row.defects[0], truth: null });
      continue;
    }
    choices[v.v] += 1;
    if (v.v === "trust") {
      if (defective)
        missed.push({ drawId: row.issued.drawId, fieldId: row.defects[0], truth: null });
      continue;
    }
    // v === "doubt": no fieldId at all is just a miss (issue §5 negatives);
    // a *cited* fieldId must come from /verify, belong to this draw, and
    // disagree with the fact table there — anything else is forged evidence.
    const cited = v.fieldId;
    if (!cited) {
      if (defective)
        missed.push({ drawId: row.issued.drawId, fieldId: row.defects[0], truth: null });
      else {
        falseFlags += 1;
        overFlagged.push({ drawId: row.issued.drawId });
      }
      continue;
    }
    const citedSlot = row.payload.slots.find((s) => s.fieldId === cited);
    if (!verifyLog.has(cited) || !citedSlot) {
      return fail(items.length, "unverified-cite", {
        kind: "verdict",
        itemId: row.issued.drawId,
        expected: "质疑须附本条回答中 /verify 查证的字段",
        actual: cited,
      });
    }
    if (truthOf(HIDDEN_CORPUS, cited) === citedSlot.value) {
      return fail(items.length, "reason-conflict", {
        kind: "verdict",
        itemId: row.issued.drawId,
        expected: "被质疑字段须与事实不符",
        actual: `${cited} 与事实一致`,
        evidence: { factField: { id: cited, value: citedSlot.value } },
      });
    }
    // Legitimate doubt — a hit if the draw is defective, false-flag if clean.
    if (defective) hits += 1;
    else {
      falseFlags += 1;
      overFlagged.push({ drawId: row.issued.drawId });
    }
  }

  const total = items.length;
  // Degenerate labels (checked before thresholds so they stay informative).
  if (choices.trust === total) return { ...fail(total, null, null), degenerate: "all-trust" };
  if (choices.doubt === total) return { ...fail(total, null, null), degenerate: "all-doubt" };
  if (choices.human === total) return { ...fail(total, null, null), degenerate: "all-human" };

  const recall = defectCount === 0 ? 1 : hits / defectCount;
  const falseFlagRate = cleanCount === 0 ? 0 : falseFlags / cleanCount;
  const deferRate = total === 0 ? 0 : deferrals / total;
  const passed =
    recall >= C3_MIN_RECALL && falseFlagRate <= C3_MAX_FALSE_FLAG && deferRate <= C3_MAX_DEFER;

  const miss = missed[0] ?? null;
  const flag = overFlagged[0] ?? null;
  const counterexample: AiEvalCounterexample | null = miss
    ? {
        kind: "verdict",
        itemId: miss.drawId,
        expected: "应质疑（字段与事实不符）",
        actual: "判定为可信/转人工",
        evidence: {
          factField: { id: miss.fieldId, value: truthOf(HIDDEN_CORPUS, miss.fieldId) },
        },
      }
    : flag
      ? {
          kind: "verdict",
          itemId: flag.drawId,
          expected: "应判定可信",
          actual: "误标质疑",
        }
      : null;

  return {
    score: hits + Math.max(0, cleanCount - falseFlags),
    total,
    passed,
    categories: [
      { name: "缺陷召回", passed: hits, total: defectCount },
      { name: "可信不误伤", passed: cleanCount - falseFlags, total: cleanCount },
      { name: "少转人工", passed: total - deferrals, total },
    ],
    counterexample,
    degenerate: null,
    error: null,
  };
}

/* ------------------------------- entrypoint --------------------------- */

export function judgeAiEvalSubmission(
  db: DatabaseSync,
  project: ProjectRow<AiEvalDraft>,
  stageIndex: number,
  rawDraft: unknown,
): AiEvalJudgeResult | LabJudgeError {
  const gated = gateStage(getAiEvalStage(stageIndex), (stage) =>
    aiEvalStageUnlocked(project.passedStages, stage.index),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const stored = project.drafts[String(stageIndex)];
  const draft = sanitizeAiEvalDraft(stageIndex, rawDraft, stored);
  const seed = stageSeedFor(project.userId, stage.index);

  const grade =
    stage.index === 1
      ? gradeC1(project.userId, seed, draft)
      : stage.index === 2
        ? gradeC2(project.userId, seed, draft, stored)
        : gradeC3(project.userId, seed, draft);

  const testSummary: AiEvalTestSummary = {
    categories: grade.categories,
    counterexample: grade.counterexample,
    degenerate: grade.degenerate,
    error: grade.error,
  };

  const result: AiEvalJudgeResult = {
    score: grade.score,
    total: grade.total,
    passed: grade.passed,
    testSummary,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
    unlockedComponent: null,
  };

  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot: draft,
      score: grade.score,
      total: grade.total,
      passed: grade.passed,
      testSummary,
    });
    if (grade.passed) {
      const progress = advanceStage(db, project, stageIndex, nextAiEvalStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
