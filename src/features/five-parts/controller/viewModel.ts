/**
 * View-model contract for the five-parts lab. The workspace renders exactly
 * this shape — in the real page it comes from the controller, in previews
 * from fixtures — so presentation never reaches into lesson state or the
 * network itself.
 */

import type { PartId } from "../domain/demo.ts";
import type { PhonePartId } from "../domain/phone.ts";
import type { StorageOp, StorageSpot } from "../domain/storage.ts";
import type { SaveStatus } from "../../../shared/api/client";

export type FivePartsRailItem = {
  index: number;
  id: string;
  title: string;
  englishTitle: string;
  active: boolean;
  passed: boolean;
  unlocked: boolean;
};

/** One server-judged question and how the last pick was judged. */
export type QuestionViewModel = {
  prompt: string;
  options: { id: string; label: string }[];
  selected: string | null;
  /** Null until the server has judged the current pick. */
  verdict: { correct: boolean; feedback: string } | null;
};

/** Everything the observe page draws from state. */
export type ObserveViewModel = {
  a: number;
  b: number;
  /** 0 = not started; 1–4 walk the five-step caption list. */
  step: number;
  /** Card to highlight at the current step; null while idle. */
  highlight: PartId | null;
  caption: string;
  /** a+b once the run reaches the arithmetic step; null before. */
  result: number | null;
  /** False until the walkthrough ran to the end — the continue action needs it. */
  demoComplete: boolean;
  /** Why "继续" is unavailable; null once the run is complete. */
  continueBlocker: string | null;
};

/** The think page: the one question plus the shared inputs/result. */
export type ThinkViewModel = {
  /** Shared inputs/results from the observe run, displayed read-only. */
  a: number;
  b: number;
  result: number | null;
  question: QuestionViewModel;
};

/** Memory vs storage: two copies of one essay and what the CPU last read. */
export type StorageViewModel = {
  powerOn: boolean;
  /** The file on external storage — always present, power or not. */
  disk: { lines: string[] };
  /** The copy opened in memory; null = memory holds nothing. */
  memory: { lines: string[]; unsaved: boolean } | null;
  /** What the CPU counted from memory; null = nothing read yet. */
  cpu: { sentences: number; chars: number } | null;
  highlight: StorageSpot | null;
  caption: string;
  /** Operations that can do something right now; the rest render disabled. */
  enabled: Record<StorageOp, boolean>;
  question: QuestionViewModel;
};

export type PhoneViewModel = {
  step: number;
  stepCount: number;
  caption: string;
  parts: {
    id: PhonePartId;
    title: string;
    detail: string;
    active: boolean;
    /** Five-parts roles revealed for this part so far, in order. */
    tags: string[];
  }[];
  question: QuestionViewModel;
};

export type FivePartsPageViewModel =
  | ({ kind: "observe" } & ObserveViewModel)
  | ({ kind: "think" } & ThinkViewModel)
  | ({ kind: "storage" } & StorageViewModel)
  | ({ kind: "phone" } & PhoneViewModel);

export type FivePartsLabViewModel = {
  stageIndex: number;
  /** Short label for the topbar subtitle and the collapsed rail. */
  pageLabel: string;
  rail: { items: FivePartsRailItem[] };
  page: FivePartsPageViewModel;
  /** The page after this one, if any — "下一页" stays optional, never forced. */
  nextPage: { index: number; title: string } | null;
  submission: { submitting: boolean };
  feedback: {
    message: string | null;
    error: string | null;
    saveStatus: SaveStatus;
    unresolvedSyncConflict: boolean;
    conflictLocalAvailable: boolean;
  };
};

export type FivePartsLabActions = {
  selectStage: (index: number) => void;
  /** +/- on an input digit; the controller clamps and restarts the demo. */
  adjustInput: (field: "a" | "b", delta: number) => void;
  /** Step-through pages (observe, phone): advance or rewind to 0. */
  nextStep: () => void;
  resetDemo: () => void;
  /** Pick an option on the current question page; the server judges it. */
  pickAnswer: (optionId: string) => void;
  /** "继续：观察与思考" — records the observation, then opens the think page. */
  continueToThink: () => void;
  storageOp: (op: StorageOp) => void;
  dismissMessage: () => void;
  restoreConflictLocal: () => void;
  discardConflictLocal: () => void;
  retrySyncConflict: () => void;
};

export type FivePartsWorkspaceProps = {
  model: FivePartsLabViewModel;
  actions: FivePartsLabActions;
};
