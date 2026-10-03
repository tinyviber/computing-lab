import { useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { isStaffRole, useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { LabPageShell } from "../../../shared/lab/LabPageShell";
import { useLabCatalog } from "../../../shared/lab/labs";
import { StageRail } from "../../../shared/lab/StageRail";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import type { SamplingJudgeResult, SamplingSubmission } from "../domain/protocol.ts";
import {
  IMAGE_SAMPLING_STAGES,
  samplingStageUnlocked,
  type SamplingStageDef,
} from "../domain/stages.ts";
import {
  createSamplingLessonState,
  draftOf,
  draftResolution,
  stageOf,
  transitionSamplingLesson,
  type SamplingLessonAction,
  type StageDraft,
} from "../lesson/state.ts";
import {
  encodeSamplingScenario,
  parseSamplingScenario,
  samplingScenarioActions,
} from "../lesson/scenario.ts";
import { ChooseSizePanel } from "./ChooseSizePanel.tsx";
import { DownsampleExplorer } from "./DownsampleExplorer.tsx";
import { GuidedCellTask } from "./GuidedCellTask.tsx";
import { warmPyodide } from "./pyodideRunner.ts";
import { RecognitionPanel } from "./RecognitionPanel.tsx";
import "./imageSampling.css";

function StageBrief({ stage }: { stage: SamplingStageDef }) {
  const resolutionSource = stage.requiresChooseSize ? "choose_size(images) 算出的" : "你选的";
  const axisNote =
    stage.mode === "square"
      ? "本关只允许正方形（宽=高）。"
      : stage.mode === "tall"
        ? "本关要求高度大于宽度（高 > 宽）。"
        : "本关宽和高可以不同。";
  return (
    <section className="stage-brief">
      <p className="stage-mission">{stage.mission}</p>
      <p>{stage.description}</p>
      <p className="submit-note">
        判定方式：{resolutionSource} {stage.mode === "square" ? "n×n" : "宽×高"}
        会套用到完整图谱上（包括你没见过的隐藏成员）。接收端凭格子图认人——≥
        {Math.round(stage.requiredAccuracy * 100)}% 的成员仍能被认出才算通过，且格子数 ≤
        {stage.cellBudget}。
        {stage.requiresChooseSize
          ? `本关必须先写并运行 choose_size(images)，不能手动指定分辨率。${axisNote}`
          : axisNote}
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
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionSamplingLesson, undefined, () =>
    createSamplingLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scenarioApplied = useRef(false);

  const stage = stageOf(state);
  const draft = draftOf(state);

  // Start downloading the Python runtime as soon as the lab opens,
  // so the first run doesn't spend its load budget on the fetch itself.
  useEffect(() => warmPyodide(), []);

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
    const actions = samplingScenarioActions(state, scenario);
    actions.forEach((action) => dispatch(action));
    // A shared scenario link is a starting point, not a live binding to the URL.
    // projectLoaded flips in the same batch as load-project, so `state` is fresh.
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
    if (stage.requiresChooseSize && !draft.code.trim()) {
      dispatch({ type: "message", text: "本关必须先填写并运行 choose_size(images)。" });
      return;
    }
    if (!resolution) {
      dispatch({
        type: "message",
        text: stage.requiresChooseSize
          ? "先运行 choose_size(images) 生成分辨率。"
          : "先选一个分辨率再提交。",
      });
      return;
    }
    setSubmitting(true);
    try {
      const submission: SamplingSubmission = {
        stageIndex: stage.index,
        width: resolution.width,
        height: resolution.height,
        code: draft.code || undefined,
      };
      const outcome = await api.post<SamplingJudgeResult>(
        `/api/classes/${classId}/labs/image-sampling/judge`,
        submission,
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

  const shareSearch =
    stage && isStaffRole(role) && !stage.requiresChooseSize
      ? encodeSamplingScenario({
          stageIndex: stage.index,
          width: previewWidth,
          height: previewHeight,
        })
      : undefined;

  return (
    <LabAccessGate
      classId={classId}
      closed={catalog?.get("image-sampling")?.visible === false}
      labName="空间采样"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="sampling-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage?.title ?? "空间采样",
        }}
      >
        <LabPageShell
          collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
          labId="image-sampling"
          rail={
            <StageRail
              label="空间采样"
              onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
              passedStages={state.passedStages}
              stageIndex={state.stageIndex}
              stages={IMAGE_SAMPLING_STAGES}
              unlocked={(stage) => samplingStageUnlocked(state.passedStages, stage.index)}
            />
          }
        >
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

            {stage ? (
              <>
                <DownsampleExplorer
                  height={previewHeight}
                  onCellPick={(cell) => dispatch({ type: "select-cell", cell })}
                  onResolution={(w, h) => dispatch({ type: "set-resolution", width: w, height: h })}
                  ruleCode={draftOf(state, 1).code}
                  resolutionReady={resolution != null}
                  selectedCell={state.selectedCell}
                  shareSearch={shareSearch}
                  stage={stage}
                  width={previewWidth}
                />

                {stage.guided ? (
                  <GuidedCellTask
                    code={draft.code}
                    onCodeChange={(code) => dispatch({ type: "set-code", code })}
                  />
                ) : null}

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
                    disabled={
                      submitting || !resolution || (stage.requiresChooseSize && !draft.code.trim())
                    }
                    onClick={() => void onSubmit()}
                    type="button"
                  >
                    {submitting ? "判定中…" : "提交判定"}
                  </button>
                  <span className="submit-note">
                    {resolution
                      ? stage.requiresChooseSize && !draft.code.trim()
                        ? "先填写并运行 choose_size(images)。"
                        : `将以 ${resolution.width}×${resolution.height}（${resolution.width * resolution.height} 格）把整组信号发给接收端判定。`
                      : stage.requiresChooseSize
                        ? "先运行 choose_size(images) 生成分辨率。"
                        : "先选一个分辨率。"}
                  </span>
                </div>

                {state.judgeOutcome ? (
                  <RecognitionPanel outcome={state.judgeOutcome} stage={stage} />
                ) : null}
              </>
            ) : null}
          </main>
        </LabPageShell>
      </AppPageLayout>
    </LabAccessGate>
  );
}
