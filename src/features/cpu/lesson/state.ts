/**
 * Cpu lesson state: which stage, the instruction-row draft per stage, the
 * soft-gate flag, the last public-test sweep and judge verdict. Pure
 * transitions — no React, no network. The machine view's trace is derived
 * data; it lives in the page (recomputed on edit), not in this reducer.
 *
 * Guided stages (issue #70): the draft is normalized through `guidedProgram`
 * — only a stage's editable rows may differ from its prefill, so locked rows
 * and stale longer drafts can't reach the machine. Row edits in free stages
 * retarget numeric JMP/JZ operands so a jump keeps pointing at the same
 * instruction when rows shift.
 */

import type { SaveStatus } from "../../../shared/api/client";
import {
  encodeInstr,
  MAX_PROGRAM_ROWS,
  opOperandMeaning,
  sanitizeProgram,
  sanitizeRow,
  type InstrRow,
  type OpName,
} from "../domain/isa.ts";
import { judgeCase, type CaseVerdict, type CpuCase } from "../domain/machine.ts";
import type { CpuDraft, CpuJudgeResult } from "../domain/protocol.ts";
import {
  cpuStageUnlocked,
  getCpuStage,
  guidedProgram,
  nextCpuStage,
  type CpuStageDef,
} from "../domain/stages.ts";

export type { SaveStatus };

export type PublicRunOutcome = {
  /** One light verdict per public case, in run order. */
  results: {
    name: string;
    category: string;
    passed: boolean;
    reason: CaseVerdict["reason"];
    cyclesUsed: number;
    /** The case's cycle budget — over-budget is a fail even when state is right. */
    cycleBudget: number;
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
  /**
   * Guided stages: promptId → the option index picked correctly, per stage.
   * Sent to the judge as evidence — the server re-checks each pick against
   * the stage's prompts rather than trusting a bare "done" flag.
   */
  guidedAnswers: Record<number, Record<string, number>>;
  /** C4 byte playground: the byte currently dialed in (reset per stage). */
  playgroundByte: number;
  /** Last wrong option pick, for red-marking the button (per stage). */
  wrongPick: { promptId: string; option: number } | null;
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
  | { type: "answer-prompt"; promptId: string; option: number }
  | { type: "set-byte"; value: number }
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

/**
 * Fresh drafts start from the stage's prefill. Guided stages normalize the
 * draft to "prefill + editable slots": a stale or over-long draft can never
 * reshape the fixed program.
 */
export function draftOf(state: CpuLessonState, stageIndex = state.stageIndex): CpuDraft {
  const stage = getCpuStage(stageIndex);
  const raw = state.drafts[stageIndex]?.rows ?? stage?.prefillRows ?? [];
  return { rows: stage?.guided ? guidedProgram(stage, raw) : raw };
}

/** Program rows as the machine sees them — sanitized, ≤16. */
export function programOf(state: CpuLessonState): InstrRow[] {
  return sanitizeProgram(draftOf(state).rows);
}

/** Rows the learner may edit in the current stage (all of them when free). */
export function editableRowSet(state: CpuLessonState): Set<number> {
  const stage = stageOf(state);
  const rows = draftOf(state).rows;
  if (!stage?.guided) return new Set(rows.map((_, i) => i));
  return new Set(stage.guided.editableRows);
}

/** Rows still holding their prefill placeholder — rendered as “待补全”. */
export function blankRowSet(state: CpuLessonState): Set<number> {
  const stage = stageOf(state);
  if (!stage?.guided?.blankRows) return new Set();
  const prefill = stage.prefillRows ?? [];
  const rows = draftOf(state).rows;
  const blank = new Set<number>();
  for (const i of stage.guided.blankRows) {
    const row = rows[i];
    const base = prefill[i];
    if (row && base && row.op === base.op && row.reg === base.reg && row.operand === base.operand) {
      blank.add(i);
    }
  }
  return blank;
}

/** Prompt ids already answered correctly in the current stage. */
export function answeredPromptIds(state: CpuLessonState): Set<string> {
  return new Set(Object.keys(state.guidedAnswers[state.stageIndex] ?? {}));
}

/** Every prompt of a guided stage answered — required before submit. */
export function guidedComplete(state: CpuLessonState): boolean {
  const stage = stageOf(state);
  if (!stage?.guided) return true;
  const answered = answeredPromptIds(state);
  return stage.guided.prompts.every((p) => answered.has(p.id));
}

/** The first unanswered prompt — the one the guide card is asking now. */
export function nextPrompt(state: CpuLessonState) {
  const stage = stageOf(state);
  if (!stage?.guided) return null;
  const answered = answeredPromptIds(state);
  return stage.guided.prompts.find((p) => !answered.has(p.id)) ?? null;
}

/**
 * C4's playground starts on the program's own first byte (LOAD A,M[14] =
 * 00001110) so the byte-224 prompts force a real dial, not a glance at the
 * HALT byte already sitting there.
 */
export function initialPlaygroundByte(stage: CpuStageDef | undefined): number {
  const first = stage?.guided?.bytePlayground ? stage.prefillRows?.[0] : undefined;
  return first ? encodeInstr(first) : 0;
}

export function createCpuLessonState(stageIndex = 1): CpuLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    calculatorCoreComplete: null,
    guidedAnswers: {},
    playgroundByte: initialPlaygroundByte(getCpuStage(stageIndex)),
    wrongPick: null,
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

/**
 * Keep numeric jump targets pointing at the same instruction when rows
 * shift (issue #70 §5.6): operands that reference program rows are remapped;
 * operands pointing at data cells (≥ row count, e.g. self-mod targets) are
 * physical addresses and stay put. Returns the adjusted rows plus the list
 * of retargeted operands for the notice.
 */
function retargetJumps(
  rows: InstrRow[],
  map: (operand: number, rowCount: number) => number,
): { rows: InstrRow[]; changes: { from: number; to: number }[] } {
  const changes: { from: number; to: number }[] = [];
  const out = rows.map((row) => {
    if (opOperandMeaning(row.op) !== "addr") return row;
    const to = map(row.operand, rows.length);
    if (to === row.operand) return row;
    changes.push({ from: row.operand, to });
    return { ...row, operand: to };
  });
  return { rows: out, changes };
}

function retargetNotice(changes: { from: number; to: number }[]): string | null {
  if (changes.length === 0) return null;
  const first = changes[0];
  return changes.length === 1
    ? `目标指令移动：跳转地址 ${first.from} → ${first.to}`
    : `目标指令移动：${first.from} → ${first.to} 等 ${changes.length} 处跳转地址已自动更新`;
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
        playgroundByte: initialPlaygroundByte(getCpuStage(stageIndex)),
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
        playgroundByte: initialPlaygroundByte(getCpuStage(action.stageIndex)),
        judgeOutcome: null,
        runOutcome: null,
        wrongPick: null,
      };
    }

    case "set-row": {
      const stage = stageOf(state);
      if (stage?.guided && !stage.guided.editableRows.includes(action.index)) return state;
      const rows = [...draftOf(state).rows];
      const row = rows[action.index];
      if (!row) return state;
      const patched = sanitizeRow({ ...row, ...action.patch });
      if (!patched) return state;
      rows[action.index] = patched;
      return withDraft(state, { rows });
    }

    case "insert-row": {
      const stage = stageOf(state);
      if (stage?.guided) return state;
      const current = draftOf(state).rows;
      if (current.length >= MAX_PROGRAM_ROWS) return state;
      const at = Math.max(0, Math.min(action.index, current.length));
      const { rows, changes } = retargetJumps(current, (operand, oldLen) =>
        operand >= at && operand < oldLen ? operand + 1 : operand,
      );
      rows.splice(at, 0, { op: "LOAD", reg: 0, operand: 0 });
      const next = withDraft(state, { rows });
      const notice = retargetNotice(changes);
      return notice ? { ...next, message: notice } : next;
    }

    case "remove-row": {
      const stage = stageOf(state);
      if (stage?.guided) return state;
      const current = draftOf(state).rows;
      if (action.index < 0 || action.index >= current.length) return state;
      // A jump that targets the deleted row lands on the instruction that
      // slides into its slot — keep the address but say so, never silently.
      const targetHits = current.filter(
        (row) => opOperandMeaning(row.op) === "addr" && row.operand === action.index,
      ).length;
      const { rows, changes } = retargetJumps(current, (operand, oldLen) =>
        operand > action.index && operand < oldLen ? operand - 1 : operand,
      );
      rows.splice(action.index, 1);
      const next = withDraft(state, { rows });
      const notices = [
        targetHits > 0
          ? `第 ${action.index} 行是 ${targetHits} 处跳转的目标——已删除，这些跳转现在指向原目标的下一行`
          : null,
        retargetNotice(changes),
      ].filter((n): n is string => n !== null);
      return notices.length > 0 ? { ...next, message: notices.join("；") } : next;
    }

    case "move-row": {
      const stage = stageOf(state);
      if (stage?.guided) return state;
      const current = draftOf(state).rows;
      const to = action.index + action.dir;
      if (action.index < 0 || action.index >= current.length || to < 0 || to >= current.length) {
        return state;
      }
      const { rows, changes } = retargetJumps(current, (operand) =>
        operand === action.index ? to : operand === to ? action.index : operand,
      );
      [rows[action.index], rows[to]] = [rows[to], rows[action.index]];
      const next = withDraft(state, { rows });
      const notice = retargetNotice(changes);
      return notice ? { ...next, message: notice } : next;
    }

    case "answer-prompt": {
      const stage = stageOf(state);
      const prompt = stage?.guided?.prompts.find((p) => p.id === action.promptId);
      if (!stage?.guided || !prompt) return state;
      const option = prompt.options[action.option];
      if (!option) return state;
      // A byte-gated prompt stays shut until the playground byte is dialed.
      if (prompt.requiresByte !== undefined && state.playgroundByte !== prompt.requiresByte) {
        return state;
      }
      if (!option.correct) {
        return { ...state, wrongPick: { promptId: action.promptId, option: action.option } };
      }
      const answered = state.guidedAnswers[state.stageIndex] ?? {};
      if (action.promptId in answered) return state;
      return {
        ...state,
        guidedAnswers: {
          ...state.guidedAnswers,
          [state.stageIndex]: { ...answered, [action.promptId]: action.option },
        },
        wrongPick: null,
      };
    }

    case "set-byte": {
      return { ...state, playgroundByte: action.value & 0xff };
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
          results: verdicts.map((v, i) => ({
            name: v.name,
            category: v.category,
            passed: v.passed,
            reason: v.reason,
            cyclesUsed: v.cyclesUsed,
            cycleBudget: action.cases[i].expect.cycles,
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
