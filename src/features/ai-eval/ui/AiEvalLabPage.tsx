/**
 * ai-eval lab page — the black-box QA bench. All probing is
 * server-dispatched: this page asks /draws for answers, folds them into a
 * display cache, and records only `{probe, drawId}` evidence in the draft.
 * The judge replays the transcript under the user's seed.
 */

import { useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { api, describeApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth";
import { LabAccessGate, SaveIndicator } from "../../../shared/lab/LabGate";
import { useLabCatalog } from "../../../shared/lab/labs";
import { StageRail } from "../../../shared/lab/StageRail";
import { useAutosaveDraft } from "../../../shared/lab/useAutosaveDraft";
import { useLabProject } from "../../../shared/lab/useLabProject";
import { AppPageLayout } from "../../../shared/layout/AppTopbar";
import { Icon } from "../../../shared/ui/Icon";
import { HintDisclosure } from "../../calculator/ui/HintDisclosure";
import type { MatrixColumn, PhrasingDim, Probe } from "../domain/probe.ts";
import {
  C3_DRAW_COUNT,
  VERIFY_QUOTA,
  type AiEvalDraft,
  type AiEvalJudgeResult,
  type AiEvalProjectExtras,
  type DrawPayload,
  type DrawsResponse,
  type VerifyResponse,
} from "../domain/protocol.ts";
import { aiEvalStageUnlocked, AI_EVAL_STAGES, type AiEvalStageDef } from "../domain/stages.ts";
import {
  createAiEvalLessonState,
  draftOf,
  stageOf,
  transitionAiEvalLesson,
  type AiEvalLessonAction,
} from "../lesson/state.ts";
import { AiEvalTestPanel } from "./AiEvalTestPanel.tsx";
import { AnswerCard } from "./AnswerCard.tsx";
import { FactTable } from "./FactTable.tsx";
import { PhrasingMatrix } from "./PhrasingMatrix.tsx";
import { ProbeConsole } from "./ProbeConsole.tsx";
import { StabilityBoard } from "./StabilityBoard.tsx";
import "./aiEval.css";

function StageBrief({ stage }: { stage: AiEvalStageDef }) {
  return (
    <section className="stage-brief">
      <p>{stage.description}</p>
      <p className="is-task">
        <strong>任务：</strong>
        {stage.task}
      </p>
      <p className="submit-note">判题方式：{stage.judgeNote}</p>
      <HintDisclosure hint={stage.hint} />
    </section>
  );
}

export function AiEvalLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/ai-eval" });
  const { status, role } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionAiEvalLesson, undefined, () =>
    createAiEvalLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  /** fieldId → verify outcome (display cache; quota itself is server-side). */
  const [verified, setVerified] = useState<Record<string, { truth: string | null }>>({});
  const [quotaLeft, setQuotaLeft] = useState(VERIFY_QUOTA);

  const stage = stageOf(state);
  const draft = draftOf(state);

  const labPath = `/api/classes/${classId}/labs/ai-eval`;

  const { loadError } = useLabProject<AiEvalDraft, AiEvalProjectExtras, AiEvalLessonAction>({
    classId,
    labId: "ai-eval",
    ready: status === "authenticated",
    toAction: (project) => ({
      type: "load-project",
      currentStage: project.currentStage,
      passedStages: project.passedStages,
      drafts: project.drafts,
      extras: project.aiEval ?? null,
    }),
    dispatch,
  });

  useAutosaveDraft<AiEvalDraft>({
    classId,
    labId: "ai-eval",
    saveStatus: state.saveStatus,
    stageIndex: state.stageIndex,
    draftOf: (index) => draftOf(state, index),
    deps: [state.drafts],
    onSaving: () => dispatch({ type: "mark-saving" }),
    onSaved: () => dispatch({ type: "mark-saved" }),
    onError: () => dispatch({ type: "mark-save-error" }),
  });

  // Rehydrate the payload cache: issued draws are deterministic, so replay
  // their probes to get the answers back after a reload.
  const rehydrated = useRef(false);
  useEffect(() => {
    if (rehydrated.current || Object.keys(state.drafts).length === 0) return;
    rehydrated.current = true;
    const probes: { stageIndex: number; probe: Probe }[] = [];
    for (const [key, d] of Object.entries(state.drafts)) {
      for (const issued of d._srv?.issued ?? []) {
        probes.push({ stageIndex: Number(key), probe: issued.probe });
      }
    }
    // Seed the verify display from the stored log.
    for (const d of Object.values(state.drafts)) {
      for (const f of d.verifyLog)
        setVerified((v) => (f in v ? v : { ...v, [f]: { truth: null } }));
    }
    const quota = state.drafts[3]?.verifyLog.length ?? 0;
    setQuotaLeft(VERIFY_QUOTA - quota);
    void (async () => {
      for (let i = 0; i < probes.length; i += 8) {
        const chunk = probes.slice(i, i + 8);
        const stageIndex = chunk[0].stageIndex;
        try {
          const res = await api.post<DrawsResponse>(`${labPath}/draws`, {
            stageIndex,
            probes: chunk.map((c) => c.probe),
          });
          dispatch({ type: "draws-received", draws: res.draws });
        } catch {
          /* payloads just won't render; transcript stays intact */
        }
      }
    })();
  }, [state.drafts, labPath]);

  const postDraws = useCallback(
    async (probes: Probe[]): Promise<DrawPayload[] | null> => {
      if (!stage) return null;
      setBusy(true);
      setSubmitError(null);
      try {
        const res = await api.post<DrawsResponse>(`${labPath}/draws`, {
          stageIndex: stage.index,
          probes,
        });
        dispatch({ type: "draws-received", draws: res.draws });
        // Mirror the server ledger so counts/locks react without a reload.
        const baseSeq = (draft._srv?.seq ?? 0) + 1;
        dispatch({
          type: "issued-appended",
          stageIndex: stage.index,
          entries: res.draws.map((d, i) => ({
            probe: d.probe,
            drawId: d.drawId,
            seq: baseSeq + i,
          })),
        });
        return res.draws;
      } catch (error) {
        setSubmitError(describeApiError(error));
        return null;
      } finally {
        setBusy(false);
      }
    },
    [labPath, stage, draft],
  );

  /* ------------------------------ stage 1 ---------------------------- */

  const c1Questions = useMemo(() => state.extras?.stages["1"].questions ?? [], [state.extras]);
  const c1DrawsFor = useCallback(
    (questionId: string) =>
      state.drafts[1]?._srv?.issued
        .filter((i) => i.probe.questionId === questionId)
        .map((i) => state.drawsById[i.drawId])
        .filter(Boolean) ?? [],
    [state.drafts, state.drawsById],
  );
  const c1IssuedCount = useCallback(
    (questionId: string) =>
      state.drafts[1]?._srv?.issued.filter((i) => i.probe.questionId === questionId).length ?? 0,
    [state.drafts],
  );
  const c1Collected = useCallback(
    (questionId: string) =>
      draft.transcript
        .filter((r) => r.probe.questionId === questionId)
        .map((r) => state.drawsById[r.drawId])
        .filter(Boolean),
    [draft, state.drawsById],
  );

  const onC1Draw = useCallback(
    (questionId: string, count: number) => {
      const next = c1IssuedCount(questionId);
      const probes = Array.from({ length: Math.min(count, 8 - next) }, (_, i) => ({
        questionId,
        phrasing: [] as PhrasingDim[],
        k: next + i,
      }));
      void postDraws(probes);
    },
    [c1IssuedCount, postDraws],
  );

  /* ------------------------------ stage 2 ---------------------------- */

  const c2QuestionBrief = state.extras?.stages["2"].question;
  const predictionsLocked =
    (state.drafts[2]?.predictedAt ?? null) !== null &&
    Object.keys(state.drafts[2]?.predictions ?? {}).length > 0;
  const c2DrawsLocked = (state.drafts[2]?._srv?.issued.length ?? 0) > 0;

  const onSavePredictions = useCallback(async () => {
    // Persist first — the server refuses draws until predictions are on file.
    try {
      await api.put(`${labPath}/draft`, { stageIndex: 2, draft: draftOf(state, 2) });
      // predictedAt lands via the PUT; mark locally locked until reload.
      dispatch({
        type: "load-project",
        currentStage: state.currentStage,
        passedStages: state.passedStages,
        drafts: {
          ...state.drafts,
          2: { ...draftOf(state, 2), predictedAt: 1 },
        },
        extras: state.extras,
      });
      return true;
    } catch (error) {
      setSubmitError(describeApiError(error));
      return false;
    }
  }, [labPath, state]);

  const onRunColumn = useCallback(
    (column: MatrixColumn) => {
      const q = c2QuestionBrief;
      if (!q) return;
      const phrasing = column === "base" ? [] : [column as PhrasingDim];
      const existing = state.drafts[2]?.matrix[column]?.length ?? 0;
      const probes = Array.from({ length: 3 - existing }, (_, i) => ({
        questionId: q.id,
        phrasing,
        k: existing + i,
      }));
      void postDraws(probes).then((draws) => {
        if (!draws) return;
        dispatch({
          type: "set-matrix-column",
          column,
          drawIds: [...(state.drafts[2]?.matrix[column] ?? []), ...draws.map((d) => d.drawId)],
        });
      });
    },
    [c2QuestionBrief, postDraws, state.drafts],
  );

  /* ------------------------------ stage 3 ---------------------------- */

  const c3Draws = useMemo(() => {
    const issued = state.drafts[3]?._srv?.issued ?? [];
    return issued
      .slice()
      .sort((a, b) => a.probe.k - b.probe.k)
      .map((i) => state.drawsById[i.drawId])
      .filter(Boolean);
  }, [state.drafts, state.drawsById]);

  const onC3Next = useCallback(() => {
    const next = state.drafts[3]?._srv?.issued.length ?? 0;
    if (next >= C3_DRAW_COUNT) return;
    void postDraws([{ questionId: "*", phrasing: [], k: next }]);
  }, [postDraws, state.drafts]);

  const onVerify = useCallback(
    async (draw: DrawPayload, slotIndex: number) => {
      setBusy(true);
      try {
        const res = await api.post<VerifyResponse>(`${labPath}/verify`, {
          stageIndex: 3,
          drawId: draw.drawId,
          slotIndex,
        });
        setVerified((v) => ({ ...v, [res.fieldId]: { truth: res.truth } }));
        setQuotaLeft(res.quotaLeft);
        // Fold the server-side verifyLog into the draft locally so the
        // verdict picker's options update without a full reload.
        dispatch({
          type: "load-project",
          currentStage: state.currentStage,
          passedStages: state.passedStages,
          drafts: {
            ...state.drafts,
            3: {
              ...draftOf(state, 3),
              verifyLog: [...draftOf(state, 3).verifyLog, res.fieldId],
            },
          },
          extras: state.extras,
        });
      } catch (error) {
        setSubmitError(describeApiError(error));
      } finally {
        setBusy(false);
      }
    },
    [labPath, state],
  );

  /* ------------------------------- submit ---------------------------- */

  const onSubmit = useCallback(async () => {
    if (!classId || !stage) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const outcome = await api.post<AiEvalJudgeResult>(`${labPath}/judge`, {
        stageIndex: stage.index,
        draft,
      });
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, draft, labPath]);

  const collectedIds = useMemo(
    () => new Set(draft.transcript.map((r) => r.drawId)),
    [draft.transcript],
  );

  return (
    <LabAccessGate
      adminPreview
      classId={classId}
      hidden={catalog?.get("ai-eval")?.hidden === true}
      labName="测一测AI"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="ai-eval-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{
          subtitle: stage?.englishTitle,
          title: stage ? `${String(stage.index).padStart(2, "0")} ${stage.title}` : "测一测AI",
        }}
      >
        <div className="page-content ae-layout">
          <StageRail
            label="测一测AI"
            onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
            passedStages={state.passedStages}
            stageIndex={state.stageIndex}
            stages={AI_EVAL_STAGES}
            unlocked={(s) => aiEvalStageUnlocked(state.passedStages, s.index)}
          />

          <main aria-label="AI 评测实验区" className="ae-workspace">
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

            {stage?.index === 1 ? (
              <>
                <ProbeConsole
                  busy={busy}
                  collectedIds={collectedIds}
                  drawsFor={c1DrawsFor}
                  issuedCount={c1IssuedCount}
                  onCollect={(drawId, collect) =>
                    dispatch({ type: collect ? "collect" : "uncollect", drawId })
                  }
                  onDraw={onC1Draw}
                  questions={c1Questions}
                  renderDraw={(d, collected) => (
                    <AnswerCard
                      collected={collected}
                      draw={d}
                      onCollect={(id, c) =>
                        dispatch({ type: c ? "collect" : "uncollect", drawId: id })
                      }
                    />
                  )}
                />
                <StabilityBoard
                  collectedFor={c1Collected}
                  onRate={(qid, rating) =>
                    dispatch({ type: "set-rating", questionId: qid, rating })
                  }
                  questions={c1Questions}
                  ratings={draft.ratings}
                />
              </>
            ) : null}

            {stage?.index === 2 && c2QuestionBrief ? (
              <PhrasingMatrix
                busy={busy}
                drawsById={state.drawsById}
                matrix={draft.matrix}
                onPredict={(dim, value) => dispatch({ type: "set-prediction", dim, value })}
                onRunColumn={onRunColumn}
                onSavePredictions={onSavePredictions}
                predictions={draft.predictions}
                predictionsLocked={predictionsLocked || c2DrawsLocked}
                question={c2QuestionBrief}
              />
            ) : null}

            {stage?.index === 3 ? (
              <FactTable
                busy={busy}
                draft={draft}
                draws={c3Draws}
                onNext={onC3Next}
                onVerdict={(drawId, choice) => dispatch({ type: "set-verdict", drawId, choice })}
                onVerify={onVerify}
                verified={verified}
                verifyQuotaLeft={quotaLeft}
              />
            ) : null}

            {stage ? (
              <div className="submit-row">
                <button
                  className="button button-primary"
                  disabled={submitting}
                  onClick={() => void onSubmit()}
                  type="button"
                >
                  {submitting ? "判定中…" : "提交判定"}
                </button>
                <span className="submit-note">服务器会按同一批 seed 重放你的证据再判分。</span>
              </div>
            ) : null}

            <AiEvalTestPanel judgeOutcome={state.judgeOutcome} />
          </main>
        </div>
      </AppPageLayout>
    </LabAccessGate>
  );
}
