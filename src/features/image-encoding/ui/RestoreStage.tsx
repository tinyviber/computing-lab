import type { ImageEncodingModel, RasterImage } from "../domain/model";
import type { RestorationAsset } from "../domain/restoration";
import type { Artifact } from "../domain/stops";
import { RasterCanvas } from "./RasterCanvas";

type RestoreStageProps = {
  source: RasterImage;
  model: ImageEncodingModel;
  artifact: Artifact;
  observation: string;
  asset?: RestorationAsset;
  assetBase: string;
  onObservation: (value: string) => void;
};

export function RestoreStage({
  source,
  model,
  artifact,
  observation,
  asset,
  assetBase,
  onObservation,
}: RestoreStageProps) {
  return (
    <section aria-labelledby="image-stage-title" className="image-stage-card">
      <div className="stage-copy">
        <p className="eyebrow">CHALLENGE 1 · 选做</p>
        <h2 id="image-stage-title">普通放大忠实，AI 修复会猜</h2>
        <p>普通解码器只能重复已有像素；AI 会用训练数据里的先验补出输入中不存在的细节。</p>
      </div>

      <div className="image-comparison image-comparison-three">
        <figure>
          <RasterCanvas label="Challenge 原图" raster={source} />
          <figcaption>Original</figcaption>
        </figure>
        <figure>
          <RasterCanvas label="学生保存的低信息图" raster={model.reconstructed} />
          <figcaption>
            你的编码 → 普通放大 · {artifact.resStop}% / {artifact.colorStop}
          </figcaption>
        </figure>
        <figure className={asset ? "" : "asset-pending"}>
          {asset ? (
            <img
              alt={`${artifact.image} 的 AI 修复结果`}
              className="image-raster"
              height={source.height}
              src={`${assetBase}/${asset.asset}`}
              width={source.width}
            />
          ) : (
            <strong>该档位的 AI 输出仍在离线生成与复核中</strong>
          )}
          <figcaption>{asset ? `AI restored · ${asset.model}` : "AI restored"}</figcaption>
        </figure>
      </div>

      <label className="observation-field">
        你认为 AI 输出中的细节来自哪里？
        <textarea
          onChange={(event) => onObservation(event.target.value)}
          placeholder="输入中能看见的是……模型补出来的是……"
          value={observation}
        />
      </label>
    </section>
  );
}
