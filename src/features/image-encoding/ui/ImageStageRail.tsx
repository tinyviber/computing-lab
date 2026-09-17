import { HALLUCINATION_CASES } from "../domain/restoration";
import { challengeStages, coreStages, IMAGE_STAGES, isStageUnlocked } from "../domain/stages";

type ImageStageRailProps = {
  stageIndex: number;
  passedStages: readonly number[];
  onSelect: (stageIndex: number) => void;
};

export function ImageStageRail({ stageIndex, passedStages, onSelect }: ImageStageRailProps) {
  const renderStage = (stage: (typeof IMAGE_STAGES)[number]) => {
    const pendingReview = stage.index === 5 && HALLUCINATION_CASES.length === 0;
    const unlocked = isStageUnlocked(passedStages, stage.index) && !pendingReview;
    const active = stage.index === stageIndex;
    const passed = passedStages.includes(stage.index);
    return (
      <li key={stage.id}>
        <button
          aria-current={active ? "step" : undefined}
          className={`image-stage-link${active ? " is-active" : ""}${passed ? " is-passed" : ""}`}
          disabled={!unlocked}
          onClick={() => onSelect(stage.index)}
          type="button"
        >
          <span>{String(stage.index).padStart(2, "0")}</span>
          <span>
            <strong>{stage.title}</strong>
            <small>{pendingReview ? "待开放 · 案例复核中" : stage.englishTitle}</small>
          </span>
          <span aria-hidden="true">{passed ? "✓" : unlocked ? "○" : "—"}</span>
        </button>
      </li>
    );
  };

  return (
    <aside aria-label="图像编码关卡" className="image-stage-rail">
      <div className="image-stage-heading">
        <span>课堂主线</span>
        <strong>{passedStages.filter((stage) => stage <= 3).length} / 3</strong>
      </div>
      <ol>{coreStages().map(renderStage)}</ol>
      <div className="image-stage-heading image-challenge-heading">
        <span>选做挑战</span>
      </div>
      <ol>{challengeStages().map(renderStage)}</ol>
    </aside>
  );
}
