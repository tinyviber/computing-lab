import { rgbToHex, type RasterImage } from "../domain/model";
import type { Artifact } from "../domain/stops";

function PixelGrid({
  raster,
  editable,
  onPixel,
}: {
  raster: RasterImage;
  editable: boolean;
  onPixel?: (x: number, y: number) => void;
}) {
  return (
    <div
      aria-label={editable ? "可编辑原图窗口" : "原始局部窗口"}
      className="collision-grid"
      role="grid"
      style={{ gridTemplateColumns: `repeat(${raster.width}, 1fr)` }}
    >
      {raster.pixels.map((color, index) => {
        const x = index % raster.width;
        const y = Math.floor(index / raster.width);
        return editable ? (
          <button
            aria-label={`像素 ${x},${y}`}
            key={index}
            onClick={() => onPixel?.(x, y)}
            style={{ background: rgbToHex(color) }}
            type="button"
          />
        ) : (
          <span key={index} style={{ background: rgbToHex(color) }} />
        );
      })}
    </div>
  );
}

type CollisionStageProps = {
  artifact: Artifact;
  original: RasterImage;
  edited: RasterImage;
  changedPixels: number;
  sameEncoding: boolean;
  signaturePreview: string;
  onPixel: (x: number, y: number) => void;
  onReset: () => void;
  onCheck: () => void;
};

export function CollisionStage({
  artifact,
  original,
  edited,
  changedPixels,
  sameEncoding,
  signaturePreview,
  onPixel,
  onReset,
  onCheck,
}: CollisionStageProps) {
  return (
    <section aria-labelledby="image-stage-title" className="image-stage-card">
      <div className="stage-copy">
        <p className="eyebrow">CORE 3 · 12 分钟</p>
        <h2 id="image-stage-title">改原图，但让编码一个 bit 都不变</h2>
        <p>
          右侧是 Core 2 目标区域的 16×16 局部。点击像素把颜色反转；找出至少 8
          个编码器根本没保存的像素。
        </p>
      </div>

      <div className="collision-meta">
        <span>沿用你的方案：{artifact.resStop}% 分辨率</span>
        <span>{artifact.colorStop}</span>
      </div>

      <div className="collision-layout">
        <figure>
          <PixelGrid editable={false} raster={original} />
          <figcaption>原始局部</figcaption>
        </figure>
        <figure>
          <PixelGrid editable onPixel={onPixel} raster={edited} />
          <figcaption>你修改的原图</figcaption>
        </figure>
      </div>

      <dl className="collision-evidence">
        <div>
          <dt>已改像素</dt>
          <dd>{changedPixels} / 至少 8</dd>
        </div>
        <div className={sameEncoding ? "is-good" : "is-bad"}>
          <dt>编码签名</dt>
          <dd>{sameEncoding ? "完全相同" : "已经变化"}</dd>
        </div>
      </dl>

      <div className="signature-strip" aria-label="编码签名前缀">
        {signaturePreview}
      </div>

      <div className="stage-actions">
        <button className="button button-secondary" onClick={onReset} type="button">
          恢复原图
        </button>
        <button className="button button-primary" onClick={onCheck} type="button">
          检查是否 many-to-one
        </button>
      </div>
    </section>
  );
}
