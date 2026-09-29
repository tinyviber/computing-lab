import { StageLink } from "../../../shared/lab/StageRail";
import { DECODING_CORE_STAGES, DECODING_STAGES, type DecodingStageDef } from "../domain/stages.ts";

/**
 * The decoding rail: core stages in order, with each `railAfter` challenge
 * anchored in a collapsible 支线练习 group right behind its core stage —
 * the same pattern as the cpu rail.
 */
export function DecodingStageRail(props: {
  stageIndex: number;
  passedStages: readonly number[];
  unlocked: (stage: DecodingStageDef) => boolean;
  onSelect: (index: number) => void;
}) {
  const { stageIndex, passedStages, unlocked, onSelect } = props;
  const challenges = DECODING_STAGES.filter((s) => s.track === "challenge");
  const corePassed = DECODING_CORE_STAGES.filter((s) => passedStages.includes(s.index)).length;

  const optionalByAnchor = new Map<number, DecodingStageDef[]>();
  for (const challenge of challenges) {
    if (challenge.railAfter === undefined) continue;
    const stages = optionalByAnchor.get(challenge.railAfter) ?? [];
    stages.push(challenge);
    optionalByAnchor.set(challenge.railAfter, stages);
  }
  const lateChallenges = challenges.filter((s) => s.railAfter === undefined);

  const renderStage = (stage: DecodingStageDef, optional = false) => (
    <li key={stage.id}>
      <StageLink
        active={stage.index === stageIndex}
        onSelect={() => onSelect(stage.index)}
        optional={optional}
        passed={passedStages.includes(stage.index)}
        subtitle={stage.englishTitle}
        title={stage.title}
        unlocked={unlocked(stage)}
      />
    </li>
  );

  const renderOptionalBranch = (anchor: number) => {
    const stages = optionalByAnchor.get(anchor) ?? [];
    if (stages.length === 0) return null;
    const passed = stages.filter((s) => passedStages.includes(s.index)).length;
    const active = stages.some((s) => s.index === stageIndex);
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
        解码侦探{" "}
        <span className="cpu-rail-count">
          {corePassed} / {DECODING_CORE_STAGES.length} 主线
        </span>
      </p>
      <ol className="stage-list">
        {DECODING_CORE_STAGES.flatMap((stage) => [
          renderStage(stage),
          renderOptionalBranch(stage.index),
        ])}
      </ol>
      {lateChallenges.length > 0 ? (
        <div className="cpu-rail-challenges">
          <p className="cpu-rail-group">选做挑战</p>
          <ol className="stage-list">{lateChallenges.map((stage) => renderStage(stage))}</ol>
        </div>
      ) : null}
    </aside>
  );
}
