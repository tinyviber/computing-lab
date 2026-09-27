/**
 * Judge verdict display: accuracy vs requirement, cells vs budget, and the
 * counterexample triptych — original → your compressed grid → the member it
 * was confused with — plus the nearest-candidate ranking.
 */

import { Icon } from "../../../shared/ui/Icon";
import { imageFromBase64 } from "../domain/bitmap.ts";
import type { PackedImage, SamplingJudgeResult } from "../domain/protocol.ts";
import type { SamplingStageDef } from "../domain/stages.ts";
import { BitmapCanvas, type CellRect } from "./BitmapCanvas.tsx";

function PackedFigure({
  packed,
  caption,
  region,
}: {
  packed: PackedImage;
  caption: string;
  region?: CellRect | null;
}) {
  const image = imageFromBase64(packed.width, packed.height, packed.b64);
  return (
    <figure>
      <BitmapCanvas ariaLabel={caption} image={image} region={region} />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function RecognitionPanel({
  outcome,
  stage,
}: {
  outcome: SamplingJudgeResult;
  stage: SamplingStageDef;
}) {
  const required = Math.ceil(outcome.requiredAccuracy * outcome.total);
  return (
    <section
      aria-labelledby="judge-result-title"
      className={`recognition-panel${outcome.passed ? " is-passed" : " is-failed"}`}
    >
      <h3 id="judge-result-title">
        判定结果：
        {outcome.passed ? (
          <>
            通过 <Icon name="check" size={14} />
          </>
        ) : (
          "未通过"
        )}
      </h3>
      <dl className="verdict-stats">
        <div>
          <dt>接收端仍能认出</dt>
          <dd>
            {outcome.identified} / {outcome.total} 张
            <span className="verdict-sub">（要求 ≥ {required} 张）</span>
          </dd>
        </div>
        <div>
          <dt>占用了</dt>
          <dd className={outcome.withinBudget ? "" : "over-budget"}>
            {outcome.resolution.cells} 个格子
            <span className="verdict-sub">
              （预算 {outcome.cellBudget}
              {outcome.withinBudget ? "" : "，已超支"}）
            </span>
          </dd>
        </div>
        <div>
          <dt>分辨率</dt>
          <dd>
            {outcome.resolution.width}×{outcome.resolution.height}
          </dd>
        </div>
      </dl>

      {outcome.passed ? (
        <p className="stage-takeaway">
          这一关验证了：{stage.takeaway}
          {outcome.resolution.cells > Math.ceil(outcome.cellBudget * 0.6)
            ? " 还能再少用一些格子吗？"
            : ""}
        </p>
      ) : null}

      {!outcome.passed && outcome.counterexample ? (
        <div className="counterexample">
          <p className="counterexample-lede">
            例子：{outcome.counterexample.query.label} 以{outcome.resolution.width}×
            {outcome.resolution.height} 发出去之后，
            {outcome.counterexample.collidedWith.length > 0
              ? `接收端收到的格子图和 ${outcome.counterexample.collidedWith
                  .map((c) => c.label)
                  .join("、")} 一模一样`
              : `接收端最可能认成 ${outcome.counterexample.predicted?.label ?? "?"}`}
            。
            {outcome.counterexample.difference
              ? `丢掉的差别在原图 x∈[${outcome.counterexample.difference.x0}, ${outcome.counterexample.difference.x1})、y∈[${outcome.counterexample.difference.y0}, ${outcome.counterexample.difference.y1}) 的 ${outcome.counterexample.difference.pixels} 个像素里（原图已框出）——它们摊不满一个格子，就被抹平了。`
              : ""}
          </p>
          <div className="counterexample-triptych">
            <PackedFigure
              caption={`发送端原图 ${outcome.counterexample.query.label}`}
              packed={outcome.counterexample.query.full}
              region={outcome.counterexample.difference}
            />
            <span aria-hidden="true" className="preview-arrow">
              <Icon name="arrow-right" size={18} />
            </span>
            <PackedFigure
              caption={`接收端所见 ${outcome.resolution.width}×${outcome.resolution.height}`}
              packed={outcome.counterexample.query.small}
            />
            <span aria-hidden="true" className="preview-arrow">
              {outcome.counterexample.collidedWith.length > 0 ? "≡" : "≈"}
            </span>
            {outcome.counterexample.predicted ? (
              <PackedFigure
                caption={`最容易混淆：${outcome.counterexample.predicted.label}`}
                packed={outcome.counterexample.predicted.small}
              />
            ) : null}
          </div>
          <table className="ranking-table">
            <caption>
              最接近的候选（按轮廓距离排序）——这个排序只是帮你看谁最容易混淆，
              不参与判定：判定只看压缩后是否仍然唯一，不会去“猜”答案。
            </caption>
            <thead>
              <tr>
                <th>候选</th>
                <th>距离</th>
              </tr>
            </thead>
            <tbody>
              {outcome.counterexample.ranking.map((row) => (
                <tr key={row.id}>
                  <td>{row.label}</td>
                  <td>{row.distance === 0 ? "完全相同" : row.distance.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {outcome.confusionPairs.length > 0 ? (
        <p className="confusion-callout">
          该分辨率下还有 {outcome.confusionPairs.length} 对分不开：
          {outcome.confusionPairs
            .slice(0, 4)
            .map((p) => `${p.aLabel}≡${p.bLabel}`)
            .join("，")}
          {outcome.confusionPairs.length > 4 ? "…" : ""}
        </p>
      ) : null}
    </section>
  );
}
