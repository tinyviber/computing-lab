import { useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { evaluateGraph } from "../domain/evaluate";
import type { CircuitGraph, ComponentDef } from "../domain/graph";
import type { CalculatorJudgeResult, CalculatorSubmission } from "../domain/protocol";
import {
  componentMap,
  createCalculatorLessonState,
  graphOf,
  stageOf,
  transitionCalculatorLesson,
  type CalculatorLessonAction,
} from "../lesson/state";
import { CalculatorLabWorkspace } from "./CalculatorLabWorkspace";
import { useCalculatorCoach } from "./CoachCard";
import { AnnotatedText } from "./CalculatorTerms";

export function CalculatorLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/calculator" });
  const search = useSearch({ from: "/classes/$classId/labs/calculator" });
  const navigate = useNavigate();
  const { status, role } = useAuth();
  // The current stage rides in the URL so a refresh reopens the same canvas
  // instead of dropping back to stage 1.
  const requestedStage = useMemo(() => {
    const value = Number(search.stage);
    return Number.isInteger(value) ? value : undefined;
  }, [search]);
  const [state, dispatch] = useReducer(transitionCalculatorLesson, undefined, () =>
    createCalculatorLessonState(1),
  );
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const graph = graphOf(state);
  const components = useMemo(() => componentMap(state), [state.unlockedSubmodules]);
  const stage = stageOf(state);
  const stageIndex = state.stageIndex;

  const { projectLoaded, loadError } = useLabProject<
    CircuitGraph,
    { unlockedSubmodules: ComponentDef[] },
    CalculatorLessonAction
  >({
    classId,
    labId: "calculator",
    ready: status === "authenticated",
    toAction: (project) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      unlockedSubmodules: project.unlockedSubmodules,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
      stageIndex: requestedStage,
    }),
    dispatch,
  });

  // Keep the URL in step with the stage the learner actually ended on — rail
  // clicks, coach jumps, and the load-project fallback all funnel here.
  useEffect(() => {
    if (!projectLoaded) return;
    if ((requestedStage ?? 1) === state.stageIndex) return;
    void navigate({
      to: "/classes/$classId/labs/calculator",
      params: { classId: classId as string },
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        stage: state.stageIndex === 1 ? undefined : state.stageIndex,
      }),
      replace: true,
    });
  }, [classId, navigate, projectLoaded, requestedStage, state.stageIndex]);

  // Live preview: evaluate with the pins' current toggle values.
  const preview = useMemo(() => evaluateGraph(graph, {}, components), [graph, components]);
  const coach = useCalculatorCoach(state, preview.pins, projectLoaded, dispatch);

  useAutosaveDraft<CircuitGraph>({
    classId,
    labId: "calculator",
    saveStatus: state.saveStatus,
    stageIndex,
    draftOf: () => graph,
    bodyFor: (index, draft) => ({
      stageIndex: index,
      graph: draft,
      components: state.unlockedSubmodules,
    }),
    deps: [graph, state.unlockedSubmodules],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

  const onSubmit = useCallback(async () => {
    if (!classId) return;
    setSubmitting(true);
    try {
      const submission: CalculatorSubmission = {
        stageIndex,
        graph,
        components: state.unlockedSubmodules,
      };
      const result = await api.post<CalculatorJudgeResult>(
        `/api/classes/${classId}/labs/calculator/judge`,
        submission,
      );
      dispatch({
        type: "judge-result",
        outcome: {
          score: result.score,
          total: result.total,
          passed: result.passed,
          categories: result.testSummary.categories,
          counterexample: result.testSummary.counterexample,
          passedStages: result.passedStages,
          error: result.testSummary.error,
          unlockedComponent: result.unlockedComponent,
        },
      });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stageIndex, graph, state.unlockedSubmodules]);

  return (
    <LabAccessGate
      classId={classId}
      labName="实现ALU"
      noClassHint="请用老师给的邀请码加入班级后再开始实验。"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="calculator-lab"
        topbar={
          <div className="calculator-status">
            <SaveIndicator status={state.saveStatus} />
          </div>
        }
        topbarProps={{
          subtitle: stage ? <AnnotatedText text={stage.englishTitle} /> : undefined,
          title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "实现ALU",
        }}
      >
        <CalculatorLabWorkspace
          coach={coach}
          dispatch={dispatch}
          error={loadError ?? submitError}
          onSubmit={() => void onSubmit()}
          projectLoaded={projectLoaded}
          state={state}
          submitting={submitting}
        />
      </AppPageLayout>
    </LabAccessGate>
  );
}
