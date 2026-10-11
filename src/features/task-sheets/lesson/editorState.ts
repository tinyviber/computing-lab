/**
 * Task-sheet editor state machine: the question list plus title/description
 * meta, and the pure transitions the UI dispatches (add / update / remove /
 * move / duplicate). No React, no network — TaskSheetEditorPage hooks it up
 * with useReducer and autosaves the result.
 */

import type { Question } from "../domain/schema.ts";
import type { EditorAction } from "./editorActions.ts";

export type EditorState = {
  title: string;
  description: string;
  questions: Question[];
};

function newId(): string {
  return crypto.randomUUID();
}

export function blankOption(id: number) {
  return { id: `o${id}`, text: "" };
}

/**
 * Next collision-free option number: 1 + the max numeric suffix among
 * existing `o<N>` ids. Ids loaded from other sheets may not follow the
 * convention; they cannot collide with `o<N>` output and are ignored.
 * (length+1 breaks when a middle option is deleted and another is added.)
 */
export function nextOptionNum(options: { id: string }[]): number {
  let max = 0;
  for (const o of options) {
    const match = /^o(\d+)$/.exec(o.id);
    if (match) max = Math.max(max, Number.parseInt(match[1], 10));
  }
  return max + 1;
}

function makeQuestion(kind: Question["type"], n: number): Question {
  if (kind === "fill") {
    return {
      id: newId(),
      type: "fill",
      prompt: "",
      required: true,
      score: 4,
      blanks: [{ id: `b${n}-1`, accept: [""] }],
    };
  }
  if (kind === "choice") {
    return {
      id: newId(),
      type: "choice",
      prompt: "",
      required: true,
      score: 4,
      multiple: false,
      options: [blankOption(1), blankOption(2), blankOption(3), blankOption(4)],
      correctOptionIds: [],
    };
  }
  return {
    id: newId(),
    type: "short",
    prompt: "",
    required: true,
    maxScore: 10,
    referenceAnswer: "",
  };
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "meta":
      return {
        ...state,
        title: action.title ?? state.title,
        description: action.description ?? state.description,
      };
    case "load":
      return action.state;
    case "add":
      return {
        ...state,
        questions: [...state.questions, makeQuestion(action.kind, state.questions.length + 1)],
      };
    case "update":
      return {
        ...state,
        questions: state.questions.map((q) => (q.id === action.question.id ? action.question : q)),
      };
    case "remove":
      return { ...state, questions: state.questions.filter((q) => q.id !== action.id) };
    case "move": {
      const index = state.questions.findIndex((q) => q.id === action.id);
      const target = index + action.dir;
      if (index < 0 || target < 0 || target >= state.questions.length) return state;
      const questions = [...state.questions];
      [questions[index], questions[target]] = [questions[target], questions[index]];
      return { ...state, questions };
    }
    case "duplicate": {
      const index = state.questions.findIndex((q) => q.id === action.id);
      if (index < 0) return state;
      const copy = JSON.parse(JSON.stringify(state.questions[index])) as Question;
      copy.id = newId();
      const questions = [...state.questions];
      questions.splice(index + 1, 0, copy);
      return { ...state, questions };
    }
  }
}
