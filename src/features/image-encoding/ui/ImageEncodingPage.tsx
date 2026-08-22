import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { useSearch } from "@tanstack/react-router";
import {
  deriveImageEncodingModel,
  calculateImageEncoding,
  compareImageEncodingSummaries,
  inspectPixel,
  rgbToHex,
  summarizeImageEncodingModel,
  type RGB,
  type RasterImage,
  type SamplingGeometry,
  MAX_BIT_DEPTH,
  MAX_PHASE,
  MAX_SAMPLING_PERCENT,
  MIN_BIT_DEPTH,
  MIN_PHASE,
  MIN_SAMPLING_PERCENT,
  RGB24_BIT_DEPTH,
  type ImageColorMode,
  type QuantizedPixel,
} from "../domain/model";
import { parseImageEncodingScenario } from "../lesson/scenario";
import {
  createImageLessonState,
  isSamplingEvidenceComplete,
  transitionImageLesson,
  type ImageLessonAction,
  type ImageView,
  type ImageBudgetChallenge,
  type ImageEncodingModel,
  type SamplingEvidence,
  type SamplingObservationSpot,
  type SamplingSnapshot,
} from "../lesson/state";
import { LabShell } from "../../../shared/lab/LabShell";
import "./image-encoding.css";

type CanvasViewProps = {
  label: string;
  raster: RasterImage;
  errorMap?: readonly { magnitude: number }[];
  selectedCoordinate: { x: number; y: number };
  onPick: (coordinate: { x: number; y: number }) => void;
  interactive: boolean;
  canvasRef?: RefObject<HTMLCanvasElement | null>;
};

const VIEW_LABELS: Record<ImageView, string> = {
  compare: "对比：原图 / 重建图",
  sampling: "采样重建",
  quantization: "量化重建",
  representation: "编码表示",
  error: "颜色差异图",
};

type SourceIdentity = {
  kindLabel: string;
  label: string;
  detail: string;
};

function getSourceIdentity(source: RasterImage): SourceIdentity {
  const kindLabel =
    source.sourceKind === "upload" ? "已上传图像" : source.id === "photo" ? "固定样例" : "兼容样例";
  const detail = source.sourceDimensions
    ? `原始 ${source.sourceDimensions.width} × ${source.sourceDimensions.height}；工作栅格 ${source.width} × ${source.height} 像素`
    : `当前图片 ${source.width} × ${source.height} 像素`;
  return { kindLabel, label: source.label, detail };
}

export function phaseControlDescription(geometry: SamplingGeometry): string {
  const xFullDensity = geometry.x.sampledSize >= geometry.x.sourceSize;
  const yFullDensity = geometry.y.sampledSize >= geometry.y.sourceSize;
  if (xFullDensity && yFullDensity) {
    return "两个方向都已达到原图采样密度，因此网格相位固定为 0。";
  }
  if (xFullDensity) {
    return `水平：完整密度（${geometry.x.sampledSize}/${geometry.x.sourceSize}）· 相位固定为 0。垂直：${geometry.y.sampledSize}/${geometry.y.sourceSize} 个采样 · 相位 ${geometry.y.effectivePhase.toFixed(2)}。`;
  }
  if (yFullDensity) {
    return `垂直：完整密度（${geometry.y.sampledSize}/${geometry.y.sourceSize}）· 相位固定为 0。水平：${geometry.x.sampledSize}/${geometry.x.sourceSize} 个采样 · 相位 ${geometry.x.effectivePhase.toFixed(2)}。`;
  }
  return "在一个采样格内移动两个方向的网格，观察对相位敏感的图案如何变化。";
}

function drawRaster(
  canvas: HTMLCanvasElement,
  raster: RasterImage,
  errorMap?: readonly { magnitude: number }[],
) {
  let context: CanvasRenderingContext2D | null;
  try {
    context = canvas.getContext("2d");
  } catch {
    return;
  }
  if (!context) return;
  canvas.width = raster.width;
  canvas.height = raster.height;
  const image = context.createImageData(raster.width, raster.height);
  for (let index = 0; index < raster.pixels.length; index += 1) {
    const pixel = raster.pixels[index] ?? { r: 0, g: 0, b: 0 };
    const error = errorMap?.[index]?.magnitude;
    const offset = index * 4;
    if (error !== undefined) {
      const intensity = Math.round(Math.max(0, Math.min(1, error)) * 255);
      image.data[offset] = intensity;
      image.data[offset + 1] = Math.round(intensity * 0.35);
      image.data[offset + 2] = 0;
    } else {
      image.data[offset] = pixel.r;
      image.data[offset + 1] = pixel.g;
      image.data[offset + 2] = pixel.b;
    }
    image.data[offset + 3] = 255;
  }
  context.putImageData(image, 0, 0);
}

function CanvasView({
  label,
  raster,
  errorMap,
  selectedCoordinate,
  onPick,
  interactive,
  canvasRef,
}: CanvasViewProps) {
  useEffect(() => {
    if (canvasRef?.current) drawRaster(canvasRef.current, raster, errorMap);
  }, [canvasRef, errorMap, raster]);

  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>) => {
    const deltas: Record<string, { x: number; y: number }> = {
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
    };
    const delta = deltas[event.key];
    if (!delta) return;
    event.preventDefault();
    onPick({ x: selectedCoordinate.x + delta.x, y: selectedCoordinate.y + delta.y });
  };

  return (
    <div className={`image-canvas-frame${interactive ? "" : " is-locked"}`}>
      <canvas
        aria-label={`${label}；可用方向键检查附近像素`}
        aria-disabled={!interactive}
        className={`image-canvas${interactive ? "" : " is-locked"}`}
        height={raster.height}
        onClick={interactive ? (event) => onPick(clickCoordinate(event, raster)) : undefined}
        onKeyDown={interactive ? handleKeyDown : undefined}
        ref={canvasRef}
        role="img"
        tabIndex={interactive ? 0 : -1}
        width={raster.width}
      />
      <span className="canvas-caption">
        {raster.width} × {raster.height} 个显示像素
      </span>
    </div>
  );
}

function colorStyle(color: RGB): { backgroundColor: string } {
  return { backgroundColor: rgbToHex(color) };
}

function clickCoordinate(event: MouseEvent<HTMLCanvasElement>, raster: RasterImage) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * raster.width;
  const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * raster.height;
  return { x: Math.floor(x), y: Math.floor(y) };
}

const DOM_GRID_LIMIT = 4096;

function drawRepresentation(
  canvas: HTMLCanvasElement,
  pixels: readonly QuantizedPixel[],
  width: number,
  height: number,
  view: ImageView,
) {
  const context = canvas.getContext("2d");
  if (!context) return;
  canvas.width = width;
  canvas.height = height;
  const image = context.createImageData(width, height);
  pixels.forEach((pixel, index) => {
    const color = view === "sampling" ? pixel.sourceColor : pixel.quantizedColor;
    const offset = index * 4;
    image.data[offset] = color.r;
    image.data[offset + 1] = color.g;
    image.data[offset + 2] = color.b;
    image.data[offset + 3] = 255;
  });
  context.putImageData(image, 0, 0);
}

function LargeRepresentationCanvas({
  pixels,
  width,
  height,
  view,
  interactive,
  onPick,
}: {
  pixels: readonly QuantizedPixel[];
  width: number;
  height: number;
  view: ImageView;
  interactive: boolean;
  onPick: (coordinate: { x: number; y: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (canvasRef.current) drawRepresentation(canvasRef.current, pixels, width, height, view);
  }, [height, pixels, view, width]);

  return (
    <div className={`representation-canvas-frame${interactive ? "" : " is-locked"}`}>
      <canvas
        aria-label={`${width} × ${height} 编码采样网格；点击检查采样格`}
        aria-disabled={!interactive}
        className={`representation-canvas${interactive ? "" : " is-locked"}`}
        height={height}
        onClick={(event) => {
          if (!interactive) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const sampleX = Math.min(
            width - 1,
            Math.max(0, Math.floor(((event.clientX - rect.left) / rect.width) * width)),
          );
          const sampleY = Math.min(
            height - 1,
            Math.max(0, Math.floor(((event.clientY - rect.top) / rect.height) * height)),
          );
          const pixel = pixels[sampleY * width + sampleX];
          if (pixel) onPick({ x: pixel.sourceX, y: pixel.sourceY });
        }}
        ref={canvasRef}
        role="img"
        tabIndex={interactive ? 0 : -1}
        width={width}
      />
      <span className="canvas-caption">
        {width} × {height} 个编码采样
      </span>
    </div>
  );
}

function RepresentationGrid({
  pixels,
  width,
  height,
  view,
  revealed,
  colorMode,
  interactive,
  onPick,
}: {
  pixels: readonly QuantizedPixel[];
  width: number;
  height: number;
  view: ImageView;
  revealed: boolean;
  colorMode: ImageColorMode;
  interactive: boolean;
  onPick: (coordinate: { x: number; y: number }) => void;
}) {
  if (pixels.length > DOM_GRID_LIMIT) {
    return (
      <LargeRepresentationCanvas
        height={height}
        onPick={onPick}
        pixels={pixels}
        view={view}
        interactive={interactive}
        width={width}
      />
    );
  }
  return (
    <div
      className={`representation-grid${interactive ? "" : " is-locked"}`}
      aria-disabled={!interactive}
      role="grid"
      aria-label={`${width} × ${height} 编码采样网格`}
      style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
    >
      {pixels.map((pixel) => (
        <div
          className="representation-cell"
          key={pixel.sampleIndex}
          role="gridcell"
          style={colorStyle(view === "sampling" ? pixel.sourceColor : pixel.quantizedColor)}
          aria-label={
            revealed
              ? `采样 ${pixel.sampleIndex + 1}；源色 ${rgbToHex(pixel.sourceColor)}；${
                  colorMode === "rgb24" ? "原色 RGB" : `调色板索引 ${pixel.paletteIndex}`
                }；编码值 ${pixel.encodedBits}`
              : `采样 ${pixel.sampleIndex + 1}；选择该格查看颜色`
          }
          onClick={interactive ? () => onPick({ x: pixel.sourceX, y: pixel.sourceY }) : undefined}
          title={revealed ? `${pixel.encodedBits} · ${pixel.quantizedHex}` : undefined}
        />
      ))}
    </div>
  );
}

function readUploadedImage(file: File): Promise<RasterImage> {
  return new Promise((resolve, reject) => {
    if (typeof Image === "undefined" || typeof URL.createObjectURL !== "function") {
      reject(new Error("当前浏览器无法解码本地上传的图像。"));
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      try {
        const originalWidth = Math.max(1, image.naturalWidth);
        const originalHeight = Math.max(1, image.naturalHeight);
        const maxDimension = 96;
        const scale = Math.min(1, maxDimension / Math.max(originalWidth, originalHeight));
        const width = Math.max(1, Math.round(originalWidth * scale));
        const height = Math.max(1, Math.round(originalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas 解码不可用。");
        context.drawImage(image, 0, 0, width, height);
        const data = context.getImageData(0, 0, width, height).data;
        const pixels = Array.from({ length: width * height }, (_, index) => ({
          r: data[index * 4] ?? 0,
          g: data[index * 4 + 1] ?? 0,
          b: data[index * 4 + 2] ?? 0,
        }));
        resolve({
          id: `upload:${file.name}`,
          label: file.name,
          sourceKind: "upload",
          width,
          height,
          pixels,
          sourceDimensions: { width: originalWidth, height: originalHeight },
        });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("所选图像无法解码。"));
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("所选图像无法解码。"));
    };
    image.src = objectUrl;
  });
}

function RangeField({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  displayValue,
  description,
  marks,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  displayValue?: ReactNode;
  description: string;
  marks?: readonly { value: number; label: string }[];
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className={`image-control${disabled ? " is-locked" : ""}`}>
      <div className="image-control-heading">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {displayValue ?? (
            <>
              {value}
              {unit}
            </>
          )}
        </output>
      </div>
      <input
        aria-describedby={`${id}-help`}
        disabled={disabled}
        id={id}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      {marks ? (
        <div className="range-marks" aria-hidden="true">
          {marks.map((mark) => (
            <span key={mark.value} style={{ left: `${((mark.value - min) / (max - min)) * 100}%` }}>
              {mark.label}
            </span>
          ))}
        </div>
      ) : null}
      <p id={`${id}-help`}>{description}</p>
    </div>
  );
}

function DeepDiveItem({
  children,
  number,
  title,
}: {
  children: ReactNode;
  number: string;
  title: string;
}) {
  return (
    <details>
      <summary>
        <span>{number}</span> {title}
      </summary>
      <p>{children}</p>
    </details>
  );
}

function DeepDivePanel({ colorMode }: { colorMode: ImageColorMode }) {
  return (
    <section className="image-card deep-dive-card" aria-labelledby="deep-dive-heading">
      <div className="image-card-heading">
        <div>
          <p className="eyebrow">原理</p>
          <h3 id="deep-dive-heading">图像怎样变成编码</h3>
        </div>
      </div>
      <div className="deep-dive-list">
        <DeepDiveItem number="01" title="采样后的尺寸和显示尺寸有什么关系？">
          编码时使用的采样单元变少；重建时将采样值扩展到原显示尺寸。
        </DeepDiveItem>
        <DeepDiveItem
          number="02"
          title={colorMode === "rgb24" ? "原色 RGB 怎样记录？" : "位深改变后，可用颜色数怎样变化？"}
        >
          {colorMode === "rgb24" ? (
            "每个采样点直接记录三个 8 位颜色通道。"
          ) : (
            <>
              当每个采样像素使用 b 位索引时，最多有 2<sup>b</sup> 个调色板状态。位深减半，不等于 RGB
              三个通道各自减半。
            </>
          )}
        </DeepDiveItem>
        <DeepDiveItem number="03" title="一个像素怎样变成数字？">
          从显示位置找到采样格，再看它对应的
          {colorMode === "rgb24" ? "RGB 颜色和二进制数字" : "颜色编号和二进制数字"}
          ；详情中的数字就是还原图像时使用的表示。
        </DeepDiveItem>
        <DeepDiveItem number="04" title="公式算出的原始数据量代表什么？">
          {colorMode === "rgb24"
            ? "采样像素数 × 每像素位数；不包含文件头、元数据和压缩编码。"
            : "采样像素数 × 每像素位数；不包含文件头、颜色表、元数据和压缩编码。"}
        </DeepDiveItem>
      </div>
    </section>
  );
}

const OBSERVATION_SPOT_LABELS: Record<SamplingObservationSpot, string> = {
  "text-edge": "文字边缘",
  "object-outline": "物体轮廓",
  "color-boundary": "色块边界",
  other: "其他位置",
};

function observationSpotLabel(spot: SamplingObservationSpot | ""): string {
  return spot ? OBSERVATION_SPOT_LABELS[spot] : "—";
}

function snapshotValue(snapshot: SamplingSnapshot | null, key: keyof SamplingSnapshot): string {
  if (!snapshot) return "—";
  const value = snapshot[key];
  if (key === "samplingPercent") return `${value}%`;
  if (key === "width" || key === "height") return `${value} px`;
  if (key === "observationSpot") return observationSpotLabel(value as SamplingObservationSpot | "");
  return String(value);
}

function SamplingEvidenceCard({
  dispatch,
  evidence,
}: {
  dispatch: (action: ImageLessonAction) => void;
  evidence: SamplingEvidence;
}) {
  const complete = isSamplingEvidenceComplete(evidence);
  const status = !evidence.baseline
    ? "尚未记录基准。"
    : !evidence.changed
      ? "已记录基准。改变采样比例后，再记录一次。"
      : evidence.baseline.samplingPercent === evidence.changed.samplingPercent
        ? "两次采样比例相同。"
        : !evidence.observationSpot
          ? "已记录两次结果。观察位置尚未选择。"
          : !evidence.observation.trim()
            ? "已选观察位置。还没有记录你的观察。"
            : "已记录两组结果和你的观察。";

  return (
    <section
      className="image-card sampling-evidence-card"
      aria-labelledby="sampling-evidence-heading"
      data-evidence-state={complete ? "complete" : "incomplete"}
    >
      <div className="image-card-heading">
        <div>
          <p className="eyebrow">第一步 · 空间采样证据</p>
          <h3 id="sampling-evidence-heading">采样侦探卡</h3>
          <p className="image-card-description">
            记录基准和改变后的尺寸，选择同一观察位置，写下你的观察。
          </p>
        </div>
        <span className={`evidence-badge${complete ? " is-complete" : ""}`}>
          {complete ? "已记录两组结果" : "尚未完成记录"}
        </span>
      </div>
      <div className="sampling-evidence-controls">
        <button
          className="button button-secondary"
          onClick={() => dispatch({ type: "record-sampling-baseline" })}
          type="button"
        >
          记录基准
        </button>
        <button
          className="button button-secondary"
          onClick={() => dispatch({ type: "record-sampling-changed" })}
          type="button"
        >
          记录改变后的结果
        </button>
        <label>
          同一观察位置
          <select
            onChange={(event) =>
              dispatch({
                type: "set-observation-spot",
                spot: event.target.value as SamplingObservationSpot | "",
              })
            }
            value={evidence.observationSpot}
          >
            <option value="">选择观察位置</option>
            {Object.entries(OBSERVATION_SPOT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="sampling-observation-field">
          你的观察（一句话即可）
          <input
            onChange={(event) =>
              dispatch({ type: "set-observation", observation: event.target.value })
            }
            placeholder="例如：边缘变粗，细节减少"
            type="text"
            value={evidence.observation}
          />
        </label>
      </div>
      <p className={`evidence-status${complete ? " is-complete" : ""}`} role="status">
        {status}
      </p>
      <div className="sampling-snapshot-grid" aria-label="采样证据快照">
        <span className="snapshot-heading">记录项</span>
        <span className="snapshot-heading">基准</span>
        <span className="snapshot-heading">改变后</span>
        <span>采样比例</span>
        <span>{snapshotValue(evidence.baseline, "samplingPercent")}</span>
        <span>{snapshotValue(evidence.changed, "samplingPercent")}</span>
        <span>宽</span>
        <span>{snapshotValue(evidence.baseline, "width")}</span>
        <span>{snapshotValue(evidence.changed, "width")}</span>
        <span>高</span>
        <span>{snapshotValue(evidence.baseline, "height")}</span>
        <span>{snapshotValue(evidence.changed, "height")}</span>
        <span>像素数</span>
        <span>{snapshotValue(evidence.baseline, "pixelCount")}</span>
        <span>{snapshotValue(evidence.changed, "pixelCount")}</span>
        <span>同一观察位置</span>
        <span>{snapshotValue(evidence.baseline, "observationSpot")}</span>
        <span>{snapshotValue(evidence.changed, "observationSpot")}</span>
        <span>你的观察</span>
        <span>{snapshotValue(evidence.baseline, "observation")}</span>
        <span>{snapshotValue(evidence.changed, "observation")}</span>
      </div>
    </section>
  );
}

function BudgetChallengeCard({
  budgetBits,
  budgetBytes,
  challenge,
  challengeModel,
  dispatch,
  onPick,
  selectedCoordinate,
  spot,
}: {
  budgetBits: number;
  budgetBytes: number;
  challenge: ImageBudgetChallenge;
  challengeModel: ImageEncodingModel;
  dispatch: (action: ImageLessonAction) => void;
  onPick: (coordinate: { x: number; y: number }) => void;
  selectedCoordinate: { x: number; y: number };
  spot: SamplingObservationSpot | "";
}) {
  const rawBytes = challengeModel.rawPayload.bytes;
  const rawBits = challengeModel.rawPayload.bits;
  const withinBudget = rawBits <= budgetBits;
  const hasTradeoff = challenge.tradeoff.trim().length > 0;
  const status = !withinBudget
    ? "超过预算。"
    : !spot
      ? "尚未选择观察位置。"
      : !challenge.readability
        ? "在预算内。尚未判断目标细节是否还能辨认。"
        : challenge.readability === "no"
          ? "在预算内，但目标细节还不能辨认。"
          : !hasTradeoff
            ? "在预算内，目标细节还能辨认。取舍说明尚未填写。"
            : !challenge.acknowledged
              ? "在预算内，目标细节还能辨认。rawBytes 的含义尚未确认。"
              : "在预算内，目标细节还能辨认。";

  return (
    <section className="image-card budget-challenge-card" aria-labelledby="challenge-heading">
      <div className="image-card-heading">
        <div>
          <p className="eyebrow">扩展练习</p>
          <h3 id="challenge-heading">编码预算挑战：在有限数据量内保留目标细节</h3>
          <p className="image-card-description">
            用同一张图和同一观察位置，在基准理论数据量的四分之一内保留目标细节。
          </p>
        </div>
      </div>
      <div className="challenge-layout">
        <div className="challenge-controls">
          <div className="challenge-budget-note">
            理论预算：基准 rawBits 的 25% = <strong>{budgetBits.toLocaleString()} bits</strong>（约{" "}
            {budgetBytes.toLocaleString()} bytes）
          </div>
          <RangeField
            description="挑战方案的采样比例；宽、高由当前图像和比例共同决定。"
            id="challenge-sampling-percent"
            label="挑战采样比例"
            max={MAX_SAMPLING_PERCENT}
            min={MIN_SAMPLING_PERCENT}
            onChange={(value) =>
              dispatch({ type: "set-challenge-sampling", samplingPercent: value })
            }
            step={1}
            unit="%"
            value={challenge.samplingPercent}
          />
          <div className="challenge-mode-control" role="group" aria-label="挑战颜色表示">
            <span>颜色表示</span>
            <div className="image-color-mode-options">
              <button
                aria-label="预算挑战颜色 RGB24"
                aria-pressed={challenge.colorMode === "rgb24"}
                className="button button-secondary"
                onClick={() => dispatch({ type: "set-challenge-color-mode", colorMode: "rgb24" })}
                type="button"
              >
                RGB24
              </button>
              <button
                aria-label="预算挑战颜色方案"
                aria-pressed={challenge.colorMode === "palette"}
                className="button button-secondary"
                onClick={() => dispatch({ type: "set-challenge-color-mode", colorMode: "palette" })}
                type="button"
              >
                调色板
              </button>
            </div>
          </div>
          <RangeField
            description={
              challenge.colorMode === "rgb24"
                ? "RGB24：每个像素使用 24 位。"
                : `调色板：每个像素使用 ${challenge.bitDepth} 位颜色编号，最多 ${2 ** challenge.bitDepth} 种颜色。`
            }
            disabled={challenge.colorMode === "rgb24"}
            displayValue={challenge.colorMode === "rgb24" ? "24 位" : undefined}
            id="challenge-bit-depth"
            label="挑战调色板位深 b"
            max={MAX_BIT_DEPTH}
            min={MIN_BIT_DEPTH}
            onChange={(value) => dispatch({ type: "set-challenge-bit-depth", bitDepth: value })}
            step={1}
            unit=" 位"
            value={challenge.bitDepth}
            marks={[1, 2, 4, 8].map((value) => ({ value, label: `${value} 位` }))}
          />
          <p className="challenge-same-spot">
            同一观察位置：<strong>{observationSpotLabel(spot)}</strong>
          </p>
          <label className="challenge-field">
            观察区域是否仍可辨认
            <select
              onChange={(event) =>
                dispatch({
                  type: "set-challenge-readability",
                  readability: event.target.value as "yes" | "no" | "",
                })
              }
              value={challenge.readability}
            >
              <option value="">选择是否还能辨认</option>
              <option value="yes">仍可辨认</option>
              <option value="no">还不能辨认</option>
            </select>
          </label>
          <label className="challenge-field">
            我的取舍说明
            <textarea
              onChange={(event) =>
                dispatch({ type: "set-challenge-tradeoff", tradeoff: event.target.value })
              }
              placeholder="例如：降低采样比例，保留调色板 4 bit，因为要保留轮廓。"
              value={challenge.tradeoff}
            />
          </label>
          <label className="challenge-acknowledgement">
            <input
              checked={challenge.acknowledged}
              onChange={(event) =>
                dispatch({
                  type: "set-challenge-acknowledged",
                  acknowledged: event.target.checked,
                })
              }
              type="checkbox"
            />
            rawBytes 是理论原始像素数据量，不等于实际 PNG、JPEG 或 WebP 文件大小。
          </label>
          <p
            className={`challenge-status${withinBudget && challenge.readability === "yes" ? " is-positive" : ""}`}
            role="status"
          >
            {status}
          </p>
        </div>
        <div className="challenge-preview">
          <h4>挑战重建图像（同一张源图）</h4>
          <CanvasView
            label="预算挑战预览"
            onPick={onPick}
            raster={challengeModel.reconstructed}
            selectedCoordinate={selectedCoordinate}
            interactive
          />
        </div>
      </div>
      <dl className="challenge-metrics">
        <div>
          <dt>当前宽 × 高</dt>
          <dd>
            {challengeModel.sampled.width} × {challengeModel.sampled.height}
          </dd>
        </div>
        <div>
          <dt>当前像素数</dt>
          <dd>{(challengeModel.sampled.width * challengeModel.sampled.height).toLocaleString()}</dd>
        </div>
        <div>
          <dt>bitsPerPixel</dt>
          <dd>{challengeModel.rawPayload.bitDepth} bit</dd>
        </div>
        <div>
          <dt>rawBits / rawBytes</dt>
          <dd>
            {rawBits.toLocaleString()} / {rawBytes.toLocaleString()}
          </dd>
        </div>
      </dl>
      <p className={`challenge-budget-state${withinBudget ? " is-within" : ""}`}>
        预算：基准理论数据量的 25% · {withinBudget ? "当前在预算内" : "当前超出预算"}
      </p>
      <p className="payload-note">本题预算只按理论 rawBits/rawBytes 计算。</p>
    </section>
  );
}

function ImageEncodingContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseImageEncodingScenario(search), [search]);
  const [lesson, dispatch] = useReducer(transitionImageLesson, scenario, createImageLessonState);
  const [uploadMessage, setUploadMessage] = useState<string | undefined>();
  const [calculatorWidth, setCalculatorWidth] = useState("");
  const [calculatorHeight, setCalculatorHeight] = useState("");
  const [calculatorBitsPerPixel, setCalculatorBitsPerPixel] = useState("");
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const reconstructionCanvasRef = useRef<HTMLCanvasElement>(null);
  const errorCanvasRef = useRef<HTMLCanvasElement>(null);
  const model = useMemo(
    () =>
      deriveImageEncodingModel(lesson.source, {
        samplingPercent: lesson.samplingPercent,
        bitDepth: lesson.bitDepth,
        phase: lesson.phase,
        colorMode: lesson.colorMode,
      }),
    [lesson.bitDepth, lesson.colorMode, lesson.phase, lesson.samplingPercent, lesson.source],
  );
  const baselineModel = useMemo(
    () =>
      deriveImageEncodingModel(lesson.source, {
        samplingPercent: lesson.initialScenario.samplingPercent,
        bitDepth: lesson.initialScenario.bitDepth,
        phase: lesson.initialScenario.phase,
        colorMode: lesson.initialScenario.colorMode,
      }),
    [
      lesson.initialScenario.bitDepth,
      lesson.initialScenario.colorMode,
      lesson.initialScenario.phase,
      lesson.initialScenario.samplingPercent,
      lesson.source,
    ],
  );
  const currentSummary = useMemo(() => summarizeImageEncodingModel(model), [model]);
  const baselineSummary = useMemo(
    () => summarizeImageEncodingModel(baselineModel),
    [baselineModel],
  );
  const summaryDelta = useMemo(
    () => compareImageEncodingSummaries(currentSummary, baselineSummary),
    [baselineSummary, currentSummary],
  );
  const challengeModel = useMemo(
    () =>
      deriveImageEncodingModel(lesson.source, {
        samplingPercent: lesson.budgetChallenge.samplingPercent,
        bitDepth: lesson.budgetChallenge.bitDepth,
        phase: 0,
        colorMode: lesson.budgetChallenge.colorMode,
      }),
    [
      lesson.budgetChallenge.bitDepth,
      lesson.budgetChallenge.colorMode,
      lesson.budgetChallenge.samplingPercent,
      lesson.source,
    ],
  );
  const budgetBits = Math.floor(baselineSummary.rawBits * 0.25);
  const budgetBytes = Math.ceil(budgetBits / 8);
  const withinBudget = currentSummary.rawBits <= budgetBits;
  const sourceIdentity = getSourceIdentity(lesson.source);
  const inspection = useMemo(
    () => inspectPixel(model, lesson.selectedCoordinate.x, lesson.selectedCoordinate.y),
    [lesson.selectedCoordinate.x, lesson.selectedCoordinate.y, model],
  );
  const phaseGeometry = model.sampled.geometry;
  const phaseIsInert =
    phaseGeometry.x.sampledSize >= phaseGeometry.x.sourceSize &&
    phaseGeometry.y.sampledSize >= phaseGeometry.y.sourceSize;
  const calculator = useMemo(
    () =>
      calculateImageEncoding(
        Number(calculatorWidth),
        Number(calculatorHeight),
        Number(calculatorBitsPerPixel),
      ),
    [calculatorBitsPerPixel, calculatorHeight, calculatorWidth],
  );
  useEffect(() => {
    setCalculatorWidth(String(model.sampled.width));
    setCalculatorHeight(String(model.sampled.height));
    setCalculatorBitsPerPixel(String(model.quantized.bitDepth));
  }, [
    lesson.bitDepth,
    lesson.colorMode,
    lesson.initialScenario,
    lesson.samplingPercent,
    lesson.source,
    model,
  ]);

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [
    scenario.bitDepth,
    scenario.colorMode,
    scenario.fixture,
    scenario.phase,
    scenario.samplingPercent,
    scenario.view,
  ]);

  const chooseCanvasPixel = (coordinate: { x: number; y: number }) => {
    dispatch({ type: "select-pixel", ...coordinate });
  };

  const changeSampling = (samplingPercent: number) => {
    dispatch({ type: "set-sampling", samplingPercent });
  };

  const changeBitDepth = (bitDepth: number) => {
    if (lesson.colorMode !== "palette") return;
    dispatch({ type: "set-bit-depth", bitDepth });
  };

  const changeColorMode = (colorMode: ImageColorMode) => {
    dispatch({ type: "set-color-mode", colorMode });
  };

  const changeView = (view: ImageView) => {
    dispatch({ type: "set-view", view });
  };

  const editCalculatorField = () => {
    dispatch({ type: "edit-calculator-field" });
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const source = await readUploadedImage(file);
      dispatch({ type: "load-source", source });
      const original = source.sourceDimensions ?? { width: source.width, height: source.height };
      setUploadMessage(
        `已载入 ${source.label}（原图 ${original.width} × ${original.height}；工作栅格 ${source.width} × ${source.height}）`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "所选图像无法解码。";
      dispatch({ type: "decode-error", message });
      setUploadMessage(undefined);
    }
    event.target.value = "";
  };

  const reset = () => {
    dispatch({ type: "reset" });
    setUploadMessage(undefined);
  };

  const observationPrompt = "先比较原图和还原图，再看数据量和颜色变化。";
  const judgment = withinBudget
    ? summaryDelta.averageError > 0
      ? "当前数据量在上限内，但颜色变化更多了。"
      : "当前数据量在上限内，颜色变化没有增加。"
    : summaryDelta.rawBits < 0
      ? "当前数据量仍超过上限，但比开始少了。"
      : "当前数据量超过上限；减少采样像素或颜色数量后，数据量会下降。";

  return (
    <LabShell eyebrow="图像 / 01" title="图像编码" subtitle="采样、颜色数量和图像还原">
      <div className="image-course">
        <header className="image-course-intro">
          <div>
            <p className="eyebrow">图像编码</p>
            <h2>从图像到有限的像素编码</h2>
            <p>调整采样和颜色数量，查看图像还原、颜色数量和数据量。</p>
          </div>
          <div className="source-meta" aria-label="当前图像来源">
            <span>{sourceIdentity.kindLabel}</span>
            <strong>{sourceIdentity.label}</strong>
            <small>{sourceIdentity.detail}</small>
          </div>
        </header>

        <div className="image-course-grid">
          <div className="image-main-column">
            <section
              className="image-card image-mission-card"
              aria-labelledby="mission-heading"
              data-budget="baseline-25-percent"
              data-budget-state={withinBudget ? "within" : "over"}
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">目标</p>
                  <h3 id="mission-heading">
                    把图片占用的空间控制在原来的四分之一以内，同时尽量保持清楚
                  </h3>
                  <p className="image-card-description">
                    先调整图片保留的像素数量，看看细节和占用空间怎么变。一次只改一个设置，再比较画面和数字。
                  </p>
                </div>
                <span className={`mission-budget-badge${withinBudget ? " is-within" : ""}`}>
                  {withinBudget ? "空间够用" : "空间不够"}
                </span>
              </div>
              <div className="mission-feedback-grid" aria-label="当前实验反馈">
                <div className="mission-feedback-item">
                  <span>最多能用的空间</span>
                  <strong data-metric="budget-raw-bits">{budgetBits.toLocaleString()} 位</strong>
                  <small data-metric="budget-raw-bytes">
                    约 {budgetBytes.toLocaleString()} 字节
                  </small>
                </div>
                <div className="mission-feedback-item">
                  <span>现在 / 一开始占用的空间</span>
                  <strong data-metric="current-raw-bits">
                    {currentSummary.rawBits.toLocaleString()} /{" "}
                    {baselineSummary.rawBits.toLocaleString()} 位
                  </strong>
                  <small data-metric="raw-bits-delta">
                    {summaryDelta.rawBits >= 0 ? "+" : ""}
                    {summaryDelta.rawBits.toLocaleString()} 位
                  </small>
                </div>
                <div className="mission-feedback-item">
                  <span>保留下来的像素</span>
                  <strong data-metric="current-sampled-pixels">
                    {currentSummary.sampledWidth} × {currentSummary.sampledHeight} ={" "}
                    {currentSummary.sampledPixelCount.toLocaleString()} /{" "}
                    {baselineSummary.sampledWidth} × {baselineSummary.sampledHeight} ={" "}
                    {baselineSummary.sampledPixelCount.toLocaleString()} 个
                  </strong>
                  <small data-metric="sampled-pixels-delta">
                    {summaryDelta.sampledPixelCount >= 0 ? "+" : ""}
                    {summaryDelta.sampledPixelCount.toLocaleString()} 个
                  </small>
                </div>
                <div className="mission-feedback-item">
                  <span>平均颜色变化（不是清晰度评分）</span>
                  <strong data-metric="average-error">
                    {(currentSummary.averageError * 100).toFixed(1)}%
                  </strong>
                  <small data-metric="average-error-delta">
                    {summaryDelta.averageError >= 0 ? "+" : ""}
                    {(summaryDelta.averageError * 100).toFixed(1)} 个百分点
                  </small>
                </div>
                <div className="mission-feedback-item">
                  <span>颜色变了的像素</span>
                  <strong data-metric="changed-pixels">
                    {currentSummary.changedPixelCount.toLocaleString()} 个
                  </strong>
                  <small data-metric="changed-pixels-delta">
                    相对初始 {summaryDelta.changedPixelCount >= 0 ? "+" : ""}
                    {summaryDelta.changedPixelCount.toLocaleString()} 个
                  </small>
                </div>
                <div className="mission-feedback-item">
                  <span>按像素算的空间</span>
                  <strong data-metric="current-raw-bytes">
                    约 {currentSummary.rawBytes.toLocaleString()} /{" "}
                    {baselineSummary.rawBytes.toLocaleString()} 字节
                  </strong>
                  <small data-metric="raw-bytes-delta">
                    {summaryDelta.rawBytes >= 0 ? "+" : ""}
                    {summaryDelta.rawBytes.toLocaleString()} 字节
                  </small>
                </div>
              </div>
              <p className="mission-judgment" data-feedback="judgment">
                {judgment}
              </p>
              <p className="mission-observation" data-feedback="observation">
                {observationPrompt}
              </p>
              <p className="payload-note">
                这里显示的是图片像素本身大约要占多少空间。字节数按整字节显示，上限判断按像素数据的精确数值进行。这不是保存成
                PNG、JPEG 或 WebP 后文件的实际大小。
              </p>
            </section>
            <section className="image-card image-controls-card" aria-labelledby="source-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">源图像</p>
                  <h3 id="source-heading">本节使用的图像</h3>
                </div>
                <button className="button button-secondary" onClick={reset} type="button">
                  恢复初始情境
                </button>
              </div>
              <div className="source-controls">
                <div className="fixed-source">
                  <span>{sourceIdentity.kindLabel}</span>
                  <strong>{sourceIdentity.label}</strong>
                  <small>{sourceIdentity.detail}</small>
                </div>
                <label className="upload-field">
                  <span>上传图片（可选）</span>
                  <input
                    accept="image/*"
                    aria-describedby="upload-help"
                    onChange={handleUpload}
                    type="file"
                  />
                  <small id="upload-help">可载入自己的图片；成功后会重新开始本节操作。</small>
                </label>
              </div>
              {uploadMessage ? (
                <p className="image-neutral-notice" role="status">
                  {uploadMessage}
                </p>
              ) : null}
              {lesson.decodeError ? (
                <p className="image-error-notice" role="alert">
                  {lesson.decodeError}
                </p>
              ) : null}
            </section>

            <SamplingEvidenceCard dispatch={dispatch} evidence={lesson.samplingEvidence} />

            <section className="image-card image-compare-card" aria-labelledby="compare-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">实时重建</p>
                  <h3 id="compare-heading">原图 → 采样值 → 量化重建</h3>
                  <p className="image-card-description">点击任一图像，检查同一个物理显示坐标。</p>
                </div>
              </div>
              <div className="canvas-compare-grid">
                <div>
                  <h4>原图</h4>
                  <CanvasView
                    canvasRef={sourceCanvasRef}
                    label="原始源图像"
                    onPick={chooseCanvasPixel}
                    raster={model.source}
                    selectedCoordinate={lesson.selectedCoordinate}
                    interactive
                  />
                </div>
                <div>
                  <h4>重建图像</h4>
                  <CanvasView
                    canvasRef={reconstructionCanvasRef}
                    label="重建图像"
                    onPick={chooseCanvasPixel}
                    raster={model.reconstructed}
                    selectedCoordinate={lesson.selectedCoordinate}
                    interactive
                  />
                </div>
              </div>
              <div className="loss-strip">
                <span>
                  <b>采样数量</b> {model.sampled.width} × {model.sampled.height} 个编码采样
                </span>
                <span>
                  <b>颜色表示</b>{" "}
                  {model.quantized.colorMode === "rgb24"
                    ? `原色 RGB ${RGB24_BIT_DEPTH} 位`
                    : `${model.quantized.palette.length} 个调色板颜色 · 采样 RGB 颜色差异`}{" "}
                  {(model.averageQuantizationError * 100).toFixed(1)}%
                </span>
                <span>
                  <b>变化像素</b> {model.changedPixelCount.toLocaleString()}
                </span>
              </div>
            </section>

            <section className="image-card image-view-card" aria-labelledby="view-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">查看变化</p>
                  <h3 id="view-heading">编码表示</h3>
                </div>
              </div>
              <div className="view-tabs" role="tablist" aria-label="图像编码视图">
                {(Object.keys(VIEW_LABELS) as ImageView[]).map((view) => (
                  <button
                    aria-selected={lesson.view === view}
                    className={`view-tab${lesson.view === view ? " is-active" : ""}`}
                    key={view}
                    onClick={() => changeView(view)}
                    role="tab"
                    type="button"
                  >
                    {VIEW_LABELS[view]}
                  </button>
                ))}
              </div>
              {lesson.view === "error" ? (
                <div className="error-view-stage">
                  <CanvasView
                    canvasRef={errorCanvasRef}
                    errorMap={model.errorMap}
                    label="像素颜色差异图"
                    onPick={chooseCanvasPixel}
                    raster={model.source}
                    selectedCoordinate={lesson.selectedCoordinate}
                    interactive
                  />
                  <p>比较每个位置的颜色差异。</p>
                </div>
              ) : (
                <div className="representation-stage">
                  <RepresentationGrid
                    colorMode={model.quantized.colorMode}
                    height={model.quantized.height}
                    onPick={chooseCanvasPixel}
                    pixels={model.quantized.pixels}
                    revealed
                    interactive
                    view={lesson.view}
                    width={model.quantized.width}
                  />
                  <div className="representation-copy">
                    <strong>{VIEW_LABELS[lesson.view]}</strong>
                    <p>
                      {lesson.view === "sampling"
                        ? "比较网格大小与图像变化。"
                        : lesson.view === "quantization"
                          ? "比较可用颜色数与渐变区域变化。"
                          : lesson.view === "representation"
                            ? `点击像素，查看位置、${
                                model.quantized.colorMode === "rgb24" ? "RGB 颜色" : "颜色编号"
                              }和二进制编码。`
                            : "比较采样值、颜色编号和还原颜色。"}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="image-side-column" aria-label="图像编码控制与像素详情">
            <DeepDivePanel colorMode={model.quantized.colorMode} />
            <section
              className="image-card image-parameter-card"
              aria-labelledby="parameter-heading"
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">编码参数</p>
                  <h3 id="parameter-heading">编码参数</h3>
                </div>
              </div>
              <RangeField
                description={`${model.sampled.width} × ${model.sampled.height} 个采样`}
                id="sampling-percent"
                label="空间采样"
                max={MAX_SAMPLING_PERCENT}
                min={MIN_SAMPLING_PERCENT}
                onChange={changeSampling}
                step={5}
                unit="%"
                value={lesson.samplingPercent}
                marks={[
                  { value: 10, label: "10%" },
                  { value: 25, label: "25%" },
                  { value: 50, label: "50%" },
                  { value: 75, label: "75%" },
                  { value: 100, label: "100%" },
                ]}
              />
              <RangeField
                description={phaseControlDescription(phaseGeometry)}
                disabled={phaseIsInert}
                id="sampling-phase"
                label="采样网格相位"
                max={MAX_PHASE}
                min={MIN_PHASE}
                onChange={(value) => {
                  dispatch({ type: "set-phase", phase: value });
                }}
                step={0.01}
                unit=""
                value={phaseIsInert ? 0 : lesson.phase}
              />
              <RangeField
                description={
                  lesson.colorMode === "rgb24"
                    ? "每个通道保留 8 位"
                    : `最多 ${2 ** lesson.bitDepth} 种调色板颜色`
                }
                disabled={lesson.colorMode === "rgb24"}
                displayValue={lesson.colorMode === "rgb24" ? "24 位" : undefined}
                id="bit-depth"
                label="颜色位深"
                max={MAX_BIT_DEPTH}
                min={MIN_BIT_DEPTH}
                onChange={changeBitDepth}
                step={1}
                unit=" 位"
                value={lesson.bitDepth}
                marks={[1, 2, 4, 8].map((value) => ({ value, label: `${value} 位` }))}
              />
              <div className="image-color-mode" role="group" aria-label="颜色表示">
                <span>颜色表示</span>
                <div className="image-color-mode-options">
                  <button
                    aria-pressed={lesson.colorMode !== "rgb24"}
                    className="button button-secondary"
                    onClick={() => changeColorMode("palette")}
                    type="button"
                  >
                    调色板
                  </button>
                  <button
                    aria-pressed={lesson.colorMode === "rgb24"}
                    className="button button-secondary"
                    onClick={() => changeColorMode("rgb24")}
                    type="button"
                  >
                    原色（RGB 24 位）
                  </button>
                </div>
                <p className="image-control-guide">
                  {lesson.colorMode === "rgb24"
                    ? "切换到调色板后可调整位深，观察颜色层次怎么变化。"
                    : lesson.bitDepth === MIN_BIT_DEPTH
                      ? "当前已经是最低的 1 位；观察它如何保留更少的颜色。"
                      : "调低颜色位深，观察颜色层次怎么变化。"}
                </p>
                <p className="palette-model-note">
                  调色板 b 表示每个像素的颜色编号位数，不是每个通道 b 位，也不是 JPEG
                  参数；当前画面实际使用颜色数不超过 2<sup>b</sup>。
                </p>
              </div>
            </section>

            <section className="image-card image-payload-card" aria-labelledby="payload-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">编码表示</p>
                  <h3 id="payload-heading">原始数据量</h3>
                </div>
              </div>
              <dl className="payload-list">
                <div>
                  <dt>采样尺寸</dt>
                  <dd>
                    {model.sampled.width} × {model.sampled.height}
                  </dd>
                </div>
                <div>
                  <dt>采样像素总数</dt>
                  <dd>{model.sampled.width * model.sampled.height} px</dd>
                </div>
                <div>
                  <dt>可用颜色数</dt>
                  <dd>
                    {model.quantized.colorMode === "rgb24"
                      ? "16,777,216 种 RGB 颜色"
                      : `${model.quantized.palette.length} 个可用颜色编号`}
                  </dd>
                </div>
                <div>
                  <dt>原始数据量</dt>
                  <dd>
                    {model.rawPayload.width} × {model.rawPayload.height} ×{" "}
                    {model.rawPayload.bitDepth} = {model.rawPayload.bits} 位
                  </dd>
                </div>
              </dl>
              <p className="payload-note">
                这里显示的是理论像素数据原始位数。PNG、JPG / JPEG 和 WebP
                的实际文件大小取决于图像内容、编码器设置、文件头、
                {model.quantized.colorMode === "palette" ? "颜色表、" : ""}元数据和具体实现。
              </p>
            </section>

            <section className="image-card calculator-card" aria-labelledby="calculator-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">数据量计算</p>
                  <h3 id="calculator-heading">数据量计算</h3>
                </div>
                <span className="image-card-heading-note">原始像素数据</span>
              </div>
              <div className="calculator-fields">
                <label>
                  宽度（像素）
                  <input
                    aria-describedby="calculator-help"
                    inputMode="numeric"
                    min="1"
                    onChange={(event) => {
                      setCalculatorWidth(event.target.value);
                      editCalculatorField();
                    }}
                    type="number"
                    value={calculatorWidth}
                  />
                </label>
                <label>
                  高度（像素）
                  <input
                    aria-describedby="calculator-help"
                    inputMode="numeric"
                    min="1"
                    onChange={(event) => {
                      setCalculatorHeight(event.target.value);
                      editCalculatorField();
                    }}
                    type="number"
                    value={calculatorHeight}
                  />
                </label>
                <label>
                  每像素位数
                  <input
                    aria-describedby="calculator-help"
                    inputMode="numeric"
                    min="1"
                    max="32"
                    onChange={(event) => {
                      setCalculatorBitsPerPixel(event.target.value);
                      editCalculatorField();
                    }}
                    type="number"
                    value={calculatorBitsPerPixel}
                  />
                </label>
              </div>
              <p className="calculator-formula" id="calculator-help">
                原始位数 = 宽度 × 高度 × 每像素位数；原始字节 = 原始位数 ÷ 8 后向上取整。
              </p>
              <dl className="payload-list calculator-results">
                <div>
                  <dt>原始位数</dt>
                  <dd>
                    {calculator.width} × {calculator.height} × {calculator.bitsPerPixel} ={" "}
                    {calculator.rawBits} 位
                  </dd>
                </div>
                <div>
                  <dt>原始字节</dt>
                  <dd>
                    {calculator.rawBits} ÷ 8 后向上取整 = {calculator.rawBytes} 字节
                  </dd>
                </div>
              </dl>
              <p className="payload-note">
                计算结果只包含原始像素数据，不包含格式文件头、元数据或压缩结果。压缩格式的实际大小取决于图像内容和编码器设置。
              </p>
            </section>

            <section className="image-card image-format-card" aria-labelledby="format-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">边界讨论</p>
                  <h3 id="format-heading">联系实际文件格式</h3>
                </div>
                <span className="image-card-heading-note">格式边界</span>
              </div>
              <div className="format-boundary-copy">
                <p>原始像素数据量可以由宽 × 高 × 每像素位数准确计算。</p>
                <p>
                  <strong>思考：</strong>
                  为什么这个结果不能直接当作 PNG、JPEG 或 WebP 的文件大小？
                </p>
                <p>实际文件大小还受图像内容、编码方式、编码器设置、文件头和元数据影响。</p>
              </div>
            </section>
            <BudgetChallengeCard
              budgetBits={budgetBits}
              budgetBytes={budgetBytes}
              challenge={lesson.budgetChallenge}
              challengeModel={challengeModel}
              dispatch={dispatch}
              onPick={chooseCanvasPixel}
              selectedCoordinate={lesson.selectedCoordinate}
              spot={lesson.samplingEvidence.observationSpot}
            />

            <section
              className="image-card image-inspector-card"
              aria-labelledby="inspector-heading"
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">像素详情</p>
                  <h3 id="inspector-heading">把一个像素拆成数字</h3>
                </div>
              </div>
              <div className="inspector-selected-pixel">
                <span className="inspector-swatch" style={colorStyle(inspection.quantizedColor)} />
                <div>
                  <strong>
                    显示坐标（{inspection.sourceX}, {inspection.sourceY}）
                  </strong>
                  <small>点击原图或重建图像可切换位置。</small>
                </div>
              </div>
              <dl className="pixel-inspection-list">
                <div>
                  <dt>原始源色</dt>
                  <dd>{rgbToHex(inspection.originalColor)}</dd>
                </div>
                <div>
                  <dt>采样格</dt>
                  <dd>
                    ({inspection.sampleX}, {inspection.sampleY}) · #{inspection.sampleIndex + 1}
                  </dd>
                </div>
                <div>
                  <dt>采样值</dt>
                  <dd>{rgbToHex(inspection.sampledColor)}</dd>
                </div>
                <div>
                  <dt>{model.quantized.colorMode === "rgb24" ? "RGB 颜色" : "量化调色板颜色"}</dt>
                  <dd>
                    {rgbToHex(inspection.quantizedColor)}
                    {model.quantized.colorMode === "rgb24"
                      ? " · 原色 RGB"
                      : ` · 索引 ${inspection.paletteIndex}`}
                  </dd>
                </div>
                <div>
                  <dt>编码值</dt>
                  <dd>
                    <code>{inspection.encodedBits}</code> ({model.quantized.bitDepth} bits)
                  </dd>
                </div>
                <div>
                  <dt>RGB 颜色差异</dt>
                  <dd>{(inspection.errorMagnitude * 100).toFixed(1)}%</dd>
                </div>
              </dl>
            </section>

            <section className="image-card palette-card" aria-labelledby="palette-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">
                    {model.quantized.colorMode === "rgb24" ? "原色 RGB" : "颜色表 / 编号"}
                  </p>
                  <h3 id="palette-heading">
                    {model.quantized.colorMode === "rgb24" ? "RGB 颜色" : "颜色编号"}
                  </h3>
                </div>
                <span>
                  {model.quantized.colorMode === "rgb24"
                    ? "原色 RGB 24 位"
                    : `${model.quantized.palette.length} 个可用颜色`}
                </span>
              </div>
              {model.quantized.colorMode === "rgb24" ? (
                <p className="image-neutral-notice">原色 RGB 直接保留每个通道的 8 位值。</p>
              ) : (
                <div className="palette-list">
                  {model.quantized.palette.map((entry) => (
                    <div className="palette-entry" key={entry.index}>
                      <span className="palette-swatch" style={colorStyle(entry.color)} />
                      <code>{entry.index.toString(2).padStart(model.quantized.bitDepth, "0")}</code>
                      <span>{entry.hex}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </LabShell>
  );
}

export function ImageEncodingPage() {
  const search = useSearch({ from: "/labs/image-encoding" });
  return <ImageEncodingContent search={search} />;
}
