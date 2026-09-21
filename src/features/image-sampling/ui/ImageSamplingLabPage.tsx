import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { AppTopbar } from "../../../shared/layout/AppTopbar";
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
  type StageDraft,
} from "../lesson/state.ts";
import { parseSamplingScenario } from "../lesson/scenario.ts";
import { ChooseSizePanel } from "./ChooseSizePanel.tsx";
import { DownsampleExplorer } from "./DownsampleExplorer.tsx";
import { GuidedCellTask } from "./GuidedCellTask.tsx";
import { RecognitionPanel } from "./RecognitionPanel.tsx";
import "./imageSampling.css";

const AUTOSAVE_DELAY_MS = 1500;

const SAVE_LABEL: Record<string, string> = {
  idle: "",
  dirty: "未保存",
  saving: "保存中…",
  saved: "已保存 ✓",
  error: "保存失败",
};

type ProjectPayload = {
  currentStage: number;
  passedStages: number[];
  drafts: Record<string, StageDraft>;
};

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
                  {passed ? "✓" : unlocked ? "○" : "🔒"}
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
        判题方式：把图库中每一张都缩到你选的分辨率，要求缩小后仍然是唯一的—— 需要 ≥
        {Math.round(stage.requiredAccuracy * 100)}% 可区分，且格子数 ≤ {stage.cellBudget}。
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
  const { classId } = useParams({ strict: false }) as { classId?: string };
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, role } = useAuth();
  const [state, dispatch] = useReducer(transitionSamplingLesson, undefined, () =>
    createSamplingLessonState(1),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const scenarioApplied = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveStatusRef = useRef(state.saveStatus);
  saveStatusRef.current = state.saveStatus;

  const stage = stageOf(state);
  const draft = draftOf(state);

  useEffect(() => {
    if (!classId || status !== "authenticated") return;
    void api
      .get<ProjectPayload>(`/api/classes/${classId}/labs/image-sampling/project`)
      .then((project) => {
        dispatch({
          type: "load-project",
          currentStage: project.currentStage,
          passedStages: project.passedStages,
          drafts: Object.fromEntries(
            Object.entries(project.drafts ?? {}).map(([key, value]) => [
              Number(key),
              value as StageDraft,
            ]),
          ),
        });
      })
      .catch((error) => setLoadError(describeApiError(error)));
  }, [classId, status]);

  // Apply a shared scenario (?stage=&w=&h=) once, after the project loads.
  useEffect(() => {
    if (scenarioApplied.current || state.passedStages === undefined) return;
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
    // Runs once on mount: a shared scenario link is a starting point, not a
    // live binding to the URL.
  }, []);

  // Debounced autosave of the per-stage draft.
  useEffect(() => {
    if (saveStatusRef.current !== "dirty" || !classId) return;
    const stageIndex = state.stageIndex;
    const payload = draftOf(state, stageIndex);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      dispatch({ type: "mark-saving" });
      void api
        .put(`/api/classes/${classId}/labs/image-sampling/draft`, {
          stageIndex,
          draft: payload,
        })
        .then(() => dispatch({ type: "mark-saved" }))
        .catch(() => dispatch({ type: "mark-save-error" }));
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state.drafts, state.stageIndex, classId]);

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
      setLoadError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, state, draft.code]);

  if (status === "loading") {
    return (
      <p className="home-loading" role="status">
        正在载入…
      </p>
    );
  }
  if (status === "anonymous") {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">实验 / 需要登录</p>
        <h1>请先登录</h1>
        <div className="error-actions">
          <Link className="button button-primary" to="/login">
            去登录
          </Link>
        </div>
      </div>
    );
  }
  if (role === "teacher") {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">实验 / 预览阶段</p>
        <h1>这个实验暂未开放</h1>
        <p>「空间采样」实验目前仅对管理员开放预览。</p>
        <div className="error-actions">
          <Link className="button button-primary" to="/">
            返回首页
          </Link>
        </div>
      </div>
    );
  }
  if (!classId) {
    return (
      <div className="not-found" role="status">
        <p className="eyebrow">实验 / 未加入班级</p>
        <h1>你还没有加入班级</h1>
        <div className="error-actions">
          <Link className="button button-primary" to="/">
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  const resolution = stage ? draftResolution(state, stage) : null;
  const previewWidth = draft.width ?? 8;
  const previewHeight = stage?.mode === "square" ? previewWidth : (draft.height ?? 8);

  return (
    <div className="sampling-lab">
      <AppTopbar
        subtitle={stage?.englishTitle}
        title={stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "空间采样"}
      >
        <span aria-live="polite" className={`save-indicator is-${state.saveStatus}`}>
          {SAVE_LABEL[state.saveStatus]}
        </span>
      </AppTopbar>

      <div className="sampling-layout">
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
                ×
              </button>
            </p>
          ) : null}
          {loadError ? (
            <p className="test-error" role="alert">
              {loadError}
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
                  onCodeChange={(code) => dispatch({ type: "set-code", code })}
                  onResolution={(w, h) => dispatch({ type: "set-resolution", width: w, height: h })}
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

              {state.judgeOutcome ? <RecognitionPanel outcome={state.judgeOutcome} /> : null}
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}
