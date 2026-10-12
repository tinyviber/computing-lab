import type { DecodingStageDef } from "../domain/stages.ts";

/** The stage's mission + task card — one line of story, then the contract. */
export function StageBrief({ stage, passed }: { stage: DecodingStageDef; passed: boolean }) {
  return (
    <section className="stage-brief">
      <p className="stage-mission">{stage.mission}</p>
      {stage.description ? <p>{stage.description}</p> : null}
      <p className="stage-task">{stage.task}</p>
      <p className="submit-note">{stage.judgeNote}</p>
      {passed ? <p className="stage-takeaway">本关收获：{stage.takeaway}</p> : null}
      {stage.hint ? (
        <details className="stage-details">
          <summary>提示</summary>
          <p>{stage.hint}</p>
        </details>
      ) : null}
    </section>
  );
}
