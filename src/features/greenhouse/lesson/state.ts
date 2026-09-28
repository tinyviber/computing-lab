/**
 * Greenhouse lesson state: which stage, the draft per stage, the last
 * sandbox preview run, the last judge verdict, and save status. Pure
 * transitions — no React, no network.
 *
 * Unlike is-sim, an edit does NOT clear `runOutcome`: the preview curve
 * stays visible but greys out under「参数已改需重跑」until the next
 * 试运行, so the draft snapshot it was produced from travels with it.
 *
 * Copy-forward: entering stage n with no draft materializes a deep copy
 * of stage n−1's `rules` into drafts[n] — the table carries forward so
 * the dead-band stage starts from the student's own working rules. A
 * previous stage without rules (C1's setpoint draft) doesn't carry; the
 * stage's own `prefill` applies instead. Existing drafts are never
 * overwritten.
 */

import type { SaveStatus } from "../../../shared/api/client.ts";
import type { GhCase, GhDraft, GhJudgeResult } from "../domain/protocol.ts";
import { GLOBAL_LIMITS, clampSetpoint, sanitizeRules, type RuleRow } from "../domain/rules.ts";
import type { SimRun } from "../domain/simulate.ts";
import { getGhStage, greenhouseStageUnlocked, type GhStageDef } from "../domain/stages.ts";
import { judgeCase, type GhVerdict } from "./scenario.ts";

export type { SaveStatus };

/** The last「试运行」run, pinned to the draft + case it was produced from. */
export type GhRunOutcome = {
  caseName: string;
  /** JSON snapshot of the draft at run time — a dirty editor greys the curve. */
  draftJson: string;
  run: SimRun;
  verdict: GhVerdict;
};

export type GhLabState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, GhDraft>;
  runOutcome: GhRunOutcome | null;
  judgeOutcome: GhJudgeResult | null;
  saveStatus: SaveStatus;
  message: string | null;
};

export type GhLabAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, GhDraft>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-setpoint"; setpoint: number }
  | { type: "set-rules"; rules: RuleRow[] }
  | { type: "reset-draft" }
  | { type: "run-preview"; testCase: GhCase }
  | { type: "judge-result"; outcome: GhJudgeResult }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function stageOf(state: GhLabState): GhStageDef | undefined {
  return getGhStage(state.stageIndex);
}

export function isStageUnlocked(state: GhLabState, stageIndex: number): boolean {
  return greenhouseStageUnlocked(state.passedStages, stageIndex);
}

/** Fresh drafts start from the stage's prefill furniture. */
export function draftOf(state: GhLabState, stageIndex = state.stageIndex): GhDraft {
  const stored = state.drafts[stageIndex];
  if (stored) return structuredClone(stored);
  const prefill = getGhStage(stageIndex)?.prefill;
  return prefill ? structuredClone(prefill) : {};
}

export function createGhLabState(stageIndex = 1): GhLabState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    runOutcome: null,
    judgeOutcome: null,
    saveStatus: "idle",
    message: null,
  };
}

/**
 * Bound a restored draft at the domain edge; junk fields drop to defaults.
 * Stage-specific palettes are enforced later in `rulesForStage`; this
 * global pass drops anything no stage could ever accept.
 */
export function sanitizeDraft(raw: unknown): GhDraft {
  if (typeof raw !== "object" || raw === null) return {};
  const candidate = raw as Record<string, unknown>;
  const out: GhDraft = {};
  if (candidate.setpoint !== undefined) out.setpoint = clampSetpoint(candidate.setpoint);
  if (candidate.rules !== undefined) out.rules = sanitizeRules(candidate.rules, GLOBAL_LIMITS);
  return out;
}

function withDraft(state: GhLabState, draft: GhDraft): GhLabState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: draft },
    saveStatus: "dirty",
    // A new draft invalidates the last verdict; the preview stays (stale).
    judgeOutcome: null,
  };
}

/** Copy stage n−1's rules into stage n's empty draft, if any. */
function withCopyForward(state: GhLabState, stageIndex: number): GhLabState {
  if (state.drafts[stageIndex] !== undefined) return state;
  const prev = state.drafts[stageIndex - 1];
  if (!prev?.rules || prev.rules.length === 0) return state;
  return {
    ...state,
    drafts: { ...state.drafts, [stageIndex]: { rules: structuredClone(prev.rules) } },
    saveStatus: "dirty",
  };
}

export function transitionGhLab(state: GhLabState, action: GhLabAction): GhLabState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, GhDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        drafts[Number(key)] = sanitizeDraft(draft);
      }
      // Resume where the server's mainline pointer says, provided it's
      // still unlocked.
      const stageIndex = greenhouseStageUnlocked(action.passedStages, action.currentStage)
        ? action.currentStage
        : greenhouseStageUnlocked(action.passedStages, state.stageIndex)
          ? state.stageIndex
          : 1;
      return withCopyForward(
        {
          ...state,
          stageIndex,
          currentStage: action.currentStage,
          passedStages: action.passedStages,
          drafts,
          saveStatus: "idle",
          judgeOutcome: null,
          runOutcome: null,
        },
        stageIndex,
      );
    }

    case "select-stage": {
      if (!isStageUnlocked(state, action.stageIndex)) return state;
      return withCopyForward(
        {
          ...state,
          stageIndex: action.stageIndex,
          judgeOutcome: null,
          runOutcome: null,
        },
        action.stageIndex,
      );
    }

    case "set-setpoint": {
      const draft = { ...draftOf(state), setpoint: clampSetpoint(action.setpoint) };
      return withDraft(state, draft);
    }

    case "set-rules": {
      const stage = stageOf(state);
      const draft = {
        ...draftOf(state),
        rules: stage
          ? sanitizeRules(action.rules, {
              maxRules: stage.maxRules,
              sensors: stage.sensors,
              actuators: stage.actuators,
            })
          : sanitizeRules(action.rules, GLOBAL_LIMITS),
      };
      return withDraft(state, draft);
    }

    case "reset-draft": {
      const drafts = { ...state.drafts };
      delete drafts[state.stageIndex];
      return {
        ...state,
        drafts,
        saveStatus: "dirty",
        runOutcome: null,
        judgeOutcome: null,
        message: "草稿已重置为本关初始内容。",
      };
    }

    case "run-preview": {
      const stage = stageOf(state);
      if (!stage) return state;
      const draft = draftOf(state);
      const verdict = judgeCase(draft, stage, action.testCase);
      return {
        ...state,
        runOutcome: {
          caseName: action.testCase.name,
          draftJson: JSON.stringify(draft),
          run: verdict.run,
          verdict,
        },
      };
    }

    case "judge-result": {
      return {
        ...state,
        judgeOutcome: action.outcome,
        passedStages: action.outcome.passedStages,
        currentStage: action.outcome.currentStage,
        message: action.outcome.passed ? "判定通过，已解锁下一关。" : null,
      };
    }

    case "mark-saving":
      return { ...state, saveStatus: "saving" };
    case "mark-saved":
      return { ...state, saveStatus: state.saveStatus === "saving" ? "saved" : state.saveStatus };
    case "mark-save-error":
      return { ...state, saveStatus: state.saveStatus === "saving" ? "error" : state.saveStatus };
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}
