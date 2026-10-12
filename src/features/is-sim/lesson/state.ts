/**
 * Is-sim lesson state: which stage, the topology draft per stage, the
 * last public-test sweep and judge verdict. Pure transitions — no React,
 * no network. The sim's run view is derived data; it lives in the page
 * (recomputed on edit), not in this reducer.
 *
 * Draft edits keep the sanitize layer hot: every action writes back a
 * fully sanitized topology so what the student builds is always inside
 * the domain contract (≤8 devices, one driver per in-port, clamped
 * params).
 */

import type { SaveStatus } from "../../../shared/api/client";
import {
  markSaveStatus,
  markSyncConflict,
  statusForStage,
  type SaveStatusByStage,
  type SyncConflictByStage,
} from "../../../shared/lab/saveStatus.ts";
import {
  defaultParamsFor,
  firstFreeSlot,
  MAX_DEVICES,
  NODE_KINDS,
  NODE_PARAMS,
  NODE_PORTS,
  sanitizeTopology,
  type IsLink,
  type IsNodeKind,
  type IsNodeParams,
  type IsTopology,
} from "../domain/model.ts";
import type { IsDraft, IsJudgeResult } from "../domain/protocol.ts";
import { judgeCase, type IsCase, type IsVerdict } from "../domain/scenario.ts";
import {
  getIsStage,
  isSimStageUnlocked,
  nextIsSimStage,
  type IsStageDef,
} from "../domain/stages.ts";

export type { SaveStatus };

export type PublicRunOutcome = {
  /** One light verdict per public case, in run order. */
  results: {
    name: string;
    category: string;
    passed: boolean;
    reason: IsVerdict["reason"];
    eventsUsed: number;
    eventBudget: number;
  }[];
  score: number;
  total: number;
};

export type IsLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, IsDraft>;
  /** The local drafts a save conflict replaced — kept so the learner can
   *  restore their unsaved version explicitly after reconciling. */
  conflictedLocalDrafts: Record<number, IsDraft>;
  /** Server-assigned revision of each stage's latest applied write — the
   *  next autosave for that stage sends it back as `expectedRevision`. */
  draftRevisions: Record<number, number>;
  runOutcome: PublicRunOutcome | null;
  judgeOutcome: IsJudgeResult | null;
  saveStatusByStage: SaveStatusByStage;
  /** Stages with an unreconciled sync-error — the retry stays visible
   *  while set, even after further edits flip the save flag to dirty. */
  unresolvedSyncConflicts: SyncConflictByStage;
  message: string | null;
};

export type IsLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, IsDraft>;
      /** Server revisions of the applied drafts, seeded into expectedRevision. */
      draftRevisions?: Record<number, number>;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "add-node"; kind: IsNodeKind }
  | { type: "remove-node"; nodeId: string }
  | { type: "set-node-label"; nodeId: string; label: string }
  | { type: "set-node-param"; nodeId: string; key: keyof IsNodeParams; value: number }
  | { type: "add-link"; link: IsLink }
  | { type: "remove-link"; link: IsLink }
  | { type: "reset-draft" }
  | { type: "run-public-tests"; cases: IsCase[] }
  | { type: "judge-result"; outcome: IsJudgeResult }
  | { type: "mark-saving"; stageIndex: number }
  | { type: "mark-saved"; stageIndex: number; revision?: number }
  | { type: "mark-save-error"; stageIndex: number }
  | { type: "mark-save-sync-error"; stageIndex: number }
  | {
      type: "resolve-save-conflict";
      stageIndex: number;
      /** The draft the server holds for the stage; absent → the stage's empty draft. */
      draft?: IsDraft;
      /** Server revision now stored for the stage — seeds the next save. */
      revision?: number;
    }
  | { type: "restore-conflict-draft"; stageIndex: number }
  | { type: "discard-conflict-draft"; stageIndex: number }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function stageOf(state: IsLessonState): IsStageDef | undefined {
  return getIsStage(state.stageIndex);
}

export function isStageUnlocked(state: IsLessonState, stageIndex: number): boolean {
  return isSimStageUnlocked(state.passedStages, stageIndex);
}

/** Fresh drafts start from the stage's prefill furniture. */
export function draftOf(state: IsLessonState, stageIndex = state.stageIndex): IsDraft {
  const stored = state.drafts[stageIndex];
  if (stored) return stored;
  const prefill = getIsStage(stageIndex)?.prefill;
  return prefill
    ? {
        nodes: prefill.nodes.map((n) => ({ ...n, params: { ...n.params } })),
        links: [...prefill.links],
      }
    : { nodes: [], links: [] };
}

/** The topology as the simulator sees it — sanitized, ≤8 devices. */
export function topologyOf(state: IsLessonState): IsTopology {
  return sanitizeTopology(draftOf(state));
}

export function createIsLessonState(stageIndex = 1): IsLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    conflictedLocalDrafts: {},
    draftRevisions: {},
    runOutcome: null,
    judgeOutcome: null,
    saveStatusByStage: {},
    unresolvedSyncConflicts: {},
    message: null,
  };
}

/** Bound a restored draft at the domain edge; junk fields drop to defaults. */
export function sanitizeDraft(raw: unknown): IsDraft {
  return sanitizeTopology(raw);
}

function withDraft(state: IsLessonState, draft: IsDraft): IsLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: sanitizeTopology(draft) },
    saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
    // A new topology invalidates previous verdicts.
    runOutcome: null,
    judgeOutcome: null,
  };
}

function nextFreeNodeId(draft: IsDraft, kind: IsNodeKind): string {
  const used = new Set(draft.nodes.map((n) => n.id));
  for (let i = 1; i <= 99; i += 1) {
    const id = `${kind}-${i}`;
    if (!used.has(id)) return id;
  }
  return `${kind}-${draft.nodes.length + 1}`;
}

export function transitionIsLesson(state: IsLessonState, action: IsLessonAction): IsLessonState {
  switch (action.type) {
    case "load-project": {
      const draftRevisions: Record<number, number> = {};
      for (const [key, rev] of Object.entries(action.draftRevisions ?? {})) {
        draftRevisions[Number(key)] = rev;
      }
      const drafts: Record<number, IsDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        drafts[Number(key)] = sanitizeDraft(draft);
      }
      // Resume where the server's mainline pointer says, provided it's still
      // unlocked (a challenge can sit ahead of it in the rail).
      const stageIndex = isSimStageUnlocked(action.passedStages, action.currentStage)
        ? action.currentStage
        : isSimStageUnlocked(action.passedStages, state.stageIndex)
          ? state.stageIndex
          : 1;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        conflictedLocalDrafts: {},
        draftRevisions,
        saveStatusByStage: {},
        unresolvedSyncConflicts: {},
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

    case "add-node": {
      const stage = stageOf(state);
      const draft = draftOf(state);
      if (!stage || !stage.devices.includes(action.kind)) return state;
      if (draft.nodes.length >= stage.maxDevices || draft.nodes.length >= MAX_DEVICES) return state;
      const slot = firstFreeSlot(draft);
      const node = {
        id: nextFreeNodeId(draft, action.kind),
        kind: action.kind,
        label: "",
        x: slot.x,
        y: slot.y,
        fixed: false,
        params: defaultParamsFor(action.kind),
      };
      return withDraft(state, { ...draft, nodes: [...draft.nodes, node] });
    }

    case "remove-node": {
      const draft = draftOf(state);
      const node = draft.nodes.find((n) => n.id === action.nodeId);
      if (!node || node.fixed) return state;
      return withDraft(state, {
        nodes: draft.nodes.filter((n) => n.id !== action.nodeId),
        links: draft.links.filter((l) => l.from !== action.nodeId && l.to !== action.nodeId),
      });
    }

    case "set-node-label": {
      const draft = draftOf(state);
      const nodes = draft.nodes.map((n) =>
        n.id === action.nodeId ? { ...n, label: action.label } : n,
      );
      return withDraft(state, { ...draft, nodes });
    }

    case "set-node-param": {
      const draft = draftOf(state);
      const node = draft.nodes.find((n) => n.id === action.nodeId);
      if (!node || node.fixedParams) return state;
      if (!NODE_PARAMS[node.kind].some((spec) => spec.key === action.key)) return state;
      const nodes = draft.nodes.map((n) =>
        n.id === action.nodeId ? { ...n, params: { ...n.params, [action.key]: action.value } } : n,
      );
      return withDraft(state, { ...draft, nodes });
    }

    case "add-link": {
      const draft = draftOf(state);
      const from = draft.nodes.find((n) => n.id === action.link.from);
      const to = draft.nodes.find((n) => n.id === action.link.to);
      if (!from || !to || from.id === to.id) return state;
      if (!NODE_KINDS.includes(from.kind) || NODE_PORTS[from.kind].out.length === 0) return state;
      if (!NODE_PORTS[to.kind].in.includes(action.link.port)) return state;
      // One driver per in-port: a new wire replaces the previous one.
      const links = draft.links.filter(
        (l) => !(l.to === action.link.to && l.port === action.link.port),
      );
      return withDraft(state, { ...draft, links: [...links, { ...action.link }] });
    }

    case "remove-link": {
      const draft = draftOf(state);
      return withDraft(state, {
        ...draft,
        links: draft.links.filter(
          (l) =>
            !(
              l.from === action.link.from &&
              l.to === action.link.to &&
              l.port === action.link.port
            ),
        ),
      });
    }

    case "reset-draft": {
      const drafts = { ...state.drafts };
      delete drafts[state.stageIndex];
      return {
        ...state,
        drafts,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, state.stageIndex, "dirty"),
        runOutcome: null,
        judgeOutcome: null,
      };
    }

    case "run-public-tests": {
      const stage = stageOf(state);
      if (!stage) return state;
      const topology = topologyOf(state);
      const verdicts = action.cases.map((testCase) =>
        judgeCase(topology, testCase, stage.maxEvents),
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
            eventsUsed: v.eventsUsed,
            eventBudget: action.cases[i].expect.events,
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
        currentStage: nextIsSimStage(action.outcome.passedStages),
      };
    }

    case "mark-saving":
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "saving"),
      };
    case "mark-saved": {
      if (statusForStage(state.saveStatusByStage, action.stageIndex) !== "saving") return state;
      // A saved write does NOT drop the stage's conflict backup — the
      // recoverable local copy stays until the learner restores or
      // explicitly discards it.
      return {
        ...state,
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

    case "mark-save-sync-error": {
      // The refused write's reconcile fetch failed: the local draft is
      // untouched and the stage stays fenced (its revision never advanced)
      // — only an explicit retry's resolve lifts the fence. Distinct from
      // "conflict": nothing was loaded, so "已载入最新进度" would be a lie.
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
      return {
        ...state,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "sync-error"),
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          true,
        ),
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
      // "sync-error" is the same refusal, still unreconciled — a retry's
      // payload lands here too.
      if (status !== "saving" && status !== "dirty" && status !== "sync-error") return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      const localDraft = state.drafts[action.stageIndex];
      if (localDraft !== undefined) conflictedLocalDrafts[action.stageIndex] = localDraft;
      return {
        ...state,
        drafts: { ...state.drafts, [action.stageIndex]: sanitizeDraft(action.draft ?? {}) },
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        draftRevisions:
          typeof action.revision === "number"
            ? { ...state.draftRevisions, [action.stageIndex]: action.revision }
            : state.draftRevisions,
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "conflict"),
        judgeOutcome: action.stageIndex === state.stageIndex ? null : state.judgeOutcome,
        runOutcome: action.stageIndex === state.stageIndex ? null : state.runOutcome,
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
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        saveStatusByStage: markSaveStatus(state.saveStatusByStage, action.stageIndex, "dirty"),
        judgeOutcome: isCurrent ? null : state.judgeOutcome,
        runOutcome: isCurrent ? null : state.runOutcome,
      };
    }
    case "discard-conflict-draft": {
      // The learner accepts the server's draft: drop the recoverable local
      // copy for good. A "conflict" flag settles to "saved" — the content
      // on screen is the server's applied write; other flags stay put.
      if (state.conflictedLocalDrafts[action.stageIndex] === undefined) return state;
      const conflictedLocalDrafts = { ...state.conflictedLocalDrafts };
      delete conflictedLocalDrafts[action.stageIndex];
      const status = statusForStage(state.saveStatusByStage, action.stageIndex);
      return {
        ...state,
        conflictedLocalDrafts,
        unresolvedSyncConflicts: markSyncConflict(
          state.unresolvedSyncConflicts,
          action.stageIndex,
          false,
        ),
        saveStatusByStage:
          status === "conflict"
            ? markSaveStatus(state.saveStatusByStage, action.stageIndex, "saved")
            : state.saveStatusByStage,
      };
    }
    case "dismiss-message":
      return { ...state, message: null };
    case "message":
      return { ...state, message: action.text };
  }
}
