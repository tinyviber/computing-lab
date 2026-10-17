// Review scenarios. Each one is built by replaying real actions through the reducer,
// so every demo state is a state the simulator can actually reach.

import { initialState, reduce, type Action, type LabState } from "./lab";
import { levelById, type Line } from "./levels";
import type { Instr } from "./isa";

export interface Scenario {
  id: string;
  n: string;
  label: string;
  build: () => LabState;
}

const play = (s: LabState, actions: Action[]) => actions.reduce(reduce, s);
const steps = (n: number): Action[] => Array.from({ length: n }, () => ({ t: "step" }) as Action);
const answer = (qid: string, option: string, ok = true): Action[] => [
  { t: "answer", qid, option },
  { t: "answer-synced", ok },
];
const at = (passed: number[], level: number) =>
  play(initialState(passed), [{ t: "level", id: level }]);
const settle = (s: LabState): LabState => ({ ...s, save: "saved" });
const I = (op: Instr["op"], reg: Instr["reg"] = "A", operand = 0): Instr => ({ op, reg, operand });
const withLine = (lines: Line[], i: number, instr: Instr) =>
  lines.map((l, k) => (k === i ? { ...l, instr } : l));

/** A plausible in-progress draft for challenge 7 (the if). */
const ifDraft = (): Line[] =>
  [
    I("LOAD", "A", 13),
    I("SUB", "A", 14),
    I("JZ", "A", 5),
    I("LDI", "A", 0),
    I("JMP", "A", 6),
    I("LDI", "A", 1),
    I("STORE", "A", 15),
    I("HALT"),
  ].map((instr) => ({ instr, lock: "free" as const }));

export const SCENARIOS: Scenario[] = [
  { id: "initial", n: "1", label: "初始", build: () => initialState([], 1) },
  {
    id: "running",
    n: "2",
    label: "运行中",
    build: () => {
      const s = play(at([1, 2], 3), [
        { t: "dataset", id: "p2" },
        ...steps(5),
        ...answer("l3-carry", "a"),
        ...steps(1),
        { t: "run" },
      ]);
      return s;
    },
  },
  {
    id: "blocked",
    n: "3",
    label: "教学阻塞",
    build: () =>
      play(initialState([], 1), [
        ...answer("l1-first-fetch", "a"),
        ...steps(5),
        ...answer("l1-store", "b"),
      ]),
  },
  {
    id: "judge-fail",
    n: "4",
    label: "判题失败",
    build: () =>
      play(at([1, 2, 3, 4, 5, 6], 8), [{ t: "tests" }, { t: "submit" }, { t: "submit-done" }]),
  },
  {
    id: "replay",
    n: "4b",
    label: "反例回放",
    build: () =>
      play(at([1, 2, 3, 4, 5, 6], 8), [
        { t: "tests" },
        { t: "submit" },
        { t: "submit-done" },
        { t: "replay" },
        ...steps(6),
      ]),
  },
  {
    id: "byte",
    n: "5",
    label: "字节观察 · 未达成",
    build: () =>
      play(at([1], 2), [...answer("l2-same-byte", "a"), { t: "byte", value: 0b11000000 }]),
  },
  {
    id: "byte-ready",
    n: "5b",
    label: "字节观察 · 可作答",
    build: () =>
      play(at([1], 2), [...answer("l2-same-byte", "a"), { t: "byte", value: 0b11100000 }]),
  },
  { id: "fill", n: "6", label: "挑战 · 补全行", build: () => at([1, 2, 3], 4) },
  {
    id: "free",
    n: "6b",
    label: "挑战 · 自由编程",
    build: () => {
      const s = at([1, 2, 3, 4, 5], 7);
      return settle(play(s, [{ t: "edit", lines: ifDraft() }]));
    },
  },
  {
    id: "saving",
    n: "7",
    label: "保存中",
    build: () => {
      const s = at([1, 2, 3, 4, 5], 7);
      return { ...play(s, [{ t: "edit", lines: ifDraft().slice(0, 6) }]), save: "saving" };
    },
  },
  {
    id: "save-error",
    n: "7b",
    label: "保存失败",
    build: () => {
      const s = at([1, 2, 3, 4, 5], 7);
      return { ...play(s, [{ t: "edit", lines: ifDraft().slice(0, 6) }]), save: "error" };
    },
  },
  {
    id: "load-error",
    n: "8",
    label: "载入失败",
    build: () => ({ ...at([1, 2, 3, 4, 5], 7), load: "error" }),
  },
  {
    id: "submit-error",
    n: "8b",
    label: "提交失败",
    build: () => {
      const s = at([1, 2, 3], 4);
      const lines = withLine(s.drafts[4], 1, I("STORE", "A", 15));
      const edited = settle(play(s, [{ t: "edit", lines }]));
      return play({ ...edited, failNext: { submit: true } }, [
        { t: "submit" },
        { t: "submit-done" },
      ]);
    },
  },
  {
    id: "answer-error",
    n: "8c",
    label: "答案记录失败",
    build: () => play(initialState([], 1), answer("l1-first-fetch", "a", false)),
  },
  {
    id: "conflict",
    n: "9",
    label: "同步冲突",
    build: () => {
      const s = settle(play(at([1, 2, 3, 4, 5], 7), [{ t: "edit", lines: ifDraft() }]));
      const server = ifDraft()
        .slice(0, 4)
        .concat([{ instr: I("HALT"), lock: "free" }]);
      return {
        ...s,
        save: "error",
        conflict: {
          local: ifDraft(),
          server,
          localAt: "今天 10:12 · 本机",
          serverAt: "今天 09:58 · 机房电脑",
          syncFailed: true,
        },
      };
    },
  },
  {
    id: "pass",
    n: "10",
    label: "判题通过",
    build: () => {
      const s = at([1, 2, 3, 4], 5);
      const lines = withLine(s.drafts[5], 0, I("JZ", "A", 2));
      return play(settle(play(s, [{ t: "edit", lines }])), [
        ...steps(4),
        { t: "dataset", id: "p2" },
        { t: "reset" },
        { t: "dataset", id: "p2" },
        ...steps(5),
        { t: "tests" },
        { t: "submit" },
        { t: "submit-done" },
      ]);
    },
  },
];

export const scenarioById = (id: string | null) =>
  SCENARIOS.find((x) => x.id === id) ?? SCENARIOS[0];
export { levelById };
