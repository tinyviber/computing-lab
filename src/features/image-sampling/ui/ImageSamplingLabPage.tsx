import { useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import type { SamplingJudgeResult } from "../domain/protocol.ts";
import {
  IMAGE_SAMPLING_STAGES,
  samplingStageUnlocked,
  type SamplingStageDef,
} from "../domain/stages.ts";
import {
  createSamplingLessonState,
  draftOf,
  draftResolution,
  isStageUnlocked,
  stageOf,
  transitionSamplingLesson,
  type SamplingLessonAction,
  type StageDraft,
} from "../lesson/state.ts";
import { parseSamplingScenario } from "../lesson/scenario.ts";
import { ChooseSizePanel } from "./ChooseSizePanel.tsx";
import { DownsampleExplorer } from "./DownsampleExplorer.tsx";
import { GuidedCellTask } from "./GuidedCellTask.tsx";
import { RecognitionPanel } from "./RecognitionPanel.tsx";
import "./imageSampling.css";

function StageNav({
  stageIndex,
  passedStages,
  onSelect,
}: {
  stageIndex: number;
  passedStages: number[];
  onSelect: (index: number) => void;
}) {
  return (
    <aside aria-label="关卡进度" className="sampling-rail">
      <p className="eyebrow">空间采样</p>
      <ol>
        {IMAGE_SAMPLING_STAGES.map((stage) => {
          const unlocked = samplingStageUnlocked(passedStages, stage.index);
          const passed = passedStages.includes(stage.index);
          const active = stage.index === stageIndex;
          return (
            <li key={stage.id}>
              <button
                aria-current={active ? "step" : undefined}
                className={`stage-link${active ? " is-active" : ""}${passed ? " is-passed" : ""}`}
                disabled={!unlocked}
                onClick={() => onSelect(stage.index)}
                type="button"
              >
                <span className="stage-titles">
                  <strong>{stage.title}</strong>
                  <span>{stage.englishTitle}</span>
                </span>
                <span aria-hidden="true" className="stage-mark">
                  {passed ? (
                    <Icon name="check" size={13} />
                  ) : unlocked ? (
                    <Icon name="circle" size={11} />
                  ) : (
                    <Icon name="lock" size={12} />
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function StageBrief({ stage }: { stage: SamplingStageDef }) {
  return (
    <section className="stage-brief">
      <p>{stage.description}</p>
      <p className="submit-note">
        判题方式：把本类的每一张图（包括你没见过的隐藏成员）都缩到你选的分辨率，
        要求缩小后仍然各不相同——需要 ≥{Math.round(stage.requiredAccuracy * 100)}% 可区分， 且格子数
        ≤ {stage.cellBudget}。
        {stage.mode === "square"
          ? "本关只允许正方形（宽=高）。"
          : stage.mode === "tall"
            ? "本关要求高度大于宽度（高 > 宽）。"
            : "本关宽和高可以不同。"}
      </p>
      <details className="stage-details">
        <summary>提示</summary>
        <p>{stage.hint}</p>
      </details>
    </section>
  );
}

export function ImageSamplingLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/image-sampling" });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, role } = useAuth();
  const [state, dispatch] = useReducer(transitionSamplingLesson, undefined, () =>
    createSamplingLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scenarioApplied = useRef(false);

  const stage = stageOf(state);
  const draft = draftOf(state);

  const { projectLoaded, loadError } = useLabProject<
    StageDraft,
    Record<never, never>,
    SamplingLessonAction
  >({
    classId,
    labId: "image-sampling",
    ready: status === "authenticated",
    toAction: (project) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: Object.fromEntries(
        Object.entries(project.drafts ?? {}).map(([key, value]) => [Number(key), value]),
      ),
    }),
    dispatch,
  });

  // Apply a shared scenario (?stage=&w=&h=) once, after the project loads.
  useEffect(() => {
    if (scenarioApplied.current || !projectLoaded) return;
    scenarioApplied.current = true;
    const scenario = parseSamplingScenario(search);
    if (scenario.stageIndex != null && isStageUnlocked(state, scenario.stageIndex)) {
      dispatch({ type: "select-stage", stageIndex: scenario.stageIndex });
    }
    if (scenario.width != null) {
      dispatch({
        type: "set-resolution",
        width: scenario.width,
        height: scenario.height ?? scenario.width,
      });
    }
    // A shared scenario link is a starting point, not a live binding to the URL.
  }, [projectLoaded]);

  useAutosaveDraft<StageDraft>({
    classId,
    labId: "image-sampling",
    saveStatus: state.saveStatus,
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
    const resolution = draftResolution(state, stage);
    if (!resolution) {
      dispatch({ type: "message", text: "先选一个分辨率再提交。" });
      return;
    }
    setSubmitting(true);
    try {
      const outcome = await api.post<SamplingJudgeResult>(
        `/api/classes/${classId}/labs/image-sampling/judge`,
        {
          stageIndex: stage.index,
          width: resolution.width,
          height: resolution.height,
          code: draft.code || undefined,
        },
      );
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, state, draft.code]);

  const resolution = stage ? draftResolution(state, stage) : null;
  const previewWidth = draft.width ?? 8;
  const previewHeight = stage?.mode === "square" ? previewWidth : (draft.height ?? 8);

  return (
    <LabAccessGate adminPreview classId={classId} labName="空间采样" role={role} status={status}>
      <AppPageLayout
        className="sampling-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "空间采样",
        }}
      >
        <div className="page-content sampling-layout">
          <StageNav
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
          />

          <main aria-label="图像采样实验区" className="sampling-workspace">
            {stage ? <StageBrief stage={stage} /> : null}

            {state.message ? (
              <p className="test-error" role="alert">
                {state.message}
                <button onClick={() => dispatch({ type: "dismiss-message" })} type="button">
                  <Icon name="x" size={12} />
                </button>
              </p>
            ) : null}
            {(loadError ?? submitError) ? (
              <p className="test-error" role="alert">
                {loadError ?? submitError}
              </p>
            ) : null}

            {stage?.guided ? (
              <GuidedCellTask
                code={draft.code}
                onCodeChange={(code) => dispatch({ type: "set-code", code })}
              />
            ) : null}

            {stage ? (
              <>
                <DownsampleExplorer
                  height={previewHeight}
                  onCellPick={(cell) => dispatch({ type: "select-cell", cell })}
                  onResolution={(w, h) => dispatch({ type: "set-resolution", width: w, height: h })}
                  selectedCell={state.selectedCell}
                  stage={stage}
                  width={previewWidth}
                />

                {!stage.guided ? (
                  <ChooseSizePanel
                    code={draft.code}
                    helperCode={draftOf(state, 1).code}
                    onCodeChange={(code) => dispatch({ type: "set-code", code })}
                    onResolution={(w, h) =>
                      dispatch({ type: "set-resolution", width: w, height: h })
                    }
                    stage={stage}
                  />
                ) : null}

                <div className="submit-row">
                  <button
                    className="button button-primary"
                    disabled={submitting || !resolution}
                    onClick={() => void onSubmit()}
                    type="button"
                  >
                    {submitting ? "判定中…" : "提交判定"}
                  </button>
                  <span className="submit-note">
                    {resolution
                      ? `将以 ${resolution.width}×${resolution.height}（${resolution.width * resolution.height} 格）在含隐藏成员的完整图库上判题。`
                      : "先选一个分辨率。"}
                  </span>
                </div>

                {state.judgeOutcome ? (
                  <RecognitionPanel outcome={state.judgeOutcome} stage={stage} />
                ) : null}
              </>
            ) : null}
          </main>
        </div>
      </AppPageLayout>
    </LabAccessGate>
  );
}
