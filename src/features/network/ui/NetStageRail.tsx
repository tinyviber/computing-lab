import { StageLink } from "../../../shared/lab/StageRail";
import { NET_CORE_STAGES, NET_STAGES, type NetStageDef } from "../domain/stages.ts";

/**
 * The network rail: four core stages in order, with the TTL-loop
 * challenge anchored in a collapsible 支线练习 group behind stage 4.
 */
export function NetStageRail(props: {
  stageIndex: number;
  passedStages: readonly number[];
  unlocked: (stage: NetStageDef) => boolean;
  onSelect: (index: number) => void;
}) {
  const { stageIndex, passedStages, unlocked, onSelect } = props;
  const challenges = NET_STAGES.filter((s) => s.track === "challenge");
  const corePassed = NET_CORE_STAGES.filter((s) => passedStages.includes(s.index)).length;

  const optionalByAnchor = new Map<number, NetStageDef[]>();
  for (const challenge of challenges) {
    if (challenge.railAfter === undefined) continue;
    const stages = optionalByAnchor.get(challenge.railAfter) ?? [];
    stages.push(challenge);
    optionalByAnchor.set(challenge.railAfter, stages);
  }
  const lateChallenges = challenges.filter((s) => s.railAfter === undefined);

  const renderStage = (stage: NetStageDef, optional = false) => (
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
        网络寻径{" "}
        <span className="net-rail-count">
          {corePassed} / {NET_CORE_STAGES.length} 主线
        </span>
      </p>
      <ol className="stage-list">
        {NET_CORE_STAGES.flatMap((stage) => [
          renderStage(stage),
          renderOptionalBranch(stage.index),
        ])}
      </ol>
      {lateChallenges.length > 0 ? (
        <div className="net-rail-challenges">
          <p className="net-rail-group">选做挑战</p>
          <ol className="stage-list">{lateChallenges.map((stage) => renderStage(stage))}</ol>
        </div>
      ) : null}
    </aside>
  );
}
