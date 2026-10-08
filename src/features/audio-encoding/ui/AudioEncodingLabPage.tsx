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
import { ScenarioLinkButton } from "../../../shared/lab/ScenarioLinkButton";
import type { AudioEncodingJudgeResult, AudioEncodingSubmission } from "../domain/protocol.ts";
import { AUDIO_ENCODING_STAGES, audioStageUnlocked, type AudioStageDef } from "../domain/stages.ts";
import {
  createAudioLessonState,
  draftOf,
  draftParams,
  stageOf,
  transitionAudioLesson,
  type AudioLessonAction,
  type StageDraft,
} from "../lesson/state.ts";
import {
  encodeAudioScenario,
  audioScenarioActions,
  parseAudioScenario,
} from "../lesson/scenario.ts";
import { AudioWorkbench } from "./AudioWorkbench.tsx";
import "./audioEncoding.css";

function StageBrief({ stage }: { stage: AudioStageDef }) {
  return (
    <section className="stage-brief">
      <p className="stage-mission">{stage.mission}</p>
      <p>{stage.description}</p>

      <details className="stage-details">
        <summary>提示</summary>
        <p>{stage.hint}</p>
      </details>
      {stage.takeaway ? <p className="stage-takeaway">带走：{stage.takeaway}</p> : null}
    </section>
  );
}

export function AudioEncodingLabPage() {
  const { classId } = useParams({ from: "/classes/$classId/labs/audio-encoding" });
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { status, role, session } = useAuth();
  const catalog = useLabCatalog(status === "authenticated");
  const [state, dispatch] = useReducer(transitionAudioLesson, undefined, () =>
    createAudioLessonState(1),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scenarioApplied = useRef(false);

  const stage = stageOf(state);
  const draft = draftOf(state);
  const params = draftParams(state);

  const { projectLoaded, loadError } = useLabProject<
    StageDraft,
    Record<never, never>,
    AudioLessonAction
  >({
    classId,
    labId: "audio-encoding",
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

  useEffect(() => {
    if (scenarioApplied.current || !projectLoaded) return;
    scenarioApplied.current = true;
    const scenario = parseAudioScenario(search);
    audioScenarioActions(state, scenario).forEach((action) => dispatch(action));
  }, [projectLoaded]);

  useAutosaveDraft<StageDraft>({
    classId,
    labId: "audio-encoding",
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
    setSubmitError(null);
    setSubmitting(true);
    try {
      const submission: AudioEncodingSubmission = {
        stageIndex: stage.index,
        params: stage.kind === "guided" ? undefined : draftParams(state),
        guidedAnswers: stage.kind === "guided" ? draft.guidedAnswers : undefined,
      };
      const outcome = await api.post<AudioEncodingJudgeResult>(
        `/api/classes/${classId}/labs/audio-encoding/judge`,
        submission,
      );
      dispatch({ type: "judge-result", outcome });
    } catch (error) {
      setSubmitError(describeApiError(error));
    } finally {
      setSubmitting(false);
    }
  }, [classId, stage, draft]);

  const shareSearch =
    stage && isStaffRole(role)
      ? encodeAudioScenario({
          stageIndex: stage.index,
          params: {
            sampleRate: params.sampleRate,
            bitDepth: params.bitDepth,
            channels: params.channels,
          },
        })
      : undefined;

  return (
    <LabAccessGate
      classId={classId}
      closed={catalog?.get("audio-encoding")?.visible === false}
      labName="声音编码"
      role={role}
      status={status}
    >
      <AppPageLayout
        className="audio-encoding-lab"
        topbar={<SaveIndicator status={state.saveStatus} />}
        topbarProps={{ subtitle: stage?.englishTitle, title: stage?.title ?? "声音编码" }}
      >
        <LabPageShell
          collapsedLabel={stage ? `第 ${stage.index} 关` : undefined}
          labId="audio-encoding"
          rail={
            <StageRail
              label="声音编码"
              onSelect={(index) => dispatch({ type: "select-stage", stageIndex: index })}
              passedStages={state.passedStages}
              stageIndex={state.stageIndex}
              stages={AUDIO_ENCODING_STAGES}
              unlocked={(s) => audioStageUnlocked(state.passedStages, s.index)}
            />
          }
        >
          <main aria-label="声音编码实验区" className="ae-workspace">
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
            {shareSearch ? <ScenarioLinkButton search={shareSearch} /> : null}
            {stage ? (
              <AudioWorkbench
                busy={submitting}
                guidedAnswers={draft.guidedAnswers}
                onGuidedAnswer={(promptId, choice) =>
                  dispatch({ type: "set-guided-answer", promptId, choice })
                }
                onParams={(p) => dispatch({ type: "set-params", params: p })}
                onSubmit={() => void onSubmit()}
                params={params}
                stage={stage}
                userId={session?.user.id}
                verdict={state.judgeOutcome}
              />
            ) : null}
          </main>
        </LabPageShell>
      </AppPageLayout>
    </LabAccessGate>
  );
}
