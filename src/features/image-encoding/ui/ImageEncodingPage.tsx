import { useEffect, useMemo, useReducer, useState } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { api, describeApiError } from "../../../shared/api/client";
import { LabShell } from "../../../shared/lab/LabShell";
import { encodeRow, BIT_CANVAS_CELLS, BIT_CANVAS_EDIT_ROW } from "../domain/bit-canvas";
import { checkCore1, checkCore2, checkCore3, CORE2_REGION_ERROR_MAX } from "../domain/checks";
import { FIXTURE_TARGET_REGIONS } from "../domain/fixture";
import {
  countPixelDiffs,
  deriveImageEncodingModel,
  encodingSignature,
  regionError,
} from "../domain/model";
import { getRestorationAsset, HALLUCINATION_CASES } from "../domain/restoration";
import { artifactOptions, budgetBits } from "../domain/stops";
import { parseImageEncodingScenario, serializeImageEncodingScenario } from "../lesson/scenario";
import {
  createImageLessonState,
  imageDraft,
  transitionImageLesson,
  type ImageDraft,
} from "../lesson/state";
import { BudgetStage } from "./BudgetStage";
import { CollisionStage } from "./CollisionStage";
import { ConventionStage } from "./ConventionStage";
import { HallucinationStage } from "./HallucinationStage";
import { ImageStageRail } from "./ImageStageRail";
import { RestoreStage } from "./RestoreStage";
import { StageFeedback } from "./StageFeedback";
import "./image-encoding.css";

type ProjectPayload = {
  currentStage: number;
  passedStages: number[];
  artifact: ReturnType<typeof parseImageEncodingScenario>["artifact"];
  draft: Partial<ImageDraft>;
};

type JudgePayload = {
  passed: boolean;
  detail: string;
  currentStage: number;
  passedStages: number[];
};

function ImageEncodingContent({
  search,
  classId,
}: {
  search: Record<string, unknown>;
  classId?: string;
}) {
  const scenario = useMemo(() => parseImageEncodingScenario(search), [search]);
  const scenarioControlsArtifact = [
    "image",
    "fixture",
    "res",
    "sample",
    "sampling",
    "colors",
    "color",
    "bits",
    "bitDepth",
    "scenario",
  ].some((key) => search[key] !== undefined);
  const [lesson, dispatch] = useReducer(transitionImageLesson, scenario, createImageLessonState);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [scenario]);

  useEffect(() => {
    if (!classId) return undefined;
    let active = true;
    void api
      .get<ProjectPayload>(`/api/classes/${classId}/labs/image-encoding/project`)
      .then((project) => {
        if (!active) return;
        dispatch({
          type: "load-project",
          passedStages: project.passedStages,
          artifact: scenarioControlsArtifact ? scenario.artifact : project.artifact,
          passedArtifact: project.artifact,
          draft: project.draft,
        });
      })
      .catch((error) => {
        if (active) dispatch({ type: "set-message", message: describeApiError(error) });
      });
    return () => {
      active = false;
    };
  }, [classId, scenario, scenarioControlsArtifact]);

  useEffect(() => {
    if (!classId || lesson.saveStatus !== "dirty") return undefined;
    const artifact = lesson.artifact;
    const draft = imageDraft(lesson);
    const timer = window.setTimeout(() => {
      dispatch({ type: "mark-saving" });
      void api
        .put(`/api/classes/${classId}/labs/image-encoding/draft`, { artifact, draft })
        .then(() => dispatch({ type: "mark-saved" }))
        .catch(() => dispatch({ type: "mark-save-error" }));
    }, 800);
    return () => window.clearTimeout(timer);
  }, [
    classId,
    lesson.artifact,
    lesson.conventionRevealed,
    lesson.core1Bits,
    lesson.core3Edited,
    lesson.hallucinationCaseId,
    lesson.hallucinationClicks,
    lesson.restoreObservation,
    lesson.saveStatus,
  ]);

  const options = artifactOptions(lesson.artifact);
  const model = useMemo(
    () => deriveImageEncodingModel(lesson.source, options),
    [lesson.source, options.bitDepth, options.colorMode, options.samplingPercent],
  );
  const core2Error = regionError(model, FIXTURE_TARGET_REGIONS[lesson.artifact.image]);
  const core2Budget = budgetBits(lesson.source);
  const core3OriginalModel = useMemo(
    () => deriveImageEncodingModel(lesson.core3Original, options),
    [lesson.core3Original, options.bitDepth, options.colorMode, options.samplingPercent],
  );
  const core3EditedModel = useMemo(
    () => deriveImageEncodingModel(lesson.core3Edited, options),
    [lesson.core3Edited, options.bitDepth, options.colorMode, options.samplingPercent],
  );
  const originalSignature = encodingSignature(core3OriginalModel.quantized);
  const editedSignature = encodingSignature(core3EditedModel.quantized);
  const changedPixels = countPixelDiffs(lesson.core3Original, lesson.core3Edited);
  const expectedCore1Bits = encodeRow(BIT_CANVAS_CELLS, BIT_CANVAS_EDIT_ROW);
  const shareSearch = serializeImageEncodingScenario({
    stageIndex: lesson.stageIndex,
    artifact: lesson.artifact,
    caseId: lesson.hallucinationCaseId,
  });
  const configuredBase =
    import.meta.env.BASE_URL === "/" ? "" : import.meta.env.BASE_URL.replace(/\/$/, "");
  const showExperimental =
    search.showExperimentalLabs === "1" ||
    search.showExperimentalLabs === 1 ||
    search.showExperimentalLabs === true;
  const shareHref = `${configuredBase}/labs/image-encoding?${shareSearch}${showExperimental ? "&showExperimentalLabs=1" : ""}`;
  const restorationAsset = getRestorationAsset(
    lesson.artifact.image,
    lesson.artifact.resStop,
    lesson.artifact.colorStop,
  );

  const recordResult = async (
    stageIndex: number,
    result: { passed: boolean; detail: string },
    evidence: unknown,
  ) => {
    if (!result.passed) {
      dispatch({ type: "set-stage-outcome", outcome: { stageIndex, ...result } });
      return;
    }
    if (!classId) {
      dispatch({ type: "mark-stage-passed", stageIndex, detail: result.detail });
      return;
    }
    setSubmitting(true);
    try {
      const judged = await api.post<JudgePayload>(
        `/api/classes/${classId}/labs/image-encoding/judge`,
        { stageIndex, artifact: lesson.artifact, evidence },
      );
      if (judged.passed) {
        dispatch({ type: "mark-stage-passed", stageIndex, detail: judged.detail });
      } else {
        dispatch({
          type: "set-stage-outcome",
          outcome: { stageIndex, passed: false, detail: judged.detail },
        });
      }
    } catch (error) {
      dispatch({ type: "mark-stage-passed", stageIndex, detail: result.detail });
      dispatch({ type: "mark-save-error" });
      dispatch({
        type: "set-message",
        message: `${describeApiError(error)} 已保留本地通过结果，联网后请重新提交。`,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const stageContent = (() => {
    switch (lesson.stageIndex) {
      case 1:
        return (
          <ConventionStage
            bits={lesson.core1Bits}
            onBits={(bits) => dispatch({ type: "set-core1-bits", bits })}
            onCheck={() =>
              void recordResult(
                1,
                checkCore1({ studentBits: lesson.core1Bits, expectedBits: expectedCore1Bits }),
                { studentBits: lesson.core1Bits },
              )
            }
            onReveal={() =>
              dispatch({ type: "reveal-convention", revealed: !lesson.conventionRevealed })
            }
            passed={lesson.passedStages.includes(1)}
            revealed={lesson.conventionRevealed}
          />
        );
      case 2:
        return (
          <BudgetStage
            artifact={lesson.artifact}
            budget={core2Budget}
            model={model}
            onCheck={() =>
              void recordResult(
                2,
                checkCore2({ source: lesson.source, artifact: lesson.artifact }),
                {},
              )
            }
            onColor={(colorStop) => dispatch({ type: "set-color-stop", colorStop })}
            onResolution={(resStop) => dispatch({ type: "set-resolution-stop", resStop })}
            source={lesson.source}
            targetError={core2Error}
          />
        );
      case 3:
        return (
          <CollisionStage
            artifact={lesson.artifact}
            changedPixels={changedPixels}
            edited={lesson.core3Edited}
            onCheck={() =>
              void recordResult(
                3,
                checkCore3({
                  artifact: lesson.artifact,
                  original: lesson.core3Original,
                  edited: lesson.core3Edited,
                }),
                { edited: lesson.core3Edited },
              )
            }
            onPixel={(x, y) => {
              const color = lesson.core3Edited.pixels[y * lesson.core3Edited.width + x];
              if (!color) return;
              dispatch({
                type: "edit-core3-pixel",
                x,
                y,
                color: { r: 255 - color.r, g: 255 - color.g, b: 255 - color.b },
              });
            }}
            onReset={() => dispatch({ type: "reset-core3" })}
            original={lesson.core3Original}
            sameEncoding={originalSignature === editedSignature}
            signaturePreview={`${editedSignature.slice(0, 108)}${editedSignature.length > 108 ? "…" : ""}`}
          />
        );
      case 4:
        return (
          <RestoreStage
            artifact={lesson.artifact}
            asset={restorationAsset}
            assetBase={configuredBase}
            model={model}
            observation={lesson.restoreObservation}
            onObservation={(observation) =>
              dispatch({ type: "set-restore-observation", observation })
            }
            source={lesson.source}
          />
        );
      case 5:
        return <HallucinationStage caseCount={HALLUCINATION_CASES.length} />;
    }
  })();

  return (
    <LabShell eyebrow="图像编码" subtitle="编码 / 信息损失 / 生成式先验" title="AI 修复老照片">
      <div className="image-lab">
        <header className="image-lab-intro">
          <div>
            <p className="eyebrow">DRIVING QUESTION</p>
            <h2>AI 是找回了丢失的像素，还是生成了一个看起来合理的版本？</h2>
            <p>
              先亲手编码，再制造一份无法唯一还原的信息损失。普通解码器只能照约定读取 bit；AI
              还会带入训练数据里的先验。
            </p>
          </div>
          <a className="share-scenario" href={shareHref}>
            当前情境链接
          </a>
        </header>

        <div className="image-lab-layout">
          <ImageStageRail
            onSelect={(stageIndex) => dispatch({ type: "select-stage", stageIndex })}
            passedStages={lesson.passedStages}
            stageIndex={lesson.stageIndex}
          />
          <div aria-busy={submitting} className="image-stage-workspace">
            {lesson.message ? (
              <button
                className="image-message"
                onClick={() => dispatch({ type: "dismiss-message" })}
                type="button"
              >
                {lesson.message}
              </button>
            ) : null}
            {stageContent}
            <StageFeedback outcome={lesson.stageOutcome} stageIndex={lesson.stageIndex} />
            {lesson.stageIndex === 2 ? (
              <p className="metric-boundary">
                这里比较的是理论原始像素数据量，不是 PNG、JPEG 或 WebP
                的实际文件大小。通过条件：数据量不超过预算，且目标区域平均误差不超过
                {(CORE2_REGION_ERROR_MAX * 100).toFixed(0)}%。
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </LabShell>
  );
}

export function ImageEncodingPage() {
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const { classId } = useParams({ strict: false }) as { classId?: string };
  return <ImageEncodingContent classId={classId} search={search} />;
}
