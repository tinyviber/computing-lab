/**
 * Five-parts judge. Every stage submits data only: stage 1 reports the
 * observed inputs (the walkthrough happened client-side); the question
 * stages send the picked option id. The correct ids AND the per-option
 * feedback live only here — the shipped stage table has neither, so the
 * client bundle never contains a readable answer.
 */

import type { DatabaseSync } from "node:sqlite";
import type {
  FivePartsDraft,
  FivePartsJudgeResult,
} from "../../../src/features/five-parts/domain/protocol.ts";
import {
  fivePartsStageUnlocked,
  getFivePartsStage,
  nextFivePartsStage,
  type FivePartsStageId,
} from "../../../src/features/five-parts/domain/stages.ts";
import { withTransaction } from "../../db/client.ts";
import {
  advanceStage,
  gateStage,
  insertSubmission,
  type LabJudgeError,
  type ProjectRow,
} from "../pipeline.ts";

type AnswerKey = {
  /** Teacher-dashboard label for the check. */
  label: string;
  correct: string;
  /** Feedback per option id. Wrong-pick copy points back to the
   *  observation instead of naming the right answer. */
  feedback: Record<string, string>;
};

/** Server-side only: correct option and feedback for each question page. */
const ANSWER_KEYS: Partial<Record<FivePartsStageId, AnswerKey>> = {
  think: {
    label: "谁指挥运算器？",
    correct: "controller",
    feedback: {
      controller: "正确。控制器负责执行程序并协调各部件，运算器负责实际计算。",
      memory: "再观察一下上一页：哪个部件向运算器发出了计算命令？",
      output: "再观察一下上一页：哪个部件向运算器发出了计算命令？",
    },
  },
  storage: {
    label: "断电后为什么丢了没保存的内容？",
    correct: "ram-cleared",
    feedback: {
      "ram-cleared":
        "正确。没保存的那句只在内存里，内存断电就清空；保存过的内容在外存里，断电也还在。所以写东西要及时保存。",
      "auto-delete":
        "电脑不会挑着删。再写一句先不保存，然后断电：看看那句原本放在哪里，那里断电后变成了什么。",
      "disk-full":
        "外存的空间还很多。再写一句先不保存，然后断电：看看那句原本放在哪里，那里断电后变成了什么。",
    },
  },
  phone: {
    label: "触摸屏是哪一类设备？",
    correct: "both",
    feedback: {
      both: "正确。按快门时，触摸屏把手指的动作交给手机，是输入；显示照片时，它把结果呈现给你，是输出。",
      input: "再看一遍第 4 步：照片拍好以后，是在哪里显示给你看的？",
      output: "再看一遍第 1 步：按下快门时，你的手指点的是哪里？",
    },
  },
};

export function judgeFivePartsSubmission(
  db: DatabaseSync,
  project: ProjectRow<FivePartsDraft>,
  stageIndex: number,
  body: { a?: unknown; b?: unknown; answer?: unknown },
): FivePartsJudgeResult | LabJudgeError {
  const gated = gateStage(getFivePartsStage(stageIndex), (stage) =>
    fivePartsStageUnlocked(project.passedStages, stage.index),
  );
  if ("error" in gated) return gated;
  const stage = gated.stage;

  const parts: FivePartsJudgeResult["parts"] = [];
  let snapshot: Record<string, unknown>;
  let feedback: string | null = null;

  const key = ANSWER_KEYS[stage.id];
  if (!key) {
    // The walkthrough already ran client-side; the submission records which
    // inputs the student observed. Out-of-range digits are a malformed
    // request, not a wrong answer.
    const a = Number(body.a);
    const b = Number(body.b);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 9 || b < 0 || b > 9) {
      return { error: "malformed-inputs", status: 400 };
    }
    snapshot = { a, b };
    parts.push({ id: "observed", label: "完成四步观察", ok: true, detail: null });
  } else {
    const answer = typeof body.answer === "string" ? body.answer : "";
    if (!answer) return { error: "answer-required", status: 400 };
    // Only ids the page actually offers are gradable; anything else is a
    // malformed request rather than a recorded wrong attempt.
    if (!(answer in key.feedback)) return { error: "unknown-option", status: 400 };
    const ok = answer === key.correct;
    feedback = key.feedback[answer];
    snapshot = { answer };
    parts.push({
      id: `${stage.id}-answer`,
      label: key.label,
      ok,
      detail: ok ? null : feedback,
    });
  }

  const passed = parts.every((p) => p.ok);
  const result: FivePartsJudgeResult = {
    passed,
    stageIndex: stage.index,
    feedback,
    parts,
    submissionId: "",
    currentStage: project.currentStage,
    passedStages: project.passedStages,
  };

  // Submission row + progress update commit together.
  withTransaction(db, () => {
    result.submissionId = insertSubmission(db, {
      projectId: project.id,
      userId: project.userId,
      labId: project.labId,
      stageIndex,
      snapshot,
      score: parts.filter((p) => p.ok).length,
      total: parts.length,
      passed,
      testSummary: { parts },
    });
    if (passed) {
      const progress = advanceStage(db, project, stageIndex, nextFivePartsStage);
      result.passedStages = progress.passedStages;
      result.currentStage = progress.currentStage;
    }
  });

  return result;
}
