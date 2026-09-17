type HallucinationStageProps = {
  caseCount: number;
};

export function HallucinationStage({ caseCount }: HallucinationStageProps) {
  return (
    <section aria-labelledby="image-stage-title" className="image-stage-card">
      <div className="stage-copy">
        <p className="eyebrow">CHALLENGE 2 · 选做</p>
        <h2 id="image-stage-title">抓住 AI “修错”的细节</h2>
        <p>视觉质量更高，不代表对历史事实更忠实。点击输入中没有充分证据支持的细节。</p>
      </div>
      {caseCount === 0 ? (
        <div className="asset-pending challenge-pending" role="status">
          <strong>挑战案例尚未开放</strong>
          <p>只有真实 AI 输出完成双人热点标注后，案例才会在这里出现。</p>
        </div>
      ) : null}
    </section>
  );
}
