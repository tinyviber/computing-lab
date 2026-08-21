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
import { IMAGE_FIXTURE_LIST, type ImageFixtureId } from "../domain/fixture";
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
  error: "可见误差图",
};

function imageFixtureLabel(id: ImageFixtureId): string {
  return {
    photo: "彩色采样练习图",
    gradient: "平滑色彩渐变",
    checkerboard: "细棋盘格",
    "text-edge": "文字与细线边缘",
    "pixel-grid": "可追踪像素图",
  }[id];
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
        <span className="mission-summary-label">课堂任务单</span>
        <span className="mission-summary-description">展开后直接查看 10 项任务和证据状态。</span>
      </summary>
      <ol className="mission-list">
        {tasks.map((task) => (
          <li className="mission-item" key={task.id}>
            <strong className="mission-task-title">{task.title}</strong>
            <p>{task.detail}</p>
            {task.evidenceUnlocked ? (
              <p className="mission-evidence">
                状态：相关证据已出现；仍需学生记录、描述、计算或解释。
              </p>
            ) : null}
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
      {unlocked ? (
        <p>{children}</p>
      ) : (
        <p className="deep-dive-locked">相关证据出现后，这里显示原理说明。</p>
      )}
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
          <p className="eyebrow">可选深挖</p>
          <h3 id="deep-dive-heading">继续追问：机器究竟保存了什么？</h3>
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
          title="位深改变后，可用状态如何变化？"
          unlocked={quantizationEvidenceUnlocked}
        >
          当每个采样像素使用 b 位索引时，最多有 2<sup>b</sup> 个调色板状态。位深减半，不等于 RGB
          三个通道各自减半。
        </DeepDiveItem>
        <DeepDiveItem
          number="03"
          title="显示像素如何对应到 bits？"
          unlocked={traceEvidenceUnlocked}
        >
          从显示坐标追踪到采样格，再到调色板索引；检查器中的 bit 串就是重建时真正使用的表示。
        </DeepDiveItem>
        <DeepDiveItem
          number="04"
          title="公式算出的载荷代表什么？"
          unlocked={payloadEvidenceUnlocked}
        >
          本实验计算的是“采样像素数 ×
          每像素位数”的原始载荷，暂不包含文件头、调色板、元数据和压缩编码。
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

  const changeFixture = (fixture: ImageFixtureId) => {
    setTrace(EMPTY_EXPLORATION_TRACE);
    dispatch({
      type: "load-scenario",
      scenario: {
        fixture,
        samplingPercent: lesson.samplingPercent,
        bitDepth: lesson.bitDepth,
        phase: lesson.phase,
        view: lesson.view,
      },
    });
    setUploadMessage(undefined);
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
      detail: "把预测写在纸上。",
      evidenceUnlocked: false,
    },
    {
      id: "sample",
      title: "调低空间采样，记录采样尺寸",
      detail: "调到 25% 左右，记下采样宽 × 高，并与画布显示尺寸比较。",
      evidenceUnlocked: trace.samplingTargetReached,
    },
    {
      id: "spatial-loss",
      title: "观察采样重建",
      detail: "记录一处变化，再改变另一个变量验证。",
      evidenceUnlocked: spatialEvidenceUnlocked,
    },
    {
      id: "quantize",
      title: "调低颜色位深",
      detail: "调到 2 位，记录最多状态数和图像变化。",
      evidenceUnlocked: trace.bitDepthTargetReached,
    },
    {
      id: "color-loss",
      title: "观察量化重建",
      detail: "记录一处颜色变化，并与采样视图比较。",
      evidenceUnlocked: quantizationEvidenceUnlocked,
    },
    {
      id: "trace-bits",
      title: "追踪一个像素到 bits",
      detail: "打开编码表示，点击一个像素，记下坐标、索引和 bits。",
      evidenceUnlocked: traceEvidenceUnlocked,
    },
    {
      id: "payload",
      title: "核对编码载荷",
      detail: "记下采样宽、高、位深，核对计算结果。",
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
      title: "迁移到 PNG / JPEG 文件",
      detail: "写出两个理论载荷未包含的文件部分。",
      evidenceUnlocked: false,
    },
    {
      id: "explain",
      title: "用 80 字总结取舍关系",
      detail: "写出采样、量化与图像变化之间的因果链。",
      evidenceUnlocked: false,
    },
  ];

  return (
    <LabShell
      eyebrow="图像 / 01"
      title="图像编码"
      subtitle="采样（sampling）、量化（quantization）与重建（reconstruction）"
    >
      <div className="image-course">
        <header className="image-course-intro">
          <div>
            <p className="eyebrow">机制实验</p>
            <h2>从图像到有限的像素编码</h2>
            <p>
              教师设定本节问题，学生调整参数、观察并记录结果，再用记录解释采样、量化与重建的关系。
            </p>
          </div>
          <div className="source-meta" aria-label="当前图像来源">
            <span>{lesson.source.sourceKind === "upload" ? "已上传图像" : "本地样例"}</span>
            <strong>
              {lesson.source.sourceKind === "fixture"
                ? imageFixtureLabel(lesson.source.id)
                : lesson.source.label}
            </strong>
            <small>
              {lesson.source.sourceDimensions
                ? `原始 ${lesson.source.sourceDimensions.width} × ${lesson.source.sourceDimensions.height}；工作栅格 `
                : ""}
              {lesson.source.width} × {lesson.source.height} 像素
            </small>
          </div>
        </header>

        <nav className="image-stage-nav" aria-label="图像编码学习流程">
          <span className="image-stage">
            <b>01</b>
            <span>任务单</span>
          </span>
          <span className="image-stage">
            <b>02</b>
            <span>观察重建</span>
          </span>
          <span className="image-stage">
            <b>03</b>
            <span>追踪 bits</span>
          </span>
          <span className="image-stage">
            <b>04</b>
            <span>迁移解释</span>
          </span>
        </nav>

        <div className="image-course-grid">
          <div className="image-main-column">
            <MissionList tasks={missionTasks} />
            <section className="image-card image-controls-card" aria-labelledby="source-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">源素材</p>
                  <h3 id="source-heading">选择或上传源图像</h3>
                </div>
                <button className="button button-secondary" onClick={reset} type="button">
                  恢复样例情境
                </button>
              </div>
              <div className="source-controls">
                <label className="select-field" htmlFor="image-fixture">
                  <span>内置素材</span>
                  <select
                    id="image-fixture"
                    onChange={(event) => changeFixture(event.target.value as ImageFixtureId)}
                    value={
                      lesson.source.sourceKind === "fixture" ? lesson.source.id : lesson.fixture
                    }
                  >
                    {IMAGE_FIXTURE_LIST.map((fixture) => (
                      <option key={fixture.id} value={fixture.id}>
                        {imageFixtureLabel(fixture.id)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="upload-field">
                  <span>上传真实图像</span>
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
                <span className="display-size-chip">记录两张画布</span>
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
                  <b>状态数量</b> {model.quantized.palette.length} 个状态 · 采样 RGB 误差{" "}
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
                  <p className="eyebrow">证据视图</p>
                  <h3 id="view-heading">让表示过程可见</h3>
                </div>
                <span className="view-note">视图用于记录不同观察结果。</span>
              </div>
              <div className="view-tabs" role="tablist" aria-label="图像编码证据视图">
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
                  <p>比较每个位置的颜色差异，并记录变化集中在哪里。</p>
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
                            : `采样 ${pixel.sampleIndex + 1}；记录该格颜色`
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
                        ? "记录网格中的格子数量，以及图像中哪些位置发生变化。"
                        : lesson.view === "quantization"
                          ? "记录状态数量，并观察渐变区域的变化。"
                          : lesson.view === "representation"
                            ? "点击一个像素后，对照检查器记录它的坐标、索引和 bits。"
                            : "把采样值、状态和重建颜色放在一起记录。"}
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
                  <h3 id="parameter-heading">一次只改变一个机制</h3>
                </div>
              </div>
              <RangeField
                description="拖动滑杆（也可聚焦后用方向键）改变采样参数，记录图像和采样数量的变化。"
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
                description="拖动滑杆（也可聚焦后用方向键）改变位深，记录状态数量和图像变化。"
                id="bit-depth"
                label="颜色位深"
                max={MAX_BIT_DEPTH}
                min={MIN_BIT_DEPTH}
                onChange={changeBitDepth}
                step={1}
                unit=" 位"
                value={lesson.bitDepth}
              />
              <p className="control-note">
                控件会立即更新采样表示与重建图像；没有提交步骤，也没有预设目标答案。
              </p>
            </section>

            <section className="image-card image-payload-card" aria-labelledby="payload-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">编码表示</p>
                  <h3 id="payload-heading">载荷记录</h3>
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
                      <dt>状态数量</dt>
                      <dd>{model.quantized.palette.length} 个可用索引状态</dd>
                    </div>
                    <div>
                      <dt>原始载荷</dt>
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
                    这是教学用的理论原始像素载荷，不是 PNG/JPEG
                    文件大小；不包含调色板表、文件头、元数据或编解码压缩。
                  </p>
                </>
              ) : (
                <p className="image-gated-notice">相关证据出现后，这里显示载荷记录。</p>
              )}
            </section>

            <section
              className="image-card image-inspector-card"
              aria-labelledby="inspector-heading"
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">像素检查器</p>
                  <h3 id="inspector-heading">从一个显示像素追踪到 bits</h3>
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
                      <dt>可见 RGB 误差</dt>
                      <dd>{(inspection.errorMagnitude * 100).toFixed(1)}%</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="image-gated-notice">
                  打开编码表示并点击一个像素后，这里显示对应记录。
                </p>
              )}
            </section>

            <section className="image-card palette-card" aria-labelledby="palette-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">调色板 / 索引</p>
                  <h3 id="palette-heading">状态记录</h3>
                </div>
                {trace.bitDepthTargetReached ? (
                  <span>{model.quantized.palette.length} 个可用状态</span>
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
                <p className="image-gated-notice">调到 2 位后，这里显示状态记录。</p>
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
