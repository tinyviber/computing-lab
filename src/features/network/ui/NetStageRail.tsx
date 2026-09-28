import { StageLink } from "../../../shared/lab/StageRail";
import { NET_CORE_STAGES, NET_STAGES, type NetStageDef } from "../domain/stages.ts";

/** Rail: four core stages, X1 anchored as an optional 支线 after stage 4. */
export function NetStageRail(props: {
  stageIndex: number;
  passedStages: readonly number[];
  unlocked: (index: number) => boolean;
  onSelect: (index: number) => void;
}) {
  const { stageIndex, passedStages, unlocked, onSelect } = props;
  const challenges = NET_STAGES.filter((s) => s.track === "challenge");
  const corePassed = NET_CORE_STAGES.filter((s) => passedStages.includes(s.index)).length;

  const renderStage = (stage: NetStageDef, optional = false) => (
    <li key={stage.id}>
      <StageLink
        active={stage.index === stageIndex}
        onSelect={() => onSelect(stage.index)}
        optional={optional}
        passed={passedStages.includes(stage.index)}
        subtitle={stage.englishTitle}
        title={stage.title}
        unlocked={unlocked(stage.index)}
      />
    </li>
  );

  return (
    <aside aria-label="关卡进度" className="lab-rail">
      <p className="eyebrow">
        网络模拟器{" "}
        <span className="is-rail-count">
          {corePassed} / {NET_CORE_STAGES.length} 主线
        </span>
      </p>
      <ol className="stage-list">{NET_CORE_STAGES.map((stage) => renderStage(stage))}</ol>
      {challenges.length > 0 ? (
        <div className="is-rail-challenges">
          <p className="is-rail-group">选做挑战</p>
          <ol className="stage-list">{challenges.map((s) => renderStage(s, true))}</ol>
        </div>
      ) : null}
    </aside>
  );
}
