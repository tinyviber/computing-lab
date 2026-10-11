/**
 * Action types for the task-sheet editor state machine. The reducer in
 * editorState.ts consumes these; UI dispatches the object literals directly.
 */

import type { Question } from "../domain/schema.ts";
import type { EditorState } from "./editorState.ts";

export type EditorAction =
  | { type: "meta"; title?: string; description?: string }
  | { type: "load"; state: EditorState }
  | { type: "add"; kind: Question["type"] }
  | { type: "update"; question: Question }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; dir: -1 | 1 }
  | { type: "duplicate"; id: string };
