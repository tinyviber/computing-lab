import { Link, useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import type { QuantJudgeResult } from "../domain/protocol.ts";
import { COLOR_QUANT_STAGES, quantStageUnlocked, type QuantStageDef } from "../domain/stages.ts";
import {
  createQuantLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  transitionQuantLesson,
  type StageDraft,
} from "../lesson/state.ts";
import { parseQuantScenario } from "../lesson/scenario.ts";
import { ChooseTonersPanel } from "./ChooseTonersPanel.tsx";
import { FreeMapPanel } from "./FreeMapPanel.tsx";
import { GuidedTonerTask } from "./GuidedTonerTask.tsx";
import { QuantExplorer } from "./QuantExplorer.tsx";
import { QuantResultPanel } from "./QuantResultPanel.tsx";
import "./colorQuantization.css";

const AUTOSAVE_DELAY_MS = 1500;

const SAVE_LABEL: Record<string, string> = {
  idle: "",
  dirty: "未保存",
  saving: "保存中…",
  saved: "已保存",
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
    <aside aria-label="关卡进度" className="quant-rail">
      <p className="eyebrow">颜色量化</p>
      <ol>
        {COLOR_QUANT_STAGES.map((stage) => {
          const unlocked = quantStageUnlocked(passedStages, stage.index);
          const passed = passedStages.includes(stage.index);
          const active = stage.index === stageIndex;
          return (
            <li key={stage.id}>
              <button
                aria-current={active ? "step" : undefined}
                className={`quant-stage-link${active ? " is-active" : ""}${passed ? " is-passed" : ""}`}
                disabled={!unlocked}
                onClick={() => onSelect(stage.index)}
                type="button"
              >
                <span className="quant-stage-titles">
                  <strong>{stage.title}</strong>
                  <span>{stage.englishTitle}</span>
                </span>
                <span aria-hidden="true" className="quant-stage-mark">
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

function StageBrief({ stage }: { stage: QuantStageDef }) {
  return (
    <section className="quant-brief">
      <p>{stage.description}</p>
      <p className="quant-submit-note">
        判题方式：把本类的每一台机器人都按你的选择打印，要求打印后仍然各不相同—— 需要 ≥
        {Math.round(stage.requiredAccuracy * 100)}% 可区分
        {stage.mode === "pick"
          ? `，且最多装 ${stage.tonerSlots} 种粉（纸白不计）`
          : `，粉盒固定，映射最多改 ${stage.overrideBudget} 条默认值`}
        。
      </p>
      <p className="quant-hidden-note">
        注意：提交时除了你看到的这些，还会混入<strong>没见过的同类机器人</strong>一起判定。
        这是为了检查你的方法是真的理解了规则，而不只是记住了这几张图的答案——
        在公开图库上全对，不代表隐藏成员也能分开。
      </p>
      <details className="quant-details">
        <summary>提示</summary>
        <p>{stage.hint}</p>
      </details>
    </section>
  );
}

export function ColorQuantizationLabPage() {
  const { classId } = useParams({ strict: false }) as { classId?: string };
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, role } = useAuth();
  const [state, dispatch] = useReducer(transitionQuantLesson, undefined, () =>
    createQuantLessonState(1),
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [projectLoaded, setProjectLoaded] = useState(false);
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
      .get<ProjectPayload>(`/api/classes/${classId}/labs/color-quantization/project`)
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
        setProjectLoaded(true);
      })
      .catch((error) => setLoadError(describeApiError(error)));
  }, [classId, status]);

  // Apply a shared scenario (?stage=&toners=/&table=) once — but only after
  // the project loads, or unlocked stages would look locked at mount.
  useEffect(() => {
    if (scenarioApplied.current || !projectLoaded) return;
    scenarioApplied.current = true;
    const scenario = parseQuantScenario(search);
    if (scenario.stageIndex != null && isStageUnlocked(state, scenario.stageIndex)) {
      dispatch({ type: "select-stage", stageIndex: scenario.stageIndex });
    }
    if (scenario.toners) dispatch({ type: "set-toners", toners: scenario.toners });
    if (scenario.table) dispatch({ type: "set-table", table: scenario.table });
    // A shared scenario link is a starting point, not a live binding to the URL.
  }, [projectLoaded]);

  // Debounced autosave of the per-stage draft.
  useEffect(() => {
    if (saveStatusRef.current !== "dirty" || !classId) return;
    const stageIndex = state.stageIndex;
    const payload = draftOf(state, stageIndex);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      dispatch({ type: "mark-saving" });
      void api
        .put(`/api/classes/${classId}/labs/color-quantization/draft`, {
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

  const canSubmit =
    stage?.mode === "pick"
      ? draft.toners.length > 0
      : draft.table !== null && draft.table.length > 0;

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
    if (stage.mode === "pick" && draft.toners.length === 0) {
      dispatch({ type: "message", text: "先选要装哪几种粉再提交。" });
      return;
    }
    if (stage.mode === "free" && !draft.table) {
      dispatch({ type: "message", text: "先生成一张映射表再提交。" });
      return;
    }
    setSubmitting(true);
    try {
      const outcome = await api.post<QuantJudgeResult>(
        `/api/classes/${classId}/labs/color-quantization/judge`,
        {
          stageIndex: stage.index,
          ...(stage.mode === "pick" ? { toners: draft.toners } : { table: draft.table }),
          code: draft.code || undefined,
        },
      );
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setLoadError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, state, draft]);

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
        <p>「颜色量化」实验目前仅对管理员开放预览。</p>
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

  return (
    <AppPageLayout
      className="quant-lab"
      topbar={
        <span aria-live="polite" className={`save-indicator is-${state.saveStatus}`}>
          {state.saveStatus === "saved" ? <Icon name="check" size={11} /> : null}
          {SAVE_LABEL[state.saveStatus]}
        </span>
      }
      topbarProps={{
        subtitle: stage?.englishTitle,
        title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "颜色量化",
      }}
    >
      <div className="page-content quant-layout">
        <StageNav
          onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
          passedStages={state.passedStages}
          stageIndex={state.stageIndex}
        />

        <main aria-label="颜色量化实验区" className="quant-workspace">
          {stage ? <StageBrief stage={stage} /> : null}

          {state.message ? (
            <p className="quant-error" role="alert">
              {state.message}
              <button onClick={() => dispatch({ type: "dismiss-message" })} type="button">
                <Icon name="x" size={12} />
              </button>
            </p>
          ) : null}
          {loadError ? (
            <p className="quant-error" role="alert">
              {loadError}
            </p>
          ) : null}

          {stage?.guided ? (
            <GuidedTonerTask
              code={draft.code}
              onCodeChange={(code) => dispatch({ type: "set-code", code })}
            />
          ) : null}

          {stage ? (
            <>
              <QuantExplorer
                draft={draft}
                onTable={(table) => dispatch({ type: "set-table", table })}
                onToners={(toners) => dispatch({ type: "set-toners", toners })}
                stage={stage}
              />

              {!stage.guided && stage.mode === "pick" ? (
                <ChooseTonersPanel
                  code={draft.code}
                  helperCode={draftOf(state, 1).code}
                  onCodeChange={(code) => dispatch({ type: "set-code", code })}
                  onToners={(toners) => dispatch({ type: "set-toners", toners })}
                  stage={stage}
                />
              ) : null}

              {!stage.guided && stage.mode === "free" ? (
                <FreeMapPanel
                  code={draft.code}
                  helperCode={draftOf(state, 1).code}
                  onCodeChange={(code) => dispatch({ type: "set-code", code })}
                  onTable={(table) => dispatch({ type: "set-table", table })}
                  stage={stage}
                  table={draft.table}
                />
              ) : null}

              <div className="quant-submit-row">
                <button
                  className="button button-primary"
                  disabled={submitting || !canSubmit}
                  onClick={() => void onSubmit()}
                  type="button"
                >
                  {submitting ? "判定中…" : "提交判定"}
                </button>
                <span className="quant-submit-note">
                  {stage.mode === "pick"
                    ? draft.toners.length
                      ? `将以 ${draft.toners.length} 种粉（编号 ${draft.toners.join(", ")}）在含隐藏成员的完整图库上判题。`
                      : "先选要装哪几种粉。"
                    : draft.table
                      ? "将以你的映射表在含隐藏成员的完整图库上判题。"
                      : "先在下方运行 map_color 生成映射表。"}
                </span>
              </div>

              {state.judgeOutcome ? (
                <QuantResultPanel outcome={state.judgeOutcome} stage={stage} />
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </AppPageLayout>
  );
}
