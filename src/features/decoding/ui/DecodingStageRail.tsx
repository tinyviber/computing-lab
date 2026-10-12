import { StageLink } from "../../../shared/lab/StageRail";
import { labMetadata } from "../../../shared/lab/labMetadata";
import type { DecodingLabViewModel, DecodingStageItem } from "../controller/viewModel.ts";

/**
 * The decoding rail: core stages in order, with each `railAfter` challenge
 * anchored in a collapsible 支线练习 group right behind its core stage —
 * the same pattern as the cpu rail.
 */
export function DecodingStageRail({
  model,
  onSelect,
}: {
  model: DecodingLabViewModel["rail"];
  onSelect: (index: number) => void;
}) {
  const renderStage = (stage: DecodingStageItem, optional = false) => (
    <li key={stage.id}>
      <StageLink
        active={stage.active}
        onSelect={() => onSelect(stage.index)}
        optional={optional}
        passed={stage.passed}
        subtitle={stage.englishTitle}
        title={stage.title}
        unlocked={stage.unlocked}
      />
    </li>
  );

  const renderOptionalBranch = (anchor: number, stages: readonly DecodingStageItem[]) => {
    if (stages.length === 0) return null;
    const passed = stages.filter((s) => s.passed).length;
    const active = stages.some((s) => s.active);
    return (
      <li className="stage-branch-item" key={`branch-${anchor}`}>
        <details className="stage-branch" open={active}>
          <summary className="stage-branch-summary">
            <span>支线练习 · 第 {anchor} 关后</span>
            <span>
              {passed} / {stages.length}
            </span>
          </summary>
          <ol className="stage-list stage-branch-list">
            {stages.map((stage) => renderStage(stage, true))}
          </ol>
        </details>
      </li>
    );
  };

  return (
    <aside aria-label="关卡进度" className="lab-rail">
      <p className="eyebrow">
        {labMetadata.decoding.title}{" "}
        <span className="cpu-rail-count">
          {model.corePassed} / {model.coreTotal} 主线
        </span>
      </p>
      <ol className="stage-list">
        {model.core.flatMap(({ stage, challenges }) => [
          renderStage(stage),
          renderOptionalBranch(stage.index, challenges),
        ])}
      </ol>
      {model.challenges.length > 0 ? (
        <div className="cpu-rail-challenges">
          <p className="cpu-rail-group">选做挑战</p>
          <ol className="stage-list">{model.challenges.map((stage) => renderStage(stage))}</ol>
        </div>
      ) : null}
    </aside>
  );
}
