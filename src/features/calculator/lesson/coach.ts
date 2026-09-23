/**
 * Coach: the guided first-run tutorial and stage-specific concept cards for
 * the Calculator Lab.
 *
 * Stage definitions own the *knowledge* progression; this module owns the
 * *interaction* progression — the order in which the editor's gestures are
 * introduced, one at a time. It is a pure derivation: given the lesson view
 * (graph, pins, outcomes), what the learner has already done (observed
 * counters), and what they have already seen (persisted keys), compute the
 * single coaching card to show, or null. Nothing here blocks the editor — a
 * stuck learner can always skip a step or dismiss the whole guide.
 */

import type { Bit, CircuitGraph, ComponentDef, GateKind } from "../domain/graph";
import { STEP_DEFS, stageMatches, stageStartedKey } from "./coachSteps";
import type { JudgeOutcome, PendingWire, RunOutcome } from "./state";

/** What the lesson reports to the coach — no React, no storage. */
export type CoachLessonView = {
  stageIndex: number;
  graph: CircuitGraph;
  pendingWire: PendingWire;
  /** The drag snapshot while a node move is in flight. */
  nodeMove: { nodeId: string; graph: CircuitGraph } | null;
  /** Live preview pins: every input's value plus driven outputs. */
  pins: Record<string, Bit | null>;
  runOutcome: RunOutcome;
  judgeOutcome: JudgeOutcome;
  passedStages: number[];
  unlockedSubmodules: ComponentDef[];
  /** False until the saved project (and its drafts) has been fetched. */
  projectLoaded: boolean;
};

/** Counters accumulated by watching successive lesson views. */
export type CoachObserved = {
  /** "AB" combos -> the Sum actually observed while Sum was driven. */
  combos: Record<string, Bit>;
  /** Cumulative input/const toggles. */
  toggles: number;
  /** Cumulative edge removals. */
  edgeDeletions: number;
  /** Cumulative finished node drags that moved a node. */
  nodeDrags: number;
};

/** Snapshots taken when a goal step activates, for "restore it" goals. */
export type CoachBaselines = {
  /** Edge count when the delete-a-wire step activated. */
  edgesAtDelete?: number;
  /** Toggle count when the try-it-yourself step activated. */
  togglesAtManualTest?: number;
  /** Toggle count when the watch-Y-follow-A step activated. */
  togglesAtWirePlay?: number;
};

export type CoachMachine = {
  observed: CoachObserved;
  baselines: CoachBaselines;
  /** Persisted keys: completed steps, sequence flags, "coach-off". */
  seen: Set<string>;
};

/** A spotlight target. `node`/`port`/`wires` light up the canvas; the rest are page chrome. */
export type CoachFocus =
  | { kind: "node"; nodeIds: string[] }
  | { kind: "ports"; ports: { nodeId: string; port: string; direction: "in" | "out" }[] }
  | { kind: "wires" }
  | { kind: "palette-gate"; gate: GateKind }
  | { kind: "palette-const"; value: Bit }
  | { kind: "my-components" }
  | { kind: "bus-readout" }
  | { kind: "run-tests" }
  | { kind: "submit" };

export type CoachStep = {
  /** Seen key marking this step as handled (auto-goal or dismissed). */
  id: string;
  /** Ordering label inside the active stage's onboarding sequence. */
  progress?: string;
  title: string;
  body: string;
  /** Spotlight targets for this step. */
  focus?: CoachFocus[];
  /** Observed input->output rows for the explore step. */
  rows?: { label: string; value: string }[];
  /** Interactive mini truth-table for the full-adder stage. */
  explorer?: "full-adder";
  /** Manual beats advance through this primary button. */
  manualLabel?: string;
  /** Jump to this stage when the primary button is pressed. */
  nextStage?: number;
  /** Auto-goal beats offer a quiet way past when the gesture is stuck. */
  skippable?: boolean;
  /** Extra seen keys marked when the step is completed or dismissed. */
  alsoMark?: string[];
};

export type CoachView = CoachLessonView & CoachMachine;

export type StepDef = {
  id: string;
  /** Onboarding cards are counted within the stage that owns them. */
  group?: "onboarding";
  /** A card may be shared by the first two stages, but its state is not. */
  stage?: number | number[];
  ready: (v: CoachView) => boolean;
  /** Goal met: derivation skips the step and the observer marks it seen. */
  done?: (v: CoachView) => boolean;
  card: (v: CoachView) => Omit<CoachStep, "id">;
  alsoMark?: string[];
};

export function emptyCoachMachine(): CoachMachine {
  return {
    observed: { combos: {}, toggles: 0, edgeDeletions: 0, nodeDrags: 0 },
    baselines: {},
    seen: new Set(),
  };
}

function onboardingProgress(stageIndex: number): Map<string, string> {
  const steps = STEP_DEFS.filter(
    (def) => def.group === "onboarding" && stageMatches(def.stage, stageIndex),
  );
  return new Map(steps.map((def, index) => [def.id, `${index + 1} / ${steps.length}`]));
}

/**
 * The single coaching card to show now: the first step that is relevant, not
 * yet seen, and not already satisfied by the current circuit.
 */
export function coachStep(v: CoachView): CoachStep | null {
  if (!v.projectLoaded || v.seen.has("coach-off")) return null;
  const progress = onboardingProgress(v.stageIndex);
  for (const def of STEP_DEFS) {
    if (!stageMatches(def.stage, v.stageIndex)) continue;
    const key = def.id === "unlock" ? `unlock-${v.judgeOutcome?.unlockedComponent}` : def.id;
    if (!def.ready(v) || v.seen.has(key)) continue;
    if (def.done?.(v)) continue;
    const card = def.card(v);
    return {
      ...card,
      id: key,
      progress: def.group === "onboarding" ? progress.get(def.id) : undefined,
      skippable: card.skippable ?? Boolean(def.done),
      alsoMark: def.alsoMark,
    };
  }
  return null;
}

/**
 * Fold one lesson-view transition into the machine: count gestures, record
 * explored input combos, capture step baselines, and mark goals the circuit
 * already satisfies. Returns the same object when nothing changed.
 */
export function observeCoach(
  machine: CoachMachine,
  prev: CoachLessonView | null,
  next: CoachLessonView,
): CoachMachine {
  const seen = new Set(machine.seen);
  const observed: CoachObserved = {
    ...machine.observed,
    combos: { ...machine.observed.combos },
  };
  const baselines = { ...machine.baselines };
  let dirty = false;

  if (prev && prev.stageIndex === next.stageIndex) {
    const prevValues = new Map(
      prev.graph.nodes
        .filter((n) => n.kind === "input" || n.kind === "const")
        .map((n) => [n.id, n.value ?? 0]),
    );
    const toggles = next.graph.nodes.filter(
      (n) =>
        (n.kind === "input" || n.kind === "const") &&
        prevValues.has(n.id) &&
        prevValues.get(n.id) !== (n.value ?? 0),
    ).length;
    if (toggles > 0) {
      observed.toggles += toggles;
      dirty = true;
    }

    const removed = prev.graph.edges.length - next.graph.edges.length;
    if (removed > 0) {
      observed.edgeDeletions += removed;
      dirty = true;
    }

    const move = prev.nodeMove;
    if (move && !next.nodeMove) {
      const before = move.graph.nodes.find((n) => n.id === move.nodeId);
      const after = next.graph.nodes.find((n) => n.id === move.nodeId);
      if (before && after && (before.x !== after.x || before.y !== after.y)) {
        observed.nodeDrags += 1;
        dirty = true;
      }
    }
  }

  if (
    next.stageIndex === 2 &&
    next.pins.A != null &&
    next.pins.B != null &&
    next.pins.Sum != null
  ) {
    const key = `${next.pins.A}${next.pins.B}`;
    if (observed.combos[key] !== next.pins.Sum) {
      observed.combos[key] = next.pins.Sum;
      dirty = true;
    }
  }

  const view: CoachView = { ...next, observed, baselines, seen };
  const step = coachStep(view);

  if (step?.id === "s1-delete" && baselines.edgesAtDelete == null) {
    baselines.edgesAtDelete = next.graph.edges.length;
    dirty = true;
  }
  if (step?.id === "s1-manual-test" && baselines.togglesAtManualTest == null) {
    baselines.togglesAtManualTest = observed.toggles;
    dirty = true;
  }
  if (step?.id === "s1-wire-play" && baselines.togglesAtWirePlay == null) {
    baselines.togglesAtWirePlay = observed.toggles;
    dirty = true;
  }
  const onboardingStarted =
    next.stageIndex === 1 || next.stageIndex === 2 ? stageStartedKey(next.stageIndex) : null;
  if (step?.id.startsWith("s1-") && onboardingStarted && !seen.has(onboardingStarted)) {
    seen.add(onboardingStarted);
    // Keep the old marker as an in-memory compatibility alias. The React
    // hook stores this machine under the current stage, so it cannot leak to
    // another stage anymore.
    if (!seen.has("s1-started")) seen.add("s1-started");
    dirty = true;
  }

  const marked: CoachView = { ...view, baselines };
  for (const def of STEP_DEFS) {
    const key = def.id === "unlock" ? `unlock-${next.judgeOutcome?.unlockedComponent}` : def.id;
    if (!seen.has(key) && def.ready(marked) && def.done?.(marked)) {
      seen.add(key);
      for (const extra of def.alsoMark ?? []) seen.add(extra);
      dirty = true;
    }
  }

  return dirty ? { observed, baselines, seen } : machine;
}

/** Translate a step's spotlight list into what the SVG canvas can highlight. */
export function canvasCoachFocus(focus: CoachFocus[] | undefined): {
  nodeIds: Set<string>;
  portKeys: Set<string>;
  wires: boolean;
} {
  const nodeIds = new Set<string>();
  const portKeys = new Set<string>();
  let wires = false;
  for (const item of focus ?? []) {
    if (item.kind === "node") item.nodeIds.forEach((id) => nodeIds.add(id));
    if (item.kind === "ports") {
      item.ports.forEach((p) => portKeys.add(`${p.nodeId}#${p.port}#${p.direction}`));
    }
    if (item.kind === "wires") wires = true;
  }
  return { nodeIds, portKeys, wires };
}
