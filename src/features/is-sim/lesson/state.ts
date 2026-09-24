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
  runOutcome: PublicRunOutcome | null;
  judgeOutcome: IsJudgeResult | null;
  saveStatus: SaveStatus;
  message: string | null;
};

export type IsLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, IsDraft>;
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
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
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
    runOutcome: null,
    judgeOutcome: null,
    saveStatus: "idle",
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
    saveStatus: "dirty",
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
        saveStatus: "dirty",
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
