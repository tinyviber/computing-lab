import { StageLink } from "../../../shared/lab/StageRail";
import { CPU_CORE_STAGES, CPU_STAGES, type CpuStageDef } from "../domain/stages.ts";

/**
 * The cpu lab rail: the five core stages in order, then the optional
 * challenges grouped under 选做挑战 (dashed, indented) once unlocked.
 */
export function CpuStageRail(props: {
  stageIndex: number;
  passedStages: readonly number[];
  unlocked: (stage: CpuStageDef) => boolean;
  onSelect: (index: number) => void;
}) {
  const { stageIndex, passedStages, unlocked, onSelect } = props;
  const challenges = CPU_STAGES.filter((s) => s.track === "challenge");
  const corePassed = CPU_CORE_STAGES.filter((s) => passedStages.includes(s.index)).length;

  const renderStage = (stage: CpuStageDef, optional = false) => (
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

  return (
    <aside aria-label="关卡进度" className="lab-rail">
      <p className="eyebrow">
        冯诺依曼数据通路 <span className="cpu-rail-count">{corePassed} / 5 主线</span>
      </p>
      <ol>{CPU_CORE_STAGES.map((stage) => renderStage(stage))}</ol>
      <div className="cpu-rail-challenges">
        <p className="cpu-rail-group">选做挑战</p>
        <ol>{challenges.map((stage) => renderStage(stage, true))}</ol>
      </div>
    </aside>
  );
}
