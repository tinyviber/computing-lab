import { CALCULATOR_STAGES, challengeStages, coreStages } from "../domain/stages";
import type { ComponentDef } from "../domain/graph";
import { AnnotatedText } from "./CalculatorTerms";

type StageRailProps = {
  stageIndex: number;
  passedStages: number[];
  unlockedSubmodules: ComponentDef[];
  onSelectStage: (stageIndex: number) => void;
  onPlaceComponent: (name: string) => void;
  onDeleteCustomComponent: (name: string) => void;
};

export function StageRail({
  stageIndex,
  passedStages,
  unlockedSubmodules,
  onSelectStage,
  onPlaceComponent,
  onDeleteCustomComponent,
}: StageRailProps) {
  const challengeUnlocked = coreStages().every((s) => passedStages.includes(s.index));

  const renderStage = (stage: (typeof CALCULATOR_STAGES)[number]) => {
    const unlocked = stage.track === "core" || challengeUnlocked;
    const passed = passedStages.includes(stage.index);
    const active = stage.index === stageIndex;
    return (
      <li key={stage.id}>
        <button
          aria-current={active ? "step" : undefined}
          className={`stage-link${active ? " is-active" : ""}${passed ? " is-passed" : ""}`}
          disabled={!unlocked}
          onClick={() => onSelectStage(stage.index)}
          type="button"
        >
          <span className="stage-index">{String(stage.index).padStart(2, "0")}</span>
          <span className="stage-titles">
            <strong>{stage.title}</strong>
            <span>
              <AnnotatedText text={stage.englishTitle} />
            </span>
          </span>
          <span aria-hidden="true" className="stage-mark">
            {passed ? "✓" : unlocked ? "○" : "🔒"}
          </span>
        </button>
      </li>
    );
  };

  return (
    <aside className="stage-rail" aria-label="关卡进度">
      <div className="stage-rail-heading">
        <p className="eyebrow">关卡</p>
        <span className="stage-count">
          {passedStages.length} / {CALCULATOR_STAGES.length}
        </span>
      </div>

      <div className="stage-group">
        <p className="stage-group-title">课堂主线</p>
        <ol className="stage-list">{coreStages().map(renderStage)}</ol>
      </div>

      <div className="stage-group">
        <p className="stage-group-title">选做挑战</p>
        {challengeUnlocked ? null : (
          <p className="stage-group-note">通过全部主线关卡（1–5）后解锁。</p>
        )}
        <ol className="stage-list">{challengeStages().map(renderStage)}</ol>
      </div>

      <div className="my-components">
        <p className="eyebrow">
          我的组件 <span aria-hidden="true">/</span> MY COMPONENTS
        </p>
        {unlockedSubmodules.length === 0 ? (
          <p className="my-components-empty">
            通过关卡解锁，或在画布框选后封装，就能得到可复用组件。
          </p>
        ) : (
          <ul>
            {unlockedSubmodules.map((component) => (
              <li className="component-entry" key={component.name}>
                <button
                  className={`component-chip${component.custom ? " is-custom" : ""}`}
                  onClick={() => onPlaceComponent(component.name)}
                  type="button"
                >
                  <AnnotatedText text={component.name} />
                  {component.custom ? <small>自定义</small> : null}
                </button>
                {component.custom ? (
                  <button
                    aria-label={`删除自定义组件 ${component.name}`}
                    className="component-delete"
                    onClick={() => {
                      if (window.confirm(`确定删除自定义组件“${component.name}”吗？`)) {
                        onDeleteCustomComponent(component.name);
                      }
                    }}
                    title="删除自定义组件"
                    type="button"
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
