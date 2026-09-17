import { CORE2_REGION_ERROR_MAX } from "../domain/checks";
import type { ImageEncodingModel, RasterImage } from "../domain/model";
import {
  COLOR_STOPS,
  RESOLUTION_STOPS,
  type Artifact,
  type ColorStop,
  type ResolutionStop,
} from "../domain/stops";
import { RasterCanvas } from "./RasterCanvas";

const COLOR_STOP_LABELS: Record<ColorStop, string> = {
  rgb24: "RGB 24 位",
  gray8: "灰度 8 位",
  palette8: "256 色",
  palette4: "16 色",
  palette2: "4 色",
};

type BudgetStageProps = {
  source: RasterImage;
  artifact: Artifact;
  model: ImageEncodingModel;
  budget: number;
  targetError: number;
  onResolution: (stop: ResolutionStop) => void;
  onColor: (stop: ColorStop) => void;
  onCheck: () => void;
};

export function BudgetStage({
  source,
  artifact,
  model,
  budget,
  targetError,
  onResolution,
  onColor,
  onCheck,
}: BudgetStageProps) {
  const withinBudget = model.rawPayload.bits <= budget;
  return (
    <section aria-labelledby="image-stage-title" className="image-stage-card">
      <div className="stage-copy">
        <p className="eyebrow">CORE 2 · 12 分钟</p>
        <h2 id="image-stage-title">用八分之一的 bit 保存照片</h2>
        <p>选一档分辨率和颜色。既不能超过预算，目标区域的平均颜色误差也要控制在 12% 以内。</p>
      </div>

      <div className="budget-controls">
        <fieldset>
          <legend>分辨率档</legend>
          <div className="stop-buttons">
            {RESOLUTION_STOPS.map((stop) => (
              <button
                aria-pressed={artifact.resStop === stop}
                className="stop-button"
                key={stop}
                onClick={() => onResolution(stop)}
                type="button"
              >
                {stop}%
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>颜色档</legend>
          <div className="stop-buttons">
            {COLOR_STOPS.map((stop) => (
              <button
                aria-pressed={artifact.colorStop === stop}
                className="stop-button"
                key={stop}
                onClick={() => onColor(stop)}
                type="button"
              >
                {COLOR_STOP_LABELS[stop]}
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="image-comparison">
        <figure>
          <RasterCanvas label="原始照片" raster={source} />
          <figcaption>
            原图 · {source.width} × {source.height}
          </figcaption>
        </figure>
        <figure>
          <RasterCanvas label="预算内重建照片" raster={model.reconstructed} />
          <figcaption>
            重建 · 编码栅格 {model.quantized.width} × {model.quantized.height}
          </figcaption>
        </figure>
      </div>

      <dl className="budget-evidence">
        <div className={withinBudget ? "is-good" : "is-bad"}>
          <dt>编码数据量</dt>
          <dd>
            {model.rawPayload.bits.toLocaleString()} / {budget.toLocaleString()} bit
          </dd>
        </div>
        <div className={targetError <= CORE2_REGION_ERROR_MAX ? "is-good" : "is-bad"}>
          <dt>目标区域平均误差</dt>
          <dd>
            {(targetError * 100).toFixed(1)}% / 上限 {(CORE2_REGION_ERROR_MAX * 100).toFixed(0)}%
          </dd>
        </div>
        <div>
          <dt>普通解码器拥有的颜色</dt>
          <dd>{COLOR_STOP_LABELS[artifact.colorStop]}</dd>
        </div>
      </dl>

      <div className="stage-actions">
        <button className="button button-primary" onClick={onCheck} type="button">
          保存这张老照片
        </button>
      </div>
    </section>
  );
}
