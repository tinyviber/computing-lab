/**
 * Cpu lesson state: which stage, the instruction-row draft per stage, the
 * soft-gate flag, the last public-test sweep and judge verdict. Pure
 * transitions — no React, no network. The machine view's trace is derived
 * data; it lives in the page (recomputed on edit), not in this reducer.
 */

import type { SaveStatus } from "../../../shared/api/client";
import {
  MAX_PROGRAM_ROWS,
  sanitizeProgram,
  sanitizeRow,
  type InstrRow,
  type OpName,
} from "../domain/isa.ts";
import { judgeCase, type CaseVerdict, type CpuCase } from "../domain/machine.ts";
import type { CpuDraft, CpuJudgeResult } from "../domain/protocol.ts";
import { cpuStageUnlocked, getCpuStage, nextCpuStage, type CpuStageDef } from "../domain/stages.ts";

export type { SaveStatus };

export type PublicRunOutcome = {
  /** One light verdict per public case, in run order. */
  results: {
    name: string;
    category: string;
    passed: boolean;
    reason: CaseVerdict["reason"];
    cyclesUsed: number;
    memDiff: CaseVerdict["memDiff"];
    regDiff: CaseVerdict["regDiff"];
    branchMismatch: boolean;
    selfModMissing: boolean;
  }[];
  score: number;
  total: number;
};

export type CpuLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, CpuDraft>;
  /** Soft gate: false → show the calculator-first banner (never blocks). */
  calculatorCoreComplete: boolean | null;
  runOutcome: PublicRunOutcome | null;
  judgeOutcome: CpuJudgeResult | null;
  saveStatus: SaveStatus;
  message: string | null;
};

export type CpuLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, CpuDraft>;
      calculatorCoreComplete: boolean;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-row"; index: number; patch: { op?: OpName; reg?: 0 | 1; operand?: number } }
  | { type: "insert-row"; index: number }
  | { type: "remove-row"; index: number }
  | { type: "move-row"; index: number; dir: -1 | 1 }
  | { type: "run-public-tests"; cases: CpuCase[] }
  | { type: "judge-result"; outcome: CpuJudgeResult }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function stageOf(state: CpuLessonState): CpuStageDef | undefined {
  return getCpuStage(state.stageIndex);
}

export function isStageUnlocked(state: CpuLessonState, stageIndex: number): boolean {
  return cpuStageUnlocked(state.passedStages, stageIndex);
}

/** Fresh drafts start from the stage's prefill (C1 ships the first row). */
export function draftOf(state: CpuLessonState, stageIndex = state.stageIndex): CpuDraft {
  return state.drafts[stageIndex] ?? { rows: [...(getCpuStage(stageIndex)?.prefillRows ?? [])] };
}

/** Program rows as the machine sees them — sanitized, ≤16. */
export function programOf(state: CpuLessonState): InstrRow[] {
  return sanitizeProgram(draftOf(state).rows);
}

export function createCpuLessonState(stageIndex = 1): CpuLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    calculatorCoreComplete: null,
    runOutcome: null,
    judgeOutcome: null,
    saveStatus: "idle",
    message: null,
  };
}

function withDraft(state: CpuLessonState, draft: CpuDraft): CpuLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: draft },
    saveStatus: "dirty",
    // A new program invalidates previous verdicts.
    runOutcome: null,
    judgeOutcome: null,
  };
}

export function transitionCpuLesson(
  state: CpuLessonState,
  action: CpuLessonAction,
): CpuLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, CpuDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        drafts[Number(key)] = sanitizeDraft(draft);
      }
      // Resume where the server's mainline pointer says, provided it's still
      // unlocked (a challenge can sit ahead of it in the rail).
      const stageIndex = cpuStageUnlocked(action.passedStages, action.currentStage)
        ? action.currentStage
        : cpuStageUnlocked(action.passedStages, state.stageIndex)
          ? state.stageIndex
          : 1;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        calculatorCoreComplete: action.calculatorCoreComplete,
        saveStatus: "idle",
        judgeOutcome: null,
        runOutcome: null,
      };
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return {
        ...state,
        stageIndex: action.stageIndex,
        judgeOutcome: null,
        runOutcome: null,
      };
    }

    case "set-row": {
      const rows = [...draftOf(state).rows];
      const row = rows[action.index];
      if (!row) return state;
      const patched = sanitizeRow({ ...row, ...action.patch });
      if (!patched) return state;
      rows[action.index] = patched;
      return withDraft(state, { rows });
    }

    case "insert-row": {
      const rows = [...draftOf(state).rows];
      if (rows.length >= MAX_PROGRAM_ROWS) return state;
      const at = Math.max(0, Math.min(action.index, rows.length));
      rows.splice(at, 0, { op: "LOAD", reg: 0, operand: 0 });
      return withDraft(state, { rows });
    }

    case "remove-row": {
      const rows = [...draftOf(state).rows];
      if (action.index < 0 || action.index >= rows.length) return state;
      rows.splice(action.index, 1);
      return withDraft(state, { rows });
    }

    case "move-row": {
      const rows = [...draftOf(state).rows];
      const to = action.index + action.dir;
      if (action.index < 0 || action.index >= rows.length || to < 0 || to >= rows.length) {
        return state;
      }
      [rows[action.index], rows[to]] = [rows[to], rows[action.index]];
      return withDraft(state, { rows });
    }

    case "run-public-tests": {
      const stage = stageOf(state);
      if (!stage) return state;
      const rows = programOf(state);
      const verdicts = action.cases.map((testCase) =>
        judgeCase(rows, testCase, {
          scratchCells: stage.scratchCells,
          maxCycles: stage.maxCycles,
          requireSelfModFetch: stage.requireSelfModFetch,
        }),
      );
      const score = verdicts.filter((v) => v.passed).length;
      return {
        ...state,
        runOutcome: {
          results: verdicts.map((v) => ({
            name: v.name,
            category: v.category,
            passed: v.passed,
            reason: v.reason,
            cyclesUsed: v.cyclesUsed,
            memDiff: v.memDiff,
            regDiff: v.regDiff,
            branchMismatch: v.branchMismatch,
            selfModMissing: v.selfModMissing,
          })),
          score,
          total: verdicts.length,
        },
      };
    }

    case "judge-result": {
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: nextCpuStage(action.outcome.passedStages),
      };
    }

    case "mark-saving":
      return { ...state, saveStatus: "saving" };
    case "mark-saved":
      // Only a save started from the current dirty state may settle it.
      return { ...state, saveStatus: state.saveStatus === "saving" ? "saved" : state.saveStatus };
    case "mark-save-error":
      return { ...state, saveStatus: state.saveStatus === "saving" ? "error" : state.saveStatus };
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}

/** Bound a restored draft at the domain edge; junk fields drop to defaults. */
export function sanitizeDraft(raw: unknown): CpuDraft {
  if (!raw || typeof raw !== "object") return { rows: [] };
  return { rows: sanitizeProgram((raw as { rows?: unknown }).rows) };
}
