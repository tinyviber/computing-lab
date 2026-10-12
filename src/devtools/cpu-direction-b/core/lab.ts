// Shared lab state for all three prototypes: level progress, machine history,
// questions, tests/judging, and simulated persistence. Presentation lives in src/a|b|c.

import { useCallback, useEffect, useMemo, useReducer } from "react";
import { clamp4, type Instr } from "./isa";
import {
  judge as runJudge,
  programReady,
  runPublic,
  type JudgeResult,
  type TestRow,
} from "./judge";
import {
  gateAt,
  isUnlocked,
  levelById,
  LEVELS,
  memoryImage,
  type Dataset,
  type Level,
  type Line,
  type Question,
} from "./levels";
import {
  createMachine,
  intentOf,
  isPristine,
  midRun,
  stepPhase,
  type Machine,
  type StepEvent,
} from "./machine";

export interface Snap {
  m: Machine;
  ev: StepEvent | null;
}

export interface Observed {
  halted: string[];
  jzTaken: boolean;
  jzNotTaken: boolean;
}

export type SaveStatus = "saved" | "dirty" | "saving" | "error";

export interface Conflict {
  local: Line[];
  server: Line[];
  localAt: string;
  serverAt: string;
  syncFailed: boolean;
}

export type Grain = "phase" | "cycle";
export type Speed = "slow" | "normal" | "fast";
export const SPEED_MS: Record<Speed, number> = { slow: 1100, normal: 600, fast: 220 };

export interface LabState {
  passed: number[];
  levelId: number;
  drafts: Record<number, Line[]>;
  datasetId: string;
  counter: Dataset | null;
  history: Snap[];
  cursor: number;
  running: boolean;
  grain: Grain;
  speed: Speed;
  answers: Record<string, { tried: string[]; correct: boolean }>;
  answerSync: "ok" | "saving" | "error";
  byteValue: number;
  observed: Record<number, Observed>;
  tests: TestRow[] | null;
  judge: JudgeResult | null;
  submit: "idle" | "submitting" | "error";
  save: SaveStatus;
  savedAt: string;
  load: "ok" | "error";
  conflict: Conflict | null;
  /** Prerequisite Calculator course; advisory only, never blocks CPU levels. */
  calculatorDone: boolean;
  calcDismissed: boolean;
  hintsShown: Record<number, number>;
  /** Demo-only: make the next simulated request fail. */
  failNext: { save?: boolean; submit?: boolean; answer?: boolean };
}

const NO_OBS: Observed = { halted: [], jzTaken: false, jzNotTaken: false };
const clone = (lines: Line[]) =>
  lines.map((l) => ({ ...l, instr: l.instr ? { ...l.instr } : null }));
const now = () => new Date().toTimeString().slice(0, 5);

export function datasetOf(s: Pick<LabState, "datasetId" | "counter">, level: Level): Dataset {
  if (s.datasetId === "counter" && s.counter) return s.counter;
  return level.publicData.find((d) => d.id === s.datasetId) ?? level.publicData[0];
}

function boot(level: Level, lines: Line[], data: Dataset): Snap[] {
  return [
    { m: createMachine(memoryImage(level, lines, data), data.regs ?? {}, level.limit), ev: null },
  ];
}

/** Rebuilds the machine for the current level/program/dataset. */
function reset(s: LabState): LabState {
  const level = levelById(s.levelId);
  const history = boot(level, s.drafts[s.levelId], datasetOf(s, level));
  return { ...s, history, cursor: 0, running: false };
}

export function blockingQuestion(
  level: Level,
  m: Machine,
  answers: LabState["answers"],
): Question | null {
  if (m.status !== "ready") return null;
  const q = gateAt(level, m.cycle, m.phase);
  return q && !answers[q.id]?.correct ? q : null;
}

export function initialState(passed: number[] = [], levelId = 1): LabState {
  const drafts: Record<number, Line[]> = {};
  for (const l of LEVELS) drafts[l.id] = clone(l.program);
  const level = levelById(levelId);
  const s: LabState = {
    passed,
    levelId,
    drafts,
    datasetId: level.publicData[0].id,
    counter: null,
    history: [],
    cursor: 0,
    running: false,
    grain: level.kind === "core" ? "phase" : "cycle",
    speed: "normal",
    answers: {},
    answerSync: "ok",
    byteValue: 0,
    observed: {},
    tests: null,
    judge: null,
    submit: "idle",
    save: "saved",
    savedAt: "09:41",
    load: "ok",
    conflict: null,
    calculatorDone: false,
    calcDismissed: false,
    hintsShown: {},
    failNext: {},
  };
  return reset(s);
}

export type Action =
  | { t: "level"; id: number }
  | { t: "dataset"; id: string }
  | { t: "step" }
  | { t: "run" }
  | { t: "pause" }
  | { t: "reset" }
  | { t: "grain"; grain: Grain }
  | { t: "speed"; speed: Speed }
  | { t: "review"; cursor: number }
  | { t: "answer"; qid: string; option: string }
  | { t: "answer-synced"; ok: boolean }
  | { t: "answer-retry" }
  | { t: "byte"; value: number }
  | { t: "edit"; lines: Line[] }
  | { t: "tests" }
  | { t: "submit" }
  | { t: "submit-done" }
  | { t: "replay" }
  | { t: "close-judge" }
  | { t: "save-start" }
  | { t: "save-done" }
  | { t: "save-retry" }
  | { t: "load-retry" }
  | { t: "conflict"; choice: "local" | "server" | "retry" }
  | { t: "calc-dismiss" }
  | { t: "hint" }
  | { t: "replace"; state: LabState };

function stepOnce(s: LabState): LabState {
  const level = levelById(s.levelId);
  const live = s.history[s.history.length - 1].m;
  const base = { ...s, cursor: s.history.length - 1 };
  if (live.status !== "ready" || blockingQuestion(level, live, s.answers))
    return { ...base, running: false };
  const added: Snap[] = [];
  let cur = live;
  do {
    const r = stepPhase(cur);
    if (!r) break;
    added.push({ m: r.next, ev: r.event });
    cur = r.next;
  } while (
    s.grain === "cycle" &&
    cur.phase !== "fetch" &&
    cur.status === "ready" &&
    !blockingQuestion(level, cur, s.answers)
  );

  const history = [...s.history, ...added];
  let observed = s.observed;
  if (s.datasetId !== "counter") {
    const o = { ...(observed[level.id] ?? NO_OBS) };
    for (const a of added) {
      const rec = a.ev?.record;
      if (rec?.instr.op === "JZ") {
        if (rec.jumped) o.jzTaken = true;
        else o.jzNotTaken = true;
      }
    }
    if (cur.status === "halted" && !o.halted.includes(s.datasetId))
      o.halted = [...o.halted, s.datasetId];
    observed = { ...observed, [level.id]: o };
  }
  const stop = cur.status !== "ready" || !!blockingQuestion(level, cur, s.answers);
  return { ...base, history, cursor: history.length - 1, observed, running: s.running && !stop };
}

export function reduce(s: LabState, a: Action): LabState {
  const level = levelById(s.levelId);
  const live = s.history[s.history.length - 1].m;
  switch (a.t) {
    case "level": {
      if (!isUnlocked(a.id, s.passed)) return s;
      const next = levelById(a.id);
      return reset({
        ...s,
        levelId: a.id,
        datasetId: next.publicData[0].id,
        counter: null,
        tests: null,
        judge: null,
        submit: "idle",
        grain: next.kind === "core" ? "phase" : "cycle",
        load: "ok",
        conflict: null,
      });
    }
    case "dataset":
      if (midRun(live) || s.running) return s;
      return reset({ ...s, datasetId: a.id });
    case "step":
      return stepOnce(s);
    case "run":
      if (live.status !== "ready" || blockingQuestion(level, live, s.answers)) return s;
      return { ...s, running: true, cursor: s.history.length - 1 };
    case "pause":
      return { ...s, running: false };
    case "reset":
      return reset(s);
    case "grain":
      // Guided levels always present fetch, decode and execute separately.
      return level.kind === "core" ? s : { ...s, grain: a.grain };
    case "speed":
      return { ...s, speed: a.speed };
    case "review":
      return {
        ...s,
        running: false,
        cursor: Math.max(0, Math.min(s.history.length - 1, a.cursor)),
      };
    case "answer": {
      const prev = s.answers[a.qid] ?? { tried: [], correct: false };
      if (prev.correct) return s;
      const q = level.questions.find((x) => x.id === a.qid);
      const option = q?.options.find((o) => o.id === a.option);
      if (!q || !option) return s;
      if (q.trigger.kind === "byte" && s.byteValue !== q.trigger.target) return s;
      const answers = {
        ...s.answers,
        [a.qid]: { tried: [...prev.tried, a.option], correct: !!option.correct },
      };
      return { ...s, answers, answerSync: "saving" };
    }
    case "answer-synced":
      return {
        ...s,
        answerSync: a.ok ? "ok" : "error",
        failNext: { ...s.failNext, answer: false },
      };
    case "answer-retry":
      return { ...s, answerSync: "saving" };
    case "byte":
      return { ...s, byteValue: a.value & 255 };
    case "edit": {
      if (level.edit === "none" || s.load === "error" || midRun(live) || s.running) return s;
      const lines = a.lines
        .slice(0, 16)
        .map((l) =>
          l.instr ? { ...l, instr: { ...l.instr, operand: clamp4(l.instr.operand) } } : l,
        );
      return reset({
        ...s,
        drafts: { ...s.drafts, [level.id]: lines },
        tests: null,
        judge: null,
        save: "dirty",
      });
    }
    case "tests":
      if (!programReady(s.drafts[level.id])) return s;
      return { ...s, tests: runPublic(level, s.drafts[level.id]) };
    case "submit":
      return { ...s, submit: "submitting", judge: null };
    case "submit-done": {
      if (s.failNext.submit)
        return { ...s, submit: "error", failNext: { ...s.failNext, submit: false } };
      const unlocked = (passed: number[]) =>
        LEVELS.filter((l) => isUnlocked(l.id, passed)).map((l) => l.id);
      const result = runJudge(level, s.drafts[level.id], s.passed, unlocked);
      const passed = result.ok && !s.passed.includes(level.id) ? [...s.passed, level.id] : s.passed;
      return { ...s, submit: "idle", judge: result, passed };
    }
    case "replay":
      if (!s.judge || s.judge.ok) return s;
      return reset({
        ...s,
        counter: { ...s.judge.counter.data, id: "counter" },
        datasetId: "counter",
      });
    case "close-judge":
      return { ...s, judge: null };
    case "save-start":
      return { ...s, save: "saving" };
    case "save-done":
      if (s.failNext.save) return { ...s, save: "error", failNext: { ...s.failNext, save: false } };
      return { ...s, save: "saved", savedAt: now() };
    case "save-retry":
      return { ...s, save: "saving" };
    case "load-retry":
      return { ...s, load: "ok", save: "saved" };
    case "conflict": {
      if (!s.conflict) return s;
      if (a.choice === "retry")
        return { ...s, conflict: { ...s.conflict, syncFailed: false }, save: "saving" };
      const lines = clone(a.choice === "local" ? s.conflict.local : s.conflict.server);
      return reset({
        ...s,
        conflict: null,
        drafts: { ...s.drafts, [level.id]: lines },
        save: a.choice === "local" ? "saving" : "saved",
      });
    }
    case "calc-dismiss":
      return { ...s, calcDismissed: true };
    case "hint":
      return {
        ...s,
        hintsShown: {
          ...s.hintsShown,
          [level.id]: Math.min(level.hints.length, (s.hintsShown[level.id] ?? 0) + 1),
        },
      };
    case "replace":
      return a.state;
  }
}

const freeze =
  typeof location !== "undefined" && new URLSearchParams(location.search).has("freeze");

export function useLab(initial: () => LabState) {
  const [s, dispatch] = useReducer(reduce, undefined, initial);
  const level = levelById(s.levelId);
  const live = s.history[s.history.length - 1].m;

  useEffect(() => {
    if (!s.running || freeze) return;
    const t = window.setTimeout(() => dispatch({ t: "step" }), SPEED_MS[s.speed]);
    return () => window.clearTimeout(t);
  }, [s.running, s.speed, s.history.length]);

  useEffect(() => {
    if (freeze) return;
    if (s.save === "dirty") {
      const t = window.setTimeout(() => dispatch({ t: "save-start" }), 900);
      return () => window.clearTimeout(t);
    }
    if (s.save === "saving" && !s.conflict) {
      const t = window.setTimeout(() => dispatch({ t: "save-done" }), 900);
      return () => window.clearTimeout(t);
    }
  }, [s.save, s.conflict]);

  useEffect(() => {
    if (freeze || s.answerSync !== "saving") return;
    const t = window.setTimeout(
      () => dispatch({ t: "answer-synced", ok: !s.failNext.answer }),
      500,
    );
    return () => window.clearTimeout(t);
  }, [s.answerSync, s.failNext.answer]);

  useEffect(() => {
    if (freeze || s.submit !== "submitting") return;
    const t = window.setTimeout(() => dispatch({ t: "submit-done" }), 900);
    return () => window.clearTimeout(t);
  }, [s.submit]);

  const act = useMemo(
    () => ({
      level: (id: number) => dispatch({ t: "level", id }),
      dataset: (id: string) => dispatch({ t: "dataset", id }),
      step: () => dispatch({ t: "step" }),
      run: () => dispatch({ t: "run" }),
      pause: () => dispatch({ t: "pause" }),
      reset: () => dispatch({ t: "reset" }),
      grain: (grain: Grain) => dispatch({ t: "grain", grain }),
      speed: (speed: Speed) => dispatch({ t: "speed", speed }),
      review: (cursor: number) => dispatch({ t: "review", cursor }),
      answer: (qid: string, option: string) => dispatch({ t: "answer", qid, option }),
      answerRetry: () => dispatch({ t: "answer-retry" }),
      byte: (value: number) => dispatch({ t: "byte", value }),
      edit: (lines: Line[]) => dispatch({ t: "edit", lines }),
      tests: () => dispatch({ t: "tests" }),
      submit: () => dispatch({ t: "submit" }),
      replay: () => dispatch({ t: "replay" }),
      closeJudge: () => dispatch({ t: "close-judge" }),
      saveRetry: () => dispatch({ t: "save-retry" }),
      loadRetry: () => dispatch({ t: "load-retry" }),
      conflict: (choice: "local" | "server" | "retry") => dispatch({ t: "conflict", choice }),
      calcDismiss: () => dispatch({ t: "calc-dismiss" }),
      hint: () => dispatch({ t: "hint" }),
      replace: (state: LabState) => dispatch({ t: "replace", state }),
    }),
    [],
  );

  const derived = useDerived(s, level, live);
  return { s, level, live, act, ...derived };
}

export type Lab = ReturnType<typeof useLab>;

export interface Gate {
  ok: boolean;
  reason: string;
}

function useDerived(s: LabState, level: Level, live: Machine) {
  const lines = s.drafts[level.id];
  const viewing = s.history[s.cursor];
  const reviewing = s.cursor < s.history.length - 1;
  const blocking = blockingQuestion(level, live, s.answers);
  const obs = s.observed[level.id] ?? NO_OBS;
  const ready = programReady(lines);
  const running = midRun(live) || s.running;
  const records = s.history
    .slice(0, s.cursor + 1)
    .flatMap((h) => (h.ev?.record ? [h.ev.record] : []));

  const canStep: Gate =
    live.status !== "ready"
      ? { ok: false, reason: "机器已停止，复位后重新开始" }
      : blocking
        ? { ok: false, reason: "先回答本拍的问题" }
        : !ready
          ? { ok: false, reason: "程序还有空行" }
          : s.load === "error"
            ? { ok: false, reason: "草稿未载入" }
            : { ok: true, reason: "" };

  const canEdit: Gate =
    level.edit === "none"
      ? { ok: false, reason: "本关使用固定程序" }
      : s.load === "error"
        ? { ok: false, reason: "草稿载入失败，重试后才能编辑" }
        : running
          ? { ok: false, reason: "程序运行中，复位后才能编辑" }
          : { ok: true, reason: "" };

  const canGrain: Gate =
    level.kind === "core"
      ? { ok: false, reason: "引导关卡逐阶段呈现" }
      : live.status !== "ready"
        ? { ok: false, reason: "没有待执行的指令" }
        : { ok: true, reason: "" };

  const canPickData: Gate = running
    ? { ok: false, reason: "运行中不能切换数据，先复位" }
    : { ok: true, reason: "" };

  const submitGate = (): Gate => {
    if (s.load === "error") return { ok: false, reason: "草稿未载入" };
    if (!ready) return { ok: false, reason: "程序还有未填写的行" };
    const open = level.questions.filter((q) => !s.answers[q.id]?.correct);
    if (open.length) return { ok: false, reason: `还有 ${open.length} 道引导题未答对` };
    if (level.observe === "all-public-halted") {
      const left = level.publicData.filter((d) => !obs.halted.includes(d.id));
      if (left.length)
        return { ok: false, reason: `还要把 ${left.map((d) => d.label).join("、")} 走到停机` };
    }
    if (level.observe === "both-branches" && !(obs.jzTaken && obs.jzNotTaken)) {
      return {
        ok: false,
        reason: `还没亲眼看到${obs.jzTaken ? '"不跳转"' : obs.jzNotTaken ? '"跳转"' : "两种分支"}`,
      };
    }
    if (s.submit === "submitting") return { ok: false, reason: "正在判题" };
    return { ok: true, reason: "" };
  };

  const byteQuestion = level.questions.find((q) => q.trigger.kind === "byte") ?? null;
  const unlocked = LEVELS.filter((l) => isUnlocked(l.id, s.passed)).map((l) => l.id);

  return {
    lines,
    viewing,
    prev: s.cursor > 0 ? s.history[s.cursor - 1] : null,
    reviewing,
    blocking,
    obs,
    ready,
    records,
    pristine: isPristine(live),
    canStep,
    canEdit,
    canPickData,
    canGrain,
    canSubmit: submitGate(),
    canTest: ready ? { ok: true, reason: "" } : { ok: false, reason: "程序还有未填写的行" },
    byteQuestion,
    byteAnswerable:
      !!byteQuestion &&
      byteQuestion.trigger.kind === "byte" &&
      s.byteValue === byteQuestion.trigger.target,
    unlocked,
    dataset: datasetOf(s, level),
    /** The next phase's intent only; its results stay hidden until it runs. */
    intent: intentOf(live),
  };
}

/** Line-edit helpers shared by all editors. */
export const edits = {
  set(lines: Line[], i: number, instr: Instr): Line[] {
    return lines.map((l, k) => (k === i ? { ...l, instr } : l));
  },
  insert(lines: Line[], at: number): Line[] {
    if (lines.length >= 16) return lines;
    const next = lines.slice();
    next.splice(at, 0, { instr: { op: "HALT", reg: "A", operand: 0 }, lock: "free" });
    return next;
  },
  remove(lines: Line[], i: number): Line[] {
    return lines.length <= 1 ? lines : lines.filter((_, k) => k !== i);
  },
  move(lines: Line[], i: number, dir: -1 | 1): Line[] {
    const j = i + dir;
    if (j < 0 || j >= lines.length) return lines;
    const next = lines.slice();
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  },
};

export const useHotkeys = (lab: Lab, extra?: (e: KeyboardEvent) => boolean) => {
  const { act, canStep, s, live, reviewing } = lab;
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (
        el &&
        (el.closest("input, select, textarea, [contenteditable]") ||
          e.metaKey ||
          e.ctrlKey ||
          e.altKey)
      )
        return;
      if (extra?.(e)) return;
      const k = e.key.toLowerCase();
      if (k === "n" || e.key === "ArrowRight") {
        if (reviewing && e.key === "ArrowRight") act.review(s.cursor + 1);
        else if (canStep.ok) act.step();
      } else if (e.key === "ArrowLeft") act.review(s.cursor - 1);
      else if (k === "p") {
        if (s.running) act.pause();
        else if (canStep.ok) act.run();
      } else if (k === "r") act.reset();
      else return;
      e.preventDefault();
    },
    [act, canStep.ok, s.running, s.cursor, reviewing, extra],
  );
  useEffect(() => {
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onKey, live]);
};
