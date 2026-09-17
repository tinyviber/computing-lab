import type { ImageStageOutcome } from "../lesson/state";

type StageFeedbackProps = {
  outcome: ImageStageOutcome;
  stageIndex: number;
};

export function StageFeedback({ outcome, stageIndex }: StageFeedbackProps) {
  if (!outcome || outcome.stageIndex !== stageIndex) return null;
  return (
    <div className={`stage-feedback ${outcome.passed ? "is-passed" : "is-failed"}`} role="status">
      <strong>{outcome.passed ? "通过" : "再试一次"}</strong>
      <span>{outcome.detail}</span>
    </div>
  );
}
