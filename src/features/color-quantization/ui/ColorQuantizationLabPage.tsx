import { useParams, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { StageRail } from "../../../shared/lab/StageRail";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import type { QuantJudgeResult, QuantSubmission } from "../domain/protocol.ts";
import { COLOR_QUANT_STAGES, quantStageUnlocked, type QuantStageDef } from "../domain/stages.ts";
import {
  createQuantLessonState,
  draftOf,
  isStageUnlocked,
  stageOf,
  transitionQuantLesson,
  type QuantLessonAction,
  type StageDraft,
} from "../lesson/state.ts";
import { parseQuantScenario } from "../lesson/scenario.ts";
import { ChooseTonersPanel } from "./ChooseTonersPanel.tsx";
import { FreeMapPanel } from "./FreeMapPanel.tsx";
import { GuidedTonerTask } from "./GuidedTonerTask.tsx";
import { QuantExplorer } from "./QuantExplorer.tsx";
import { QuantResultPanel } from "./QuantResultPanel.tsx";
import "./colorQuantization.css";

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
  const { classId } = useParams({ from: "/classes/$classId/labs/color-quantization" });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, role } = useAuth();
  const [state, dispatch] = useReducer(transitionQuantLesson, undefined, () =>
    createQuantLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scenarioApplied = useRef(false);

  const stage = stageOf(state);
  const draft = draftOf(state);

  const { projectLoaded, loadError } = useLabProject<
    StageDraft,
    Record<never, never>,
    QuantLessonAction
  >({
    classId,
    labId: "color-quantization",
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

  useAutosaveDraft<StageDraft>({
    classId,
    labId: "color-quantization",
    saveStatus: state.saveStatus,
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

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
      const submission: QuantSubmission = {
        stageIndex: stage.index,
        ...(stage.mode === "pick" ? { toners: draft.toners } : { table: draft.table ?? undefined }),
        code: draft.code || undefined,
      };
      const outcome = await api.post<QuantJudgeResult>(
        `/api/classes/${classId}/labs/color-quantization/judge`,
        submission,
      );
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, state, draft]);

  return (
    <LabAccessGate adminPreview classId={classId} labName="颜色量化" role={role} status={status}>
      <AppPageLayout
        className="quant-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "颜色量化",
        }}
      >
        <div className="page-content quant-layout">
          <StageRail
            label="颜色量化"
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            stages={COLOR_QUANT_STAGES}
            unlocked={(stage) => quantStageUnlocked(state.passedStages, stage.index)}
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
            {(loadError ?? submitError) ? (
              <p className="quant-error" role="alert">
                {loadError ?? submitError}
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
    </LabAccessGate>
  );
}
