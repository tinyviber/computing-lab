/**
 * Coaching card + the hook that feeds it.
 *
 * `useCalculatorCoach` watches the lesson state, folds every transition into
 * the pure coach machine (`lesson/coach.ts`), and persists seen-keys to
 * localStorage so a refresh resumes the tour instead of restarting it. The
 * coach never blocks the editor; it only spotlights and suggests.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { Bit, GateKind } from "../domain/graph";
import {
  canvasCoachFocus,
  coachStep,
  emptyCoachMachine,
  observeCoach,
  type CoachFocus,
  type CoachLessonView,
  type CoachMachine,
  type CoachStep,
} from "../lesson/coach";
import { graphOf, type CalculatorLessonAction, type CalculatorLessonState } from "../lesson/state";
import { AnnotatedText } from "./CalculatorTerms";

const STORAGE_KEY = "computing-lab:calculator-coach:v1";

function loadSeen(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : []);
  } catch {
    return new Set();
  }
}

function saveSeen(seen: ReadonlySet<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen]));
  } catch {
    // Private browsing or quota: the tour simply restarts next visit.
  }
}

export type CalculatorCoach = {
  step: CoachStep | null;
  /** Canvas spotlight derived from the step's focus list. */
  canvasFocus: ReturnType<typeof canvasCoachFocus>;
  /** Whether a page-chrome target (palette, rail, buttons) is spotlighted. */
  focusesOn: (kind: CoachFocus["kind"], match?: GateKind | Bit) => boolean;
  /** Dismiss a manual beat / finish its sequence (and optionally jump stages). */
  advance: (step: CoachStep) => void;
  /** Quietly bypass one stuck auto-goal. */
  skip: (step: CoachStep) => void;
  /** Turn the whole guide off. */
  skipAll: () => void;
};

export function useCalculatorCoach(
  state: CalculatorLessonState,
  pins: Record<string, Bit | null>,
  projectLoaded: boolean,
  dispatch: (action: CalculatorLessonAction) => void,
): CalculatorCoach {
  const [machine, setMachine] = useState<CoachMachine>(() => ({
    ...emptyCoachMachine(),
    seen: loadSeen(),
  }));
  const prevRef = useRef<CoachLessonView | null>(null);

  const lesson = useMemo<CoachLessonView>(
    () => ({
      stageIndex: state.stageIndex,
      graph: graphOf(state),
      pendingWire: state.pendingWire,
      nodeMove: state.nodeMove,
      pins,
      runOutcome: state.runOutcome,
      judgeOutcome: state.judgeOutcome,
      passedStages: state.passedStages,
      unlockedSubmodules: state.unlockedSubmodules,
      projectLoaded,
    }),
    [state, pins, projectLoaded],
  );

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = lesson;
    setMachine((current) => observeCoach(current, prev, lesson));
  }, [lesson]);

  useEffect(() => saveSeen(machine.seen), [machine.seen]);

  const view = useMemo(() => ({ ...lesson, ...machine }), [lesson, machine]);
  const step = useMemo(() => coachStep(view), [view]);

  // On the half-adder stage the first-wire step pre-places an XOR so the
  // learner's first gesture is wiring, not hunting through the palette.
  const hasXor = lesson.graph.nodes.some((n) => n.kind === "xor");
  useEffect(() => {
    if (step?.id === "s1-wire-start" && lesson.stageIndex === 2 && !hasXor) {
      dispatch({ type: "add-node", kind: "xor", x: 340, y: 110 });
    }
  }, [step?.id, lesson.stageIndex, hasXor, dispatch]);

  const mark = (keys: string[]) =>
    setMachine((current) => {
      const seen = new Set(current.seen);
      keys.forEach((key) => seen.add(key));
      return { ...current, seen };
    });

  return {
    step,
    canvasFocus: canvasCoachFocus(step?.focus),
    focusesOn: (kind, match) =>
      (step?.focus ?? []).some(
        (focus) =>
          focus.kind === kind &&
          (match === undefined ||
            ("gate" in focus && focus.gate === match) ||
            ("value" in focus && focus.value === match)),
      ),
    advance: (s) => {
      mark([s.id, ...(s.alsoMark ?? [])]);
      if (s.nextStage) dispatch({ type: "select-stage", stageIndex: s.nextStage });
    },
    skip: (s) => mark([s.id, ...(s.alsoMark ?? [])]),
    skipAll: () => mark(["coach-off"]),
  };
}

/** Interactive Sum/Cout preview so learners probe the spec before wiring. */
function FullAdderExplorer() {
  const [bits, setBits] = useState<Record<"A" | "B" | "Cin", Bit>>({ A: 0, B: 0, Cin: 0 });
  const sum = (bits.A ^ bits.B ^ bits.Cin) as Bit;
  const cout = ((bits.A & bits.B) | (bits.Cin & (bits.A ^ bits.B))) as Bit;
  return (
    <div className="coach-explorer">
      {(["A", "B", "Cin"] as const).map((name) => (
        <button
          aria-label={`切换 ${name}`}
          className={`coach-bit${bits[name] === 1 ? " is-high" : ""}`}
          key={name}
          onClick={() => setBits((b) => ({ ...b, [name]: b[name] === 1 ? 0 : 1 }))}
          type="button"
        >
          {name} = {bits[name]}
        </button>
      ))}
      <span className="coach-explorer-out">
        → Sum = {sum}，Cout = {cout}
      </span>
    </div>
  );
}

export function CoachCard({
  step,
  onAdvance,
  onSkip,
  onSkipAll,
}: {
  step: CoachStep | null;
  onAdvance: (step: CoachStep) => void;
  onSkip: (step: CoachStep) => void;
  onSkipAll: () => void;
}) {
  if (!step) return null;
  return (
    <section aria-label="新手引导" className="coach-card">
      <header className="coach-card-head">
        <p className="eyebrow">引导{step.progress ? ` · ${step.progress}` : ""}</p>
        <button className="coach-skip-all" onClick={onSkipAll} type="button">
          跳过引导
        </button>
      </header>
      <h2 className="coach-title">{step.title}</h2>
      <p className="coach-body">
        <AnnotatedText text={step.body} />
      </p>
      {step.rows && step.rows.length > 0 ? (
        <ul className="coach-rows">
          {step.rows.map((row) => (
            <li key={row.label}>
              <code>{row.label}</code> → <code>{row.value}</code>
            </li>
          ))}
        </ul>
      ) : null}
      {step.explorer === "full-adder" ? <FullAdderExplorer /> : null}
      {step.manualLabel || step.skippable ? (
        <div className="coach-actions">
          {step.manualLabel ? (
            <button className="button button-primary" onClick={() => onAdvance(step)} type="button">
              {step.manualLabel}
            </button>
          ) : null}
          {step.skippable ? (
            <button className="button button-ghost" onClick={() => onSkip(step)} type="button">
              跳过这一步
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
