import { describe, expect, it } from "vitest";
import type { ChoiceQuestion, Question } from "../domain/schema.ts";
import { blankOption, editorReducer, type EditorState } from "./editorState.ts";

const base = (questions: Question[] = []): EditorState => ({
  title: "任务单",
  description: "",
  questions,
});

const choice = (id: string): ChoiceQuestion => ({
  id,
  type: "choice",
  prompt: "题干",
  required: true,
  score: 4,
  multiple: false,
  options: [blankOption(1), blankOption(2)],
  correctOptionIds: [],
});

describe("editorReducer meta/load", () => {
  it("patches only the fields given", () => {
    const state = base();
    const next = editorReducer(state, { type: "meta", title: "新标题" });
    expect(next.title).toBe("新标题");
    expect(next.description).toBe("");
    expect(next.questions).toBe(state.questions);
  });

  it("load replaces the whole state", () => {
    const loaded = base([choice("q1")]);
    loaded.title = "载入的";
    expect(editorReducer(base(), { type: "load", state: loaded })).toBe(loaded);
  });
});

describe("editorReducer add", () => {
  it("appends a default question of each kind", () => {
    let state = base();
    state = editorReducer(state, { type: "add", kind: "fill" });
    state = editorReducer(state, { type: "add", kind: "choice" });
    state = editorReducer(state, { type: "add", kind: "short" });
    expect(state.questions.map((q) => q.type)).toEqual(["fill", "choice", "short"]);
    const [fill, c, short] = state.questions;
    expect(fill).toMatchObject({ required: true, score: 4 });
    expect(fill.type === "fill" ? fill.blanks : []).toHaveLength(1);
    expect(c.type === "choice" ? c.options : []).toHaveLength(4);
    expect(short).toMatchObject({ required: true, maxScore: 10 });
    // Every add mints a fresh id.
    expect(new Set(state.questions.map((q) => q.id)).size).toBe(3);
  });
});

describe("editorReducer update/remove", () => {
  it("update replaces the question with the same id only", () => {
    const state = base([choice("q1"), choice("q2")]);
    const edited = { ...choice("q1"), prompt: "改过的题干" };
    const next = editorReducer(state, { type: "update", question: edited });
    expect(next.questions[0]).toBe(edited);
    expect(next.questions[1]).toBe(state.questions[1]);
  });

  it("remove drops the question by id", () => {
    const state = base([choice("q1"), choice("q2")]);
    expect(editorReducer(state, { type: "remove", id: "q1" }).questions.map((q) => q.id)).toEqual([
      "q2",
    ]);
  });
});

describe("editorReducer move", () => {
  it("swaps a question with its neighbour", () => {
    const state = base([choice("q1"), choice("q2"), choice("q3")]);
    const next = editorReducer(state, { type: "move", id: "q2", dir: -1 });
    expect(next.questions.map((q) => q.id)).toEqual(["q2", "q1", "q3"]);
  });

  it("is a no-op at the edges and for unknown ids", () => {
    const state = base([choice("q1"), choice("q2")]);
    expect(editorReducer(state, { type: "move", id: "q1", dir: -1 })).toBe(state);
    expect(editorReducer(state, { type: "move", id: "q2", dir: 1 })).toBe(state);
    expect(editorReducer(state, { type: "move", id: "nope", dir: 1 })).toBe(state);
  });
});

describe("editorReducer duplicate", () => {
  it("inserts a deep copy with a fresh id right after the source", () => {
    const state = base([choice("q1"), choice("q2")]);
    const next = editorReducer(state, { type: "duplicate", id: "q1" });
    expect(next.questions.map((q) => q.id)).toHaveLength(3);
    const copy = next.questions[1];
    expect(copy.id).not.toBe("q1");
    expect(copy).toEqual({ ...state.questions[0], id: copy.id });
    // Deep copy: editing the copy leaves the source untouched.
    (copy as ChoiceQuestion).options[0].text = "改了副本";
    expect((state.questions[0] as ChoiceQuestion).options[0].text).toBe("");
  });

  it("is a no-op for unknown ids", () => {
    const state = base([choice("q1")]);
    expect(editorReducer(state, { type: "duplicate", id: "nope" })).toBe(state);
  });
});
