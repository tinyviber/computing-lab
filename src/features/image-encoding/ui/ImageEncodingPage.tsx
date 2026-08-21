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
  canvasRef?: RefObject<HTMLCanvasElement | null>;
};

type ExplorationTrace = {
  samplingTargetReached: boolean;
  samplingViewed: boolean;
  bitDepthTargetReached: boolean;
  quantizationViewed: boolean;
  representationViewed: boolean;
  pixelInspected: boolean;
};

type MissionTask = {
  id: string;
  title: string;
  detail: string;
  evidenceUnlocked: boolean;
};

const EMPTY_EXPLORATION_TRACE: ExplorationTrace = {
  samplingTargetReached: false,
  samplingViewed: false,
  bitDepthTargetReached: false,
  quantizationViewed: false,
  representationViewed: false,
  pixelInspected: false,
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
    : `本地 ${source.width} × ${source.height} 像素；课堂只改变采样和颜色数量。`;
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
    <div className="image-canvas-frame">
      <canvas
        aria-label={`${label}；可用方向键检查附近像素`}
        className="image-canvas"
        height={raster.height}
        onClick={(event) => onPick(clickCoordinate(event, raster))}
        onKeyDown={handleKeyDown}
        ref={canvasRef}
        role="img"
        tabIndex={0}
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
  description,
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
  description: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <div className="image-control">
      <div className="image-control-heading">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>
          {value}
          {unit}
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
      <p id={`${id}-help`}>{description}</p>
    </div>
  );
}

function MissionList({ tasks }: { tasks: readonly MissionTask[] }) {
  return (
    <details className="image-card mission-card">
      <summary className="mission-summary">
        <span className="mission-summary-label">展开查看任务</span>
      </summary>
      <ol className="mission-list">
        {tasks.map((task) => (
          <li className="mission-item" key={task.id}>
            <strong className="mission-task-title">{task.title}</strong>
            <p>{task.detail}</p>
            {task.evidenceUnlocked ? <p className="mission-evidence">✓ 相关观察已出现</p> : null}
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
  payloadEvidenceUnlocked,
  quantizationEvidenceUnlocked,
  samplingEvidenceUnlocked,
  traceEvidenceUnlocked,
}: {
  payloadEvidenceUnlocked: boolean;
  quantizationEvidenceUnlocked: boolean;
  samplingEvidenceUnlocked: boolean;
  traceEvidenceUnlocked: boolean;
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
          unlocked={samplingEvidenceUnlocked}
        >
          编码单元数量真的变少了；重建时再把有限的采样值铺回原显示尺寸。你可以继续比较两张画布。
        </DeepDiveItem>
        <DeepDiveItem
          number="02"
          title="位深改变后，可用颜色数怎样变化？"
          unlocked={quantizationEvidenceUnlocked}
        >
          当每个采样像素使用 b 位索引时，最多有 2<sup>b</sup> 个调色板状态。位深减半，不等于 RGB
          三个通道各自减半。
        </DeepDiveItem>
        <DeepDiveItem number="03" title="一个像素怎样变成数字？" unlocked={traceEvidenceUnlocked}>
          从显示位置找到采样格，再看它对应的颜色编号和二进制数字；检查器中的数字就是还原图像时使用的表示。
        </DeepDiveItem>
        <DeepDiveItem
          number="04"
          title="公式算出的原始数据量代表什么？"
          unlocked={payloadEvidenceUnlocked}
        >
          本实验计算的是“采样像素数 ×
          每像素位数”的原始数据量，暂不包含文件头、颜色表、元数据和压缩编码。
        </DeepDiveItem>
      </div>
    </section>
  );
}

function ImageEncodingContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseImageEncodingScenario(search), [search]);
  const [lesson, dispatch] = useReducer(transitionImageLesson, scenario, createImageLessonState);
  const [uploadMessage, setUploadMessage] = useState<string | undefined>();
  const [trace, setTrace] = useState<ExplorationTrace>(EMPTY_EXPLORATION_TRACE);
  const sourceCanvasRef = useRef<HTMLCanvasElement>(null);
  const reconstructionCanvasRef = useRef<HTMLCanvasElement>(null);
  const errorCanvasRef = useRef<HTMLCanvasElement>(null);
  const model = useMemo(
    () =>
      deriveImageEncodingModel(lesson.source, {
        samplingPercent: lesson.samplingPercent,
        bitDepth: lesson.bitDepth,
        phase: lesson.phase,
      }),
    [lesson.bitDepth, lesson.phase, lesson.samplingPercent, lesson.source],
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

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
    setTrace(EMPTY_EXPLORATION_TRACE);
  }, [
    scenario.bitDepth,
    scenario.fixture,
    scenario.phase,
    scenario.samplingPercent,
    scenario.view,
  ]);

  const chooseCanvasPixel = (coordinate: { x: number; y: number }) => {
    setTrace((current) => ({ ...current, pixelInspected: true }));
    dispatch({ type: "select-pixel", ...coordinate });
  };

  const changeSampling = (samplingPercent: number) => {
    setTrace((current) => ({
      ...current,
      samplingTargetReached: current.samplingTargetReached || samplingPercent < 50,
    }));
    dispatch({ type: "set-sampling", samplingPercent });
  };

  const changeBitDepth = (bitDepth: number) => {
    setTrace((current) => ({
      ...current,
      bitDepthTargetReached: current.bitDepthTargetReached || bitDepth === 2,
    }));
    dispatch({ type: "set-bit-depth", bitDepth });
  };

  const changeView = (view: ImageView) => {
    setTrace((current) => ({
      ...current,
      samplingViewed: current.samplingViewed || view === "sampling",
      quantizationViewed: current.quantizationViewed || view === "quantization",
      representationViewed: current.representationViewed || view === "representation",
    }));
    dispatch({ type: "set-view", view });
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setTrace(EMPTY_EXPLORATION_TRACE);
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
    setTrace(EMPTY_EXPLORATION_TRACE);
  };

  const spatialEvidenceUnlocked = trace.samplingTargetReached && trace.samplingViewed;
  const quantizationEvidenceUnlocked = trace.bitDepthTargetReached && trace.quantizationViewed;
  const traceEvidenceUnlocked = trace.representationViewed && trace.pixelInspected;
  const payloadEvidenceUnlocked = trace.representationViewed && trace.bitDepthTargetReached;

  const missionTasks: MissionTask[] = [
    {
      id: "predict",
      title: "预测：采样变少后，哪种信息先消失？",
      detail: "先写下判断，再调整采样。",
      evidenceUnlocked: false,
    },
    {
      id: "sample",
      title: "调低空间采样，记录采样尺寸",
      detail: "调到 25% 左右，比较采样宽 × 高与画布显示尺寸。",
      evidenceUnlocked: trace.samplingTargetReached,
    },
    {
      id: "spatial-loss",
      title: "比较采样重建",
      detail: "比较原图与重建图像的细节变化。",
      evidenceUnlocked: spatialEvidenceUnlocked,
    },
    {
      id: "quantize",
      title: "调低颜色位深",
      detail: "调到 2 位，数一数最多能出现多少种颜色状态，并比较图像变化。",
      evidenceUnlocked: trace.bitDepthTargetReached,
    },
    {
      id: "color-loss",
      title: "比较量化重建",
      detail: "比较量化重建与采样重建的颜色变化。",
      evidenceUnlocked: quantizationEvidenceUnlocked,
    },
    {
      id: "trace-bits",
      title: "把一个像素拆成数字",
      detail: "打开编码表示，点击一个像素，查看位置、颜色编号和二进制编码。",
      evidenceUnlocked: traceEvidenceUnlocked,
    },
    {
      id: "payload",
      title: "核对原始数据量",
      detail: "核对采样宽、高、位深与计算结果。",
      evidenceUnlocked: payloadEvidenceUnlocked,
    },
    {
      id: "tradeoff",
      title: "比较两种参数取舍",
      detail: "比较高采样 + 低位深与低采样 + 高位深。",
      evidenceUnlocked: false,
    },
    {
      id: "transfer",
      title: "联系 PNG / JPEG 文件",
      detail: "写出两个理论数据量未包含的文件部分。",
      evidenceUnlocked: false,
    },
    {
      id: "explain",
      title: "用 80 字总结取舍关系",
      detail: "写出采样、颜色数量与图像变化之间的原因和推导过程。",
      evidenceUnlocked: false,
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
            <MissionList tasks={missionTasks} />
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
                  <input accept="image/*" onChange={handleUpload} type="file" />
                  <small>解码仅在本地进行；上传像素不会写入 URL。</small>
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
                  />
                </div>
              </div>
              <div className="loss-strip">
                <span>
                  <b>采样数量</b> {model.sampled.width} × {model.sampled.height} 个编码采样
                </span>
                <span>
                  <b>可用颜色数</b> {model.quantized.palette.length} 个 · 采样 RGB 误差{" "}
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
                    label="像素误差图"
                    onPick={chooseCanvasPixel}
                    raster={model.source}
                    selectedCoordinate={lesson.selectedCoordinate}
                  />
                  <p>比较每个位置的颜色差异。</p>
                </div>
              ) : (
                <div className="representation-stage">
                  <div
                    className="representation-grid"
                    role="grid"
                    aria-label={`${model.quantized.width} × ${model.quantized.height} 编码采样网格`}
                    style={{
                      gridTemplateColumns: `repeat(${model.quantized.width}, minmax(0, 1fr))`,
                    }}
                  >
                    {model.quantized.pixels.map((pixel) => (
                      <div
                        className="representation-cell"
                        key={pixel.sampleIndex}
                        role="gridcell"
                        style={colorStyle(
                          lesson.view === "sampling" ? pixel.sourceColor : pixel.quantizedColor,
                        )}
                        aria-label={
                          trace.representationViewed
                            ? `采样 ${pixel.sampleIndex + 1}；源色 ${rgbToHex(pixel.sourceColor)}；调色板索引 ${pixel.paletteIndex}；编码值 ${pixel.encodedBits}`
                            : `采样 ${pixel.sampleIndex + 1}；选择该格查看颜色`
                        }
                        title={
                          trace.representationViewed
                            ? `${pixel.encodedBits} · ${pixel.quantizedHex}`
                            : undefined
                        }
                      />
                    ))}
                  </div>
                  <div className="representation-copy">
                    <strong>{VIEW_LABELS[lesson.view]}</strong>
                    <p>
                      {lesson.view === "sampling"
                        ? "比较网格大小与图像变化。"
                        : lesson.view === "quantization"
                          ? "比较可用颜色数与渐变区域变化。"
                          : lesson.view === "representation"
                            ? "点击像素，查看位置、颜色编号和二进制编码。"
                            : "比较采样值、颜色编号和还原颜色。"}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside className="image-side-column" aria-label="图像编码控制与像素检查器">
            <DeepDivePanel
              payloadEvidenceUnlocked={payloadEvidenceUnlocked}
              quantizationEvidenceUnlocked={quantizationEvidenceUnlocked}
              samplingEvidenceUnlocked={spatialEvidenceUnlocked}
              traceEvidenceUnlocked={traceEvidenceUnlocked}
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
                description="拖动滑杆（也可聚焦后用方向键）改变采样参数，更新图像和采样数量。"
                id="sampling-percent"
                label="空间采样"
                max={MAX_SAMPLING_PERCENT}
                min={MIN_SAMPLING_PERCENT}
                onChange={changeSampling}
                step={5}
                unit="%"
                value={lesson.samplingPercent}
              />
              <RangeField
                description={phaseControlDescription(phaseGeometry)}
                disabled={phaseIsInert}
                id="sampling-phase"
                label="采样网格相位"
                max={MAX_PHASE}
                min={MIN_PHASE}
                onChange={(value) => dispatch({ type: "set-phase", phase: value })}
                step={0.01}
                unit=""
                value={phaseIsInert ? 0 : lesson.phase}
              />
              <RangeField
                description="拖动滑杆（也可聚焦后用方向键）改变颜色数量，更新颜色数和图像。"
                id="bit-depth"
                label="颜色位深"
                max={MAX_BIT_DEPTH}
                min={MIN_BIT_DEPTH}
                onChange={changeBitDepth}
                step={1}
                unit=" 位"
                value={lesson.bitDepth}
              />
              <p className="control-note">控件会立即更新采样表示与重建图像。</p>
            </section>

            <section className="image-card image-payload-card" aria-labelledby="payload-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">编码表示</p>
                  <h3 id="payload-heading">原始数据量</h3>
                </div>
              </div>
              {payloadEvidenceUnlocked ? (
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
                      <dd>{model.quantized.palette.length} 个可用颜色编号</dd>
                    </div>
                    <div>
                      <dt>原始数据量</dt>
                      <dd>
                        {model.rawPayload.width} × {model.rawPayload.height} ×{" "}
                        {model.rawPayload.bitDepth} = {model.rawPayload.bits} 位
                      </dd>
                    </div>
                    <div>
                      <dt>字节换算</dt>
                      <dd>
                        ceil({model.rawPayload.bits} / 8) = {model.rawPayload.bytes} 字节
                      </dd>
                    </div>
                  </dl>
                  <p className="payload-note">
                    这里计算的是理论原始像素数据量，不是 PNG/JPEG
                    文件大小；不包含调色板表、文件头、元数据或编解码压缩。
                  </p>
                </>
              ) : (
                <p className="image-gated-notice">完成前置操作后解锁。</p>
              )}
            </section>

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
              {traceEvidenceUnlocked ? (
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
                      <small>点击原图或重建图像可切换检查位置。</small>
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
                      <dt>量化调色板颜色</dt>
                      <dd>
                        {rgbToHex(inspection.quantizedColor)} · 索引 {inspection.paletteIndex}
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
                <p className="image-gated-notice">打开编码表示并选择像素。</p>
              )}
            </section>

            <section className="image-card palette-card" aria-labelledby="palette-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">颜色表 / 编号</p>
                  <h3 id="palette-heading">颜色编号</h3>
                </div>
                {trace.bitDepthTargetReached ? (
                  <span>{model.quantized.palette.length} 个可用颜色</span>
                ) : null}
              </div>
              {trace.bitDepthTargetReached ? (
                <div className="palette-list">
                  {model.quantized.palette.map((entry) => (
                    <div className="palette-entry" key={entry.index}>
                      <span className="palette-swatch" style={colorStyle(entry.color)} />
                      <code>{entry.index.toString(2).padStart(model.quantized.bitDepth, "0")}</code>
                      <span>{entry.hex}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="image-gated-notice">颜色位深调到 2 位后解锁。</p>
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
