/**
 * Pure state → view-model projection for the five-parts lab. Called by the
 * real controller and by preview fixtures so both render the identical
 * workspace contract.
 */

import { DEMO_STEPS, STEP_COUNT, sum } from "../domain/demo.ts";
import { PHONE_PARTS, PHONE_STEPS, PHONE_STEP_COUNT, phoneTags } from "../domain/phone.ts";
import { FIVE_PARTS_STAGES, getFivePartsStage, type FivePartsQuestion } from "../domain/stages.ts";
import {
  charCount,
  ESSAY,
  STORAGE_EVENTS,
  type StorageOp,
  type StorageState,
} from "../domain/storage.ts";
import { draftOf, isStageUnlocked, type FivePartsLessonState } from "../lesson/state.ts";
import { statusForStage, syncConflictForStage } from "../../../shared/lab/saveStatus.ts";
import type {
  FivePartsLabViewModel,
  FivePartsPageViewModel,
  QuestionViewModel,
  StorageViewModel,
} from "./viewModel.ts";

const PAGE_LABELS = { observe: "观察", think: "观察与思考", storage: "内存与外存", phone: "手机" };

function questionOf(
  state: FivePartsLessonState,
  question: FivePartsQuestion | undefined,
): QuestionViewModel {
  const verdict = state.verdicts[state.stageIndex];
  return {
    prompt: question?.prompt ?? "",
    options: (question?.options ?? []).map((o) => ({ id: o.id, label: o.label })),
    selected: draftOf(state).answer,
    // A verdict without server feedback is the observe record, not a pick.
    verdict:
      verdict && verdict.feedback !== null
        ? { correct: verdict.passed, feedback: verdict.feedback }
        : null,
  };
}

function storageOf(storage: StorageState): Omit<StorageViewModel, "question"> {
  const { powerOn, saved, open, cpuRead, event } = storage;
  const hasOpen = open !== null;
  const enabled: Record<StorageOp, boolean> = {
    open: powerOn && !hasOpen,
    write: powerOn && hasOpen && open < ESSAY.length,
    save: powerOn && hasOpen && open !== saved,
    "cpu-read": powerOn,
    "power-off": powerOn,
    "power-on": !powerOn,
    reset: true,
  };
  return {
    powerOn,
    disk: { lines: ESSAY.slice(0, saved) },
    memory: hasOpen ? { lines: ESSAY.slice(0, open), unsaved: open !== saved } : null,
    cpu: cpuRead !== null ? { sentences: cpuRead, chars: charCount(cpuRead) } : null,
    highlight: STORAGE_EVENTS[event].highlight,
    caption: STORAGE_EVENTS[event].caption,
    enabled,
  };
}

function pageOf(state: FivePartsLessonState): FivePartsPageViewModel {
  const stage = getFivePartsStage(state.stageIndex) ?? FIVE_PARTS_STAGES[0];
  const draft = draftOf(state);
  // Inputs and the computed result live on the observe page's draft and are
  // shared read-only with the think page.
  const observed = draftOf(state, 1);
  const result = observed.step >= 3 ? sum(observed.a, observed.b) : null;

  switch (stage.id) {
    case "observe": {
      const step = DEMO_STEPS[Math.min(observed.step, STEP_COUNT)] ?? DEMO_STEPS[0];
      return {
        kind: "observe",
        a: observed.a,
        b: observed.b,
        step: observed.step,
        highlight: step.highlight,
        caption: step.caption,
        result,
        demoComplete: observed.step >= STEP_COUNT,
        continueBlocker: observed.step >= STEP_COUNT ? null : "先把演示一步一步看完，再继续。",
      };
    }
    case "think":
      return {
        kind: "think",
        a: observed.a,
        b: observed.b,
        result,
        question: questionOf(state, stage.question),
      };
    case "storage":
      return {
        kind: "storage",
        ...storageOf(draft.storage),
        question: questionOf(state, stage.question),
      };
    case "phone": {
      const step = PHONE_STEPS[Math.min(draft.step, PHONE_STEP_COUNT)] ?? PHONE_STEPS[0];
      const tags = phoneTags(step.index);
      return {
        kind: "phone",
        step: step.index,
        stepCount: PHONE_STEP_COUNT,
        caption: step.caption,
        parts: PHONE_PARTS.map((part) => ({
          id: part.id,
          title: part.title,
          detail: part.detail,
          active: step.highlight.includes(part.id),
          tags: tags[part.id],
        })),
        question: questionOf(state, stage.question),
      };
    }
  }
}

export function createFivePartsViewModel(options: {
  state: FivePartsLessonState;
  submitting: boolean;
  loadError: string | null;
  submitError: string | null;
}): FivePartsLabViewModel {
  const { state, submitting, loadError, submitError } = options;
  const stage = getFivePartsStage(state.stageIndex) ?? FIVE_PARTS_STAGES[0];
  const next = getFivePartsStage(stage.index + 1);

  return {
    stageIndex: state.stageIndex,
    pageLabel: PAGE_LABELS[stage.id],
    rail: {
      items: FIVE_PARTS_STAGES.map((s) => ({
        index: s.index,
        id: s.id,
        title: s.title,
        englishTitle: s.englishTitle,
        active: s.index === state.stageIndex,
        passed: state.passedStages.includes(s.index),
        unlocked: isStageUnlocked(state, s.index),
      })),
    },
    page: pageOf(state),
    // The observe page has its own continue button (it records the run), so
    // only the question pages offer a plain "next page" link.
    nextPage:
      stage.id !== "observe" && next && isStageUnlocked(state, next.index)
        ? { index: next.index, title: next.title }
        : null,
    submission: { submitting },
    feedback: {
      message: state.message,
      error: loadError ?? submitError,
      saveStatus: statusForStage(state.saveStatusByStage, state.stageIndex),
      unresolvedSyncConflict: syncConflictForStage(state.unresolvedSyncConflicts, state.stageIndex),
      conflictLocalAvailable: state.conflictedLocalDrafts[state.stageIndex] !== undefined,
    },
  };
}
