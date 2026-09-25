/**
 * Network lab lesson state: which stage, the topology draft per stage,
 * the last public-test sweep and judge verdict. Pure transitions — no
 * React, no network. The sim's run view is derived data; it lives in
 * the page (recomputed on edit), not in this reducer.
 *
 * Draft edits keep the sanitize layer hot: every action writes back a
 * fully sanitized topology so what the student builds is always inside
 * the domain contract (≤12 nodes, one wire per interface, normalized
 * addresses and routes). Fresh drafts come from `planFor(stage, seed)`
 * — the per-user seeded address blocks.
 */

import type { SaveStatus } from "../../../shared/api/client";
import {
  findContractIssues,
  NODE_IFACES,
  sanitizeTopology,
  type LinkEnd,
  type NetAddress,
  type NetDraft,
  type NetLink,
  type NetRoute,
  type NetTopology,
} from "../domain/model.ts";
import { planFor } from "../domain/plan.ts";
import type { NetJudgeResult } from "../domain/protocol.ts";
import { seedFor } from "../domain/rng.ts";
import { judgeNetCase, type NetCase } from "../domain/scenario.ts";
import {
  getNetStage,
  isNetStageUnlocked,
  nextNetStage,
  type NetStageDef,
} from "../domain/stages.ts";

export type { SaveStatus };

export const NET_LAB_ID = "network";

export type PublicRunOutcome = {
  /** One light verdict per public case, in run order. */
  results: {
    name: string;
    category: string;
    passed: boolean;
    reason: "done" | "budget" | null;
    eventsUsed: number;
    eventBudget: number;
  }[];
  score: number;
  total: number;
};

export type NetLessonState = {
  stageIndex: number;
  /** Next unpassed stage (mainline pointer). */
  currentStage: number;
  passedStages: number[];
  drafts: Record<number, NetDraft>;
  /** Signed-in user — seeds the per-user addressing plan. */
  userId: string;
  runOutcome: PublicRunOutcome | null;
  judgeOutcome: NetJudgeResult | null;
  saveStatus: SaveStatus;
  message: string | null;
};

export type NetLessonAction =
  | {
      type: "load-project";
      currentStage: number;
      passedStages: number[];
      drafts: Record<number, NetDraft>;
      userId: string;
    }
  | { type: "select-stage"; stageIndex: number }
  | { type: "set-node-label"; nodeId: string; label: string }
  | { type: "add-link"; a: LinkEnd; b: LinkEnd }
  | { type: "remove-link"; link: NetLink }
  | { type: "set-address"; nodeId: string; iface: string; address: NetAddress | null }
  | { type: "set-gateway"; nodeId: string; gateway: string | null }
  | { type: "add-route"; nodeId: string }
  | {
      type: "update-route";
      nodeId: string;
      index: number;
      patch: Partial<NetRoute>;
    }
  | { type: "remove-route"; nodeId: string; index: number }
  | { type: "reset-draft" }
  | { type: "run-public-tests"; cases: NetCase[] }
  | { type: "judge-result"; outcome: NetJudgeResult }
  | { type: "mark-saving" }
  | { type: "mark-saved" }
  | { type: "mark-save-error" }
  | { type: "dismiss-message" }
  | { type: "message"; text: string };

export function stageOf(state: NetLessonState): NetStageDef | undefined {
  return getNetStage(state.stageIndex);
}

export function isStageUnlocked(state: NetLessonState, stageIndex: number): boolean {
  return isNetStageUnlocked(state.passedStages, stageIndex);
}

export function seedOf(state: NetLessonState, stageIndex = state.stageIndex): number {
  return seedFor(state.userId, NET_LAB_ID, stageIndex);
}

/** Fresh drafts start from the stage's seeded prefill furniture. */
export function draftOf(state: NetLessonState, stageIndex = state.stageIndex): NetDraft {
  const stored = state.drafts[stageIndex];
  if (stored) return stored;
  const prefill = planFor(stageIndex, seedOf(state, stageIndex)).topology;
  return {
    nodes: prefill.nodes.map((n) => ({
      ...n,
      addresses: Object.fromEntries(
        Object.entries(n.addresses).map(([iface, a]) => [iface, { ...a }]),
      ),
      routes: n.routes.map((r) => ({ ...r })),
    })),
    links: prefill.links.map((l) => ({ a: { ...l.a }, b: { ...l.b } })),
  };
}

/** The topology as the simulator sees it — sanitized. */
export function topologyOf(state: NetLessonState): NetTopology {
  return sanitizeTopology(draftOf(state));
}

/** Structural issues of the current draft — surfaced as a banner. */
export function contractIssuesOf(state: NetLessonState): string[] {
  return findContractIssues(topologyOf(state));
}

export function createNetLessonState(stageIndex = 1, userId = ""): NetLessonState {
  return {
    stageIndex,
    currentStage: stageIndex,
    passedStages: [],
    drafts: {},
    userId,
    runOutcome: null,
    judgeOutcome: null,
    saveStatus: "idle",
    message: null,
  };
}

/** Bound a restored draft at the domain edge; junk fields drop to defaults. */
export function sanitizeDraft(raw: unknown): NetDraft {
  return sanitizeTopology(raw);
}

function withDraft(state: NetLessonState, draft: NetDraft): NetLessonState {
  return {
    ...state,
    drafts: { ...state.drafts, [state.stageIndex]: sanitizeTopology(draft) },
    saveStatus: "dirty",
    // A new topology invalidates previous verdicts.
    runOutcome: null,
    judgeOutcome: null,
  };
}

const can = (state: NetLessonState, cap: NetStageDef["editable"][number]): boolean =>
  stageOf(state)?.editable.includes(cap) === true;

const withNode = (
  draft: NetDraft,
  nodeId: string,
  update: (node: NetTopology["nodes"][number]) => NetTopology["nodes"][number],
): NetDraft => ({
  ...draft,
  nodes: draft.nodes.map((n) => (n.id === nodeId ? update(n) : n)),
});

export function transitionNetLesson(
  state: NetLessonState,
  action: NetLessonAction,
): NetLessonState {
  switch (action.type) {
    case "load-project": {
      const drafts: Record<number, NetDraft> = {};
      for (const [key, draft] of Object.entries(action.drafts)) {
        drafts[Number(key)] = sanitizeDraft(draft);
      }
      const stageIndex = isNetStageUnlocked(action.passedStages, action.currentStage)
        ? action.currentStage
        : isNetStageUnlocked(action.passedStages, state.stageIndex)
          ? state.stageIndex
          : 1;
      return {
        ...state,
        stageIndex,
        currentStage: action.currentStage,
        passedStages: action.passedStages,
        drafts,
        userId: action.userId,
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

    case "set-node-label": {
      if (!can(state, "label")) return state;
      return withDraft(
        state,
        withNode(draftOf(state), action.nodeId, (n) => ({ ...n, label: action.label })),
      );
    }

    case "add-link": {
      if (!can(state, "wire")) return state;
      const draft = draftOf(state);
      const { a, b } = action;
      const aNode = draft.nodes.find((n) => n.id === a.node);
      const bNode = draft.nodes.find((n) => n.id === b.node);
      if (!aNode || !bNode || a.node === b.node) return state;
      if (!NODE_IFACES[aNode.kind].includes(a.iface)) return state;
      if (!NODE_IFACES[bNode.kind].includes(b.iface)) return state;
      // One wire per interface: a re-wired end replaces its old link.
      const drop = (node: string, iface: string) => (l: NetLink) =>
        !((l.a.node === node && l.a.iface === iface) || (l.b.node === node && l.b.iface === iface));
      const links = draft.links.filter(drop(a.node, a.iface)).filter(drop(b.node, b.iface));
      return withDraft(state, { ...draft, links: [...links, { a, b }] });
    }

    case "remove-link": {
      if (!can(state, "wire")) return state;
      const draft = draftOf(state);
      const same = (l: NetLink, x: NetLink) =>
        (l.a.node === x.a.node &&
          l.a.iface === x.a.iface &&
          l.b.node === x.b.node &&
          l.b.iface === x.b.iface) ||
        (l.a.node === x.b.node &&
          l.a.iface === x.b.iface &&
          l.b.node === x.a.node &&
          l.b.iface === x.a.iface);
      return withDraft(state, {
        ...draft,
        links: draft.links.filter((l) => !same(l, action.link)),
      });
    }

    case "set-address": {
      if (!can(state, "address")) return state;
      const draft = draftOf(state);
      const node = draft.nodes.find((n) => n.id === action.nodeId);
      if (!node || node.kind === "switch") return state;
      if (!NODE_IFACES[node.kind].includes(action.iface)) return state;
      return withDraft(
        state,
        withNode(draft, action.nodeId, (n) => {
          const addresses = { ...n.addresses };
          if (action.address === null) delete addresses[action.iface];
          else addresses[action.iface] = { ...action.address };
          return { ...n, addresses };
        }),
      );
    }

    case "set-gateway": {
      if (!can(state, "gateway")) return state;
      const draft = draftOf(state);
      const node = draft.nodes.find((n) => n.id === action.nodeId);
      if (!node || node.kind !== "host") return state;
      return withDraft(
        state,
        withNode(draft, action.nodeId, (n) => ({
          ...n,
          gateway: action.gateway ?? undefined,
        })),
      );
    }

    case "add-route": {
      if (!can(state, "routes")) return state;
      const draft = draftOf(state);
      const node = draft.nodes.find((n) => n.id === action.nodeId);
      if (!node || node.kind !== "router" || node.routes.length >= 8) return state;
      return withDraft(
        state,
        withNode(draft, action.nodeId, (n) => ({
          ...n,
          routes: [...n.routes, { dest: "0.0.0.0", prefix: 0, nextHop: "0.0.0.0" }],
        })),
      );
    }

    case "update-route": {
      if (!can(state, "routes")) return state;
      const draft = draftOf(state);
      const node = draft.nodes.find((n) => n.id === action.nodeId);
      if (!node || node.kind !== "router" || !node.routes[action.index]) return state;
      return withDraft(
        state,
        withNode(draft, action.nodeId, (n) => ({
          ...n,
          routes: n.routes.map((r, i) => (i === action.index ? { ...r, ...action.patch } : r)),
        })),
      );
    }

    case "remove-route": {
      if (!can(state, "routes")) return state;
      const draft = draftOf(state);
      const node = draft.nodes.find((n) => n.id === action.nodeId);
      if (!node || node.kind !== "router") return state;
      return withDraft(
        state,
        withNode(draft, action.nodeId, (n) => ({
          ...n,
          routes: n.routes.filter((_, i) => i !== action.index),
        })),
      );
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
        judgeNetCase(topology, testCase, stage.maxEvents),
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
            eventsUsed: v.eventsUsed,
            eventBudget: v.eventBudget,
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
        currentStage: nextNetStage(action.outcome.passedStages),
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
