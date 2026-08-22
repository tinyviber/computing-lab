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
  imageFormatLabel,
  IMAGE_FORMAT_PROFILES,
  inspectPixel,
  rgbToHex,
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
  type ImageEncodingFormat,
  type ImageColorMode,
  type QuantizedPixel,
} from "../domain/model";
import { parseImageEncodingScenario } from "../lesson/scenario";
import { createImageLessonState, transitionImageLesson, type ImageView } from "../lesson/state";
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

type LessonTask = {
  id: string;
  title: string;
  detail: string;
  available: boolean;
  complete: boolean;
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
        aria-label={`${label}；${
          interactive ? "可用方向键检查附近像素" : "完成第 1 步后可用方向键检查附近像素"
        }`}
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
        aria-label={`${width} × ${height} 编码采样网格；${
          interactive ? "点击检查采样格" : "完成第 1 步后可点击检查采样格"
        }`}
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

function LessonFlow({ tasks }: { tasks: readonly LessonTask[] }) {
  return (
    <details className="image-card lesson-flow-card">
      <summary className="lesson-flow-summary">
        <span className="lesson-flow-summary-label">四步操作</span>
      </summary>
      <ol className="lesson-flow-list">
        {tasks.map((task) => (
          <li
            className={`lesson-flow-item${task.available ? "" : " is-locked"}${
              task.complete ? " is-complete" : ""
            }`}
            key={task.id}
          >
            <div className="lesson-flow-item-heading">
              <strong className="lesson-task-title">{task.title}</strong>
              <span className="lesson-task-status">
                {task.complete ? "已完成" : task.available ? "进行中" : "待解锁"}
              </span>
            </div>
            <p>{task.available ? task.detail : "完成上一步后解锁。"}</p>
          </li>
        ))}
      </ol>
    </details>
  );
}

function DeepDiveItem({
  children,
  number,
  title,
  unlocked,
}: {
  children: ReactNode;
  number: string;
  title: string;
  unlocked: boolean;
}) {
  return (
    <details>
      <summary>
        <span>{number}</span> {title}
      </summary>
      {unlocked ? <p>{children}</p> : <p className="deep-dive-locked">完成前置操作后解锁。</p>}
    </details>
  );
}

function DeepDivePanel({
  colorMode,
  formulaUnlocked,
  colorUnlocked,
  samplingUnlocked,
  pixelUnlocked,
}: {
  colorMode: ImageColorMode;
  formulaUnlocked: boolean;
  colorUnlocked: boolean;
  samplingUnlocked: boolean;
  pixelUnlocked: boolean;
}) {
  return (
    <section className="image-card deep-dive-card" aria-labelledby="deep-dive-heading">
      <div className="image-card-heading">
        <div>
          <p className="eyebrow">原理</p>
          <h3 id="deep-dive-heading">图像怎样变成编码</h3>
        </div>
      </div>
      <div className="deep-dive-list">
        <DeepDiveItem
          number="01"
          title="采样后的尺寸和显示尺寸有什么关系？"
          unlocked={samplingUnlocked}
        >
          编码单元数量真的变少了；重建时再把有限的采样值铺回原显示尺寸。
        </DeepDiveItem>
        <DeepDiveItem
          number="02"
          title={colorMode === "rgb24" ? "原色 RGB 怎样记录？" : "位深改变后，可用颜色数怎样变化？"}
          unlocked={colorUnlocked}
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
        <DeepDiveItem number="03" title="一个像素怎样变成数字？" unlocked={pixelUnlocked}>
          从显示位置找到采样格，再看它对应的
          {colorMode === "rgb24" ? "RGB 颜色和二进制数字" : "颜色编号和二进制数字"}
          ；详情中的数字就是还原图像时使用的表示。
        </DeepDiveItem>
        <DeepDiveItem number="04" title="公式算出的原始数据量代表什么？" unlocked={formulaUnlocked}>
          {colorMode === "rgb24"
            ? "采样像素数 × 每像素位数；不包含文件头、元数据和压缩编码。"
            : "采样像素数 × 每像素位数；不包含文件头、颜色表、元数据和压缩编码。"}
        </DeepDiveItem>
      </div>
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
  const sourceIdentity = getSourceIdentity(lesson.source);
  const inspection = useMemo(
    () => inspectPixel(model, lesson.selectedCoordinate.x, lesson.selectedCoordinate.y),
    [lesson.selectedCoordinate.x, lesson.selectedCoordinate.y, model],
  );
  const phaseGeometry = model.sampled.geometry;
  const phaseIsInert =
    phaseGeometry.x.sampledSize >= phaseGeometry.x.sourceSize &&
    phaseGeometry.y.sampledSize >= phaseGeometry.y.sourceSize;
  const visualControlsUnlocked = lesson.samplingChanged;
  const colorControlsUnlocked = lesson.samplingChanged;
  const formatControlsUnlocked = lesson.calculatorEdited;
  const calculatorUnlocked = lesson.colorAdjusted;

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
    if (!visualControlsUnlocked) return;
    dispatch({ type: "select-pixel", ...coordinate });
  };

  const changeSampling = (samplingPercent: number) => {
    dispatch({ type: "set-sampling", samplingPercent });
  };

  const changeBitDepth = (bitDepth: number) => {
    if (!colorControlsUnlocked || lesson.colorMode !== "palette") return;
    dispatch({ type: "set-bit-depth", bitDepth });
  };

  const changeColorMode = (colorMode: ImageColorMode) => {
    if (!colorControlsUnlocked) return;
    dispatch({ type: "set-color-mode", colorMode });
  };

  const changeView = (view: ImageView) => {
    if (!visualControlsUnlocked) return;
    dispatch({ type: "set-view", view });
  };

  const changeFormat = (format: ImageEncodingFormat) => {
    if (!formatControlsUnlocked) return;
    dispatch({ type: "select-format", format });
  };

  const editCalculatorField = () => {
    if (!calculatorUnlocked) return;
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

  const lessonTasks: LessonTask[] = [
    {
      id: "sampling",
      title: "1. 改变空间采样百分比",
      detail: "拖动采样百分比，观察编码采样尺寸和重建图像。",
      available: true,
      complete: lesson.samplingChanged,
    },
    {
      id: "color",
      title: "2. 调整颜色表示",
      detail:
        lesson.initialScenario.bitDepth === MIN_BIT_DEPTH
          ? "切换到调色板，观察 1 位颜色表示怎样保留更少的颜色。"
          : "先切换到调色板，再调低颜色位深，观察颜色层次怎么变化。",
      available: lesson.samplingChanged,
      complete: lesson.colorAdjusted,
    },
    {
      id: "calculator",
      title: "3. 计算原始数据量",
      detail: "编辑宽度、高度或每像素位数，查看原始位数和原始字节。",
      available: lesson.colorAdjusted,
      complete: lesson.calculatorEdited,
    },
    {
      id: "format",
      title: "4. 了解文件格式边界",
      detail: "选择格式；实际文件大小取决于图像内容和编码器设置。",
      available: lesson.calculatorEdited,
      complete: lesson.formatSelected,
    },
  ];

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
            <LessonFlow tasks={lessonTasks} />
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

            <section className="image-card image-compare-card" aria-labelledby="compare-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">实时重建</p>
                  <h3 id="compare-heading">原图 → 采样值 → 量化重建</h3>
                  <p className="image-card-description">
                    {visualControlsUnlocked
                      ? "点击任一图像，检查同一个物理显示坐标。"
                      : "完成第 1 步后，可点击图像检查同一个物理显示坐标。"}
                  </p>
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
                    interactive={visualControlsUnlocked}
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
                    interactive={visualControlsUnlocked}
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
                    : `${model.quantized.palette.length} 个调色板颜色 · 采样 RGB 误差`}{" "}
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
                    aria-disabled={!visualControlsUnlocked}
                    className={`view-tab${lesson.view === view ? " is-active" : ""}`}
                    disabled={!visualControlsUnlocked}
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
                    label="像素误差图"
                    onPick={chooseCanvasPixel}
                    raster={model.source}
                    selectedCoordinate={lesson.selectedCoordinate}
                    interactive={visualControlsUnlocked}
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
                    revealed={visualControlsUnlocked}
                    interactive={visualControlsUnlocked}
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
            <DeepDivePanel
              colorMode={model.quantized.colorMode}
              formulaUnlocked={calculatorUnlocked}
              colorUnlocked={lesson.colorAdjusted}
              samplingUnlocked={lesson.samplingChanged}
              pixelUnlocked={visualControlsUnlocked}
            />
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
                disabled={!visualControlsUnlocked || phaseIsInert}
                id="sampling-phase"
                label="采样网格相位"
                max={MAX_PHASE}
                min={MIN_PHASE}
                onChange={(value) => {
                  if (visualControlsUnlocked) dispatch({ type: "set-phase", phase: value });
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
                disabled={!colorControlsUnlocked || lesson.colorMode === "rgb24"}
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
              <div
                className={`image-color-mode${colorControlsUnlocked ? "" : " is-locked"}`}
                role="group"
                aria-label="颜色表示"
              >
                <span>颜色表示</span>
                <div className="image-color-mode-options">
                  <button
                    aria-pressed={lesson.colorMode !== "rgb24"}
                    disabled={!colorControlsUnlocked}
                    className="button button-secondary"
                    onClick={() => changeColorMode("palette")}
                    type="button"
                  >
                    调色板
                  </button>
                  <button
                    aria-pressed={lesson.colorMode === "rgb24"}
                    disabled={!colorControlsUnlocked}
                    className="button button-secondary"
                    onClick={() => changeColorMode("rgb24")}
                    type="button"
                  >
                    原色（RGB 24 位）
                  </button>
                </div>
                <p className="image-control-guide">
                  {colorControlsUnlocked
                    ? lesson.bitDepth === MIN_BIT_DEPTH
                      ? "当前已经是最低的 1 位；切换到调色板即可完成这一步。"
                      : "先切换到调色板，再调低颜色位深，观察颜色层次怎么变化。"
                    : "完成第 1 步后解锁颜色表示。"}
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
              {calculatorUnlocked ? (
                <>
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
                    这里显示的是像素数据的原始位数。PNG、JPG / JPEG 和 WebP
                    的实际文件大小取决于图像内容、编码器设置、文件头、
                    {model.quantized.colorMode === "palette" ? "颜色表、" : ""}元数据和具体实现。
                  </p>
                </>
              ) : (
                <p className="image-gated-notice">完成前置操作后解锁。</p>
              )}
            </section>

            <section
              className={`image-card calculator-card${calculatorUnlocked ? "" : " is-locked"}`}
              aria-labelledby="calculator-heading"
              aria-disabled={!calculatorUnlocked}
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">第 3 步</p>
                  <h3 id="calculator-heading">数据量计算</h3>
                </div>
                <span className="image-card-heading-note">
                  {calculatorUnlocked ? "原始像素数据" : "已锁定"}
                </span>
              </div>
              <div className={`calculator-fields${calculatorUnlocked ? "" : " is-locked"}`}>
                <label>
                  宽度（像素）
                  <input
                    aria-describedby="calculator-help"
                    disabled={!calculatorUnlocked}
                    inputMode="numeric"
                    min="1"
                    onChange={(event) => {
                      if (!calculatorUnlocked) return;
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
                    disabled={!calculatorUnlocked}
                    inputMode="numeric"
                    min="1"
                    onChange={(event) => {
                      if (!calculatorUnlocked) return;
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
                    disabled={!calculatorUnlocked}
                    inputMode="numeric"
                    min="1"
                    onChange={(event) => {
                      if (!calculatorUnlocked) return;
                      setCalculatorBitsPerPixel(event.target.value);
                      editCalculatorField();
                    }}
                    type="number"
                    value={calculatorBitsPerPixel}
                  />
                </label>
              </div>
              {calculatorUnlocked ? (
                <>
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
                </>
              ) : (
                <p className="image-gated-notice">完成第 2 步后解锁。</p>
              )}
            </section>

            <section
              className={`image-card image-format-card${formatControlsUnlocked ? "" : " is-locked"}`}
              aria-labelledby="format-heading"
              aria-disabled={!formatControlsUnlocked}
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">第 4 步</p>
                  <h3 id="format-heading">选择图像格式</h3>
                </div>
                <span className="image-card-heading-note">
                  {!formatControlsUnlocked
                    ? "已锁定"
                    : lesson.formatSelected
                      ? imageFormatLabel(lesson.selectedFormat)
                      : "请选择"}
                </span>
              </div>
              <div
                className={`format-options${formatControlsUnlocked ? "" : " is-locked"}`}
                role="group"
                aria-label="图像格式"
              >
                {IMAGE_FORMAT_PROFILES.map((profile) => (
                  <button
                    aria-pressed={lesson.formatSelected && lesson.selectedFormat === profile.format}
                    className="format-option"
                    disabled={!formatControlsUnlocked}
                    key={profile.format}
                    onClick={() => changeFormat(profile.format)}
                    type="button"
                  >
                    {profile.label}
                  </button>
                ))}
              </div>
              <p className="format-lock-note">
                {formatControlsUnlocked
                  ? "选择一种格式，查看格式边界。PNG、JPG / JPEG 和 WebP 的实际大小取决于图像内容和编码器设置。"
                  : "完成第 3 步后解锁格式边界。"}
              </p>
            </section>

            <section
              className={`image-card image-inspector-card${visualControlsUnlocked ? "" : " is-locked"}`}
              aria-labelledby="inspector-heading"
              aria-disabled={!visualControlsUnlocked}
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">像素详情</p>
                  <h3 id="inspector-heading">把一个像素拆成数字</h3>
                </div>
              </div>
              {visualControlsUnlocked ? (
                <>
                  <div className="inspector-selected-pixel">
                    <span
                      className="inspector-swatch"
                      style={colorStyle(inspection.quantizedColor)}
                    />
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
                      <dt>
                        {model.quantized.colorMode === "rgb24" ? "RGB 颜色" : "量化调色板颜色"}
                      </dt>
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
                </>
              ) : (
                <p className="image-gated-notice">完成第 1 步后，可点击图像查看这里的数字。</p>
              )}
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
                {lesson.colorAdjusted ? (
                  <span>
                    {model.quantized.colorMode === "rgb24"
                      ? "原色 RGB 24 位"
                      : `${model.quantized.palette.length} 个可用颜色`}
                  </span>
                ) : null}
              </div>
              {lesson.colorAdjusted ? (
                model.quantized.colorMode === "rgb24" ? (
                  <p className="image-neutral-notice">原色 RGB 直接保留每个通道的 8 位值。</p>
                ) : (
                  <div className="palette-list">
                    {model.quantized.palette.map((entry) => (
                      <div className="palette-entry" key={entry.index}>
                        <span className="palette-swatch" style={colorStyle(entry.color)} />
                        <code>
                          {entry.index.toString(2).padStart(model.quantized.bitDepth, "0")}
                        </code>
                        <span>{entry.hex}</span>
                      </div>
                    ))}
                  </div>
                )
              ) : (
                <p className="image-gated-notice">
                  {lesson.initialScenario.bitDepth === MIN_BIT_DEPTH
                    ? "切换到调色板后解锁。"
                    : "切换到调色板并调低颜色位深后解锁。"}
                </p>
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
