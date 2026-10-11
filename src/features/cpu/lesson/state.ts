/**
 * Cpu lesson state: which stage, the instruction-row draft per stage, the
 * soft-gate flag, the last public-test sweep and judge verdict. Pure
 * transitions — no React, no network. The machine view's trace is derived
 * data; it lives in the controller (recomputed on edit), not in this reducer.
 *
 * Guided stages (issue #70): the draft is normalized through `guidedProgram`
 * — only a stage's editable rows may differ from its prefill, so locked rows
 * and stale longer drafts can't reach the machine. Row edits in free stages
 * retarget numeric JMP/JZ operands so a jump keeps pointing at the same
 * instruction when rows shift.
 */

import type { SaveStatus } from "../../../shared/api/client";
import {
  markSaveStatus,
  statusForStage,
  type SaveStatusByStage,
} from "../../../shared/lab/saveStatus.ts";
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
  /** The local drafts a save conflict replaced — kept so the learner can
   *  restore their unsaved version explicitly after reconciling. */
  conflictedLocalDrafts: Record<number, CpuDraft>;
  /** Server-assigned revision of each stage's latest applied write — the
   *  next autosave for that stage sends it back as `expectedRevision`. */
  draftRevisions: Record<number, number>;
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
  saveStatusByStage: SaveStatusByStage;
  message: string | null;
  /**
   * Bumped on every draft edit — the machine view keys playback by it, so
   * ANY program change starts a fresh walk (even an edit that lands back on
   * identical text; a content-keyed cache would resurrect the old run).
   */
  editRevision: number;
};

export type CpuLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, CpuDraft>;
      /** Server revisions of the applied drafts, seeded into expectedRevision. */
      draftRevisions?: Record<number, number>;
      calculatorCoreComplete: boolean;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-row"; index: number; patch: { op?: OpName; reg?: 0 | 1; operand?: number } }
  | { type: "insert-row"; index: number }
  | { type: "remove-row"; index: number }
  | { type: "move-row"; index: number; dir: -1 | 1 }
  | { type: "answer-prompt"; stageIndex?: number; promptId: string; option: number }
  | { type: "set-byte"; value: number }
  | { type: "run-public-tests"; cases: CpuCase[] }
  | { type: "judge-result"; outcome: CpuJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-conflict"; stageIndex: number }
  | {
      type: "resolve-save-conflict";
      stageIndex: number;
      /** The draft the server holds for the stage; absent → the stage's empty draft. */
      draft?: CpuDraft;
      /** Server revision now stored for the stage — seeds the next save. */
      revision?: number;
    }
  | { type: "restore-conflict-draft"; stageIndex: number }
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
 * M2's byte observer starts on the program's own first byte (LOAD A,M[11] =
 * 0b00001011 = 11) so the learner sees a byte that also decodes, not 0.
 * `requiresByte` prompts still force a real dial from there.
 */
export function initialPlaygroundByte(stage: CpuStageDef | undefined): number {
  const row = stage?.guided?.bytePlayground ? stage.prefillRows?.[0] : undefined;
  return row ? encodeInstr(row) : 0;
}

export function createCpuLessonState(stageIndex = 1): CpuLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    conflictedLocalDrafts: {},
    draftRevisions: {},
    calculatorCoreComplete: null,
    guidedAnswers: {},
    playgroundByte: initialPlaygroundByte(getCpuStage(stageIndex)),
    wrongPick: null,
    runOutcome: null,
    judgeOutcome: null,
    saveStatusByStage: {},
    message: null,
    editRevision: 0,
  };
}

function withDraft(state: CpuLessonState, draft: CpuDraft): CpuLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: draft },
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
    // A new program invalidates previous verdicts.
    runOutcome: null,
    judgeOutcome: null,
    editRevision: state.editRevision + 1,
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
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        draftRevisions[Number(key)] = rev;
      }
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
        conflictedLocalDrafts: {},
        draftRevisions,
        calculatorCoreComplete: action.calculatorCoreComplete,
        saveStatusByStage: {},
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
      if (action.stageIndex !== undefined && action.stageIndex !== state.stageIndex) return state;
      const stage = stageOf(state);
      const prompt = stage?.guided?.prompts.find((p) => p.id === action.promptId);
      if (!stage?.guided || !prompt) return state;
      const option = prompt.options[action.option];
      if (!option) return state;
      // A byte-gated prompt stays shut until the playground byte is dialed.
      if (prompt.requiresByte !== undefined && state.playgroundByte !== prompt.requiresByte) {
        return state;
      }
      const answered = state.guidedAnswers[state.stageIndex] ?? {};
      if (action.promptId in answered) return state;
      if (!option.correct) {
        return {
          ...state,
          wrongPick: { promptId: action.promptId, option: action.option },
        };
      }
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
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
      };
    case "mark-saved": {
      // Only a save started from the stage's current dirty state may settle it.
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      // A fresh applied write supersedes any conflict backup for the stage.
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      return {
        ...state,
        conflictedLocalDrafts,
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved"),
      };
    }
    case "mark-save-error":
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "error"),
      };

    case "mark-save-conflict": {
      // "saving" is the write that was refused; "dirty" means the learner
      // edited past it — the conflict still lands so it stays visible.
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
      };
    }

    case "resolve-save-conflict": {
      // Per-stage reconcile after a refused write: swap ONLY the conflicted
      // stage's draft for the server's copy and land its conflict flag in the
      // same transition — every other stage's local draft and save flag is
      // left untouched. The replaced local draft is stashed in
      // conflictedLocalDrafts so the learner can still recover it. Settles
      // while the stage waits on its save — and on a dirty flag too: a
      // fenced stage cannot retry its own save, so the reconcile must still
      // land (the stash keeps those newer edits recoverable the same way).
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty") return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      const localDraft = state.drafts[action.stageIndex];
      if (localDraft !== undefined) conflictedLocalDrafts[action.stageIndex] = localDraft;
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: sanitizeDraft(action.draft ?? {}) },
        conflictedLocalDrafts,
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
        wrongPick: action.stageIndex === state.stageIndex ? null : state.wrongPick,
        judgeOutcome: action.stageIndex === state.stageIndex ? null : state.judgeOutcome,
        runOutcome: action.stageIndex === state.stageIndex ? null : state.runOutcome,
        // Replaced program on screen → fresh playback revision.
        editRevision:
          action.stageIndex === state.stageIndex ? state.editRevision + 1 : state.editRevision,
      };
    }

    case "restore-conflict-draft": {
      // The learner explicitly keeps their pre-conflict version: it returns
      // as a dirty draft and autosave re-arms — expectedRevision is now the
      // reconciled server revision, so the write supersedes legitimately
      // (or loses OCC to an even newer write → a fresh conflict).
      const backup = state.conflictedLocalDrafts[action.stageIndex];
      if (backup === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      const isCurrent = action.stageIndex === state.stageIndex;
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: backup },
        conflictedLocalDrafts,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
        wrongPick: isCurrent ? null : state.wrongPick,
        judgeOutcome: isCurrent ? null : state.judgeOutcome,
        runOutcome: isCurrent ? null : state.runOutcome,
        // Restored program on screen → fresh playback revision.
        editRevision: isCurrent ? state.editRevision + 1 : state.editRevision,
      };
    }
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
