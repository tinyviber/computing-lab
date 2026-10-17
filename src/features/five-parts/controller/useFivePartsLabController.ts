/**
 * Five-parts lab controller: owns persistence (project load + autosave),
 * lesson transitions and judging — the workspace only sees the view model
 * and user-intent actions.
 */

import { useCallback, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { statusForStage } from "../../../shared/lab/saveStatus.ts";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { reconcileConflictedStage, useLabProject } from "../../../shared/lab/useLabProject";
import type { FivePartsDraft, FivePartsJudgeResult } from "../domain/protocol.ts";
import {
  createFivePartsLessonState,
  draftOf,
  transitionFivePartsLesson,
  type FivePartsLessonAction,
} from "../lesson/state.ts";
import { createFivePartsViewModel } from "./createViewModel.ts";
import type { FivePartsLabActions, FivePartsWorkspaceProps } from "./viewModel.ts";

export function useFivePartsLabController({
  classId,
  ready,
}: {
  classId: string;
  ready: boolean;
}): FivePartsWorkspaceProps {
  const [state, dispatch] = useReducer(transitionFivePartsLesson, undefined, () =>
    createFivePartsLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { projectLoaded, loadError, fetchProject } = useLabProject<
    FivePartsDraft,
    Record<string, never>,
    FivePartsLessonAction
  >({
    classId,
    labId: "five-parts",
    ready,
    toAction: (project) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      draftRevisions: project.draftRevisions,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
    }),
    dispatch,
  });

  const reconcileConflict = (s: number) =>
    reconcileConflictedStage({
      fetchProject,
      stageIndex: s,
      onResolved: (stageIndex, project) =>
        dispatch({
          type: "resolve-save-conflict",
          stageIndex,
          draft: project.drafts?.[stageIndex],
          revision: project.draftRevisions?.[stageIndex],
        }),
      onSyncError: (stageIndex) => dispatch({ type: "mark-save-sync-error", stageIndex }),
    });

  useAutosaveDraft<FivePartsDraft>({
    classId,
    labId: "five-parts",
    saveStatus: projectLoaded ? statusForStage(state.saveStatusByStage, state.stageIndex) : "idle",
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    expectedRevisionOf: (s) => state.draftRevisions[s] ?? 0,
    onSaving: (s) => dispatch({ type: "mark-saving", stageIndex: s }),
    onSaved: (s, revision) => dispatch({ type: "mark-saved", stageIndex: s, revision }),
    onError: (s) => dispatch({ type: "mark-save-error", stageIndex: s }),
    onConflict: (s) => reconcileConflict(s),
  });

  const draft = draftOf(state);
  const model = createFivePartsViewModel({
    state,
    submitting,
    loadError: loadError ?? null,
    submitError,
  });

  const submit = useCallback(
    async (body: Record<string, unknown>) => {
      if (!classId) return;
      setSubmitting(true);
      setSubmitError(null);
      try {
        const outcome = await api.post<FivePartsJudgeResult>(
          `/api/classes/${classId}/labs/five-parts/judge`,
          body,
        );
        dispatch({ type: "judge-result", outcome });
      } catch (error) {
        setSubmitError(describeApiError(error));
      } finally {
        setSubmitting(false);
      }
    },
    [classId],
  );

  const actions: FivePartsLabActions = {
    selectStage: (stageIndex) => {
      setSubmitError(null);
      dispatch({ type: "select-stage", stageIndex });
    },
    adjustInput: (field, delta) =>
      dispatch({ type: "set-input", field, value: draft[field] + delta }),
    nextStep: () => dispatch({ type: "set-step", step: draft.step + 1 }),
    resetDemo: () => dispatch({ type: "set-step", step: 0 }),
    pickAnswer: (optionId) => {
      const stageIndex = state.stageIndex;
      dispatch({ type: "set-answer", optionId });
      void submit({ stageIndex, answer: optionId });
    },
    // The observation is itself the stage-1 submission: the server records
    // that the student ran the walkthrough, which unlocks the think page.
    continueToThink: () => {
      void submit({ stageIndex: 1, a: draftOf(state, 1).a, b: draftOf(state, 1).b }).then(() => {
        dispatch({ type: "select-stage", stageIndex: 2 });
      });
    },
    storageOp: (op) => dispatch({ type: "storage-op", op }),
    dismissMessage: () => dispatch({ type: "dismiss-message" }),
    restoreConflictLocal: () =>
      dispatch({ type: "restore-conflict-draft", stageIndex: state.stageIndex }),
    discardConflictLocal: () =>
      dispatch({ type: "discard-conflict-draft", stageIndex: state.stageIndex }),
    retrySyncConflict: () => reconcileConflict(state.stageIndex),
  };
  return { model, actions };
}
