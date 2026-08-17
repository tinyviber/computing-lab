import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type MouseEvent,
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

const VIEW_LABELS: Record<ImageView, string> = {
  compare: "Compare source / reconstruction",
  sampling: "Sampling reconstruction",
  quantization: "Quantization reconstruction",
  representation: "Encoded representation",
  error: "Visible error map",
};

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
        aria-label={`${label}; use arrow keys to inspect nearby pixels`}
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
        {raster.width} × {raster.height} display pixels
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
      reject(new Error("This browser cannot decode local image uploads."));
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
        if (!context) throw new Error("Canvas decoding is unavailable.");
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
        reject(
          error instanceof Error ? error : new Error("The selected image could not be decoded."),
        );
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be decoded."));
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

function ImageEncodingContent({ search }: { search: Record<string, unknown> }) {
  const scenario = useMemo(() => parseImageEncodingScenario(search), [search]);
  const [lesson, dispatch] = useReducer(transitionImageLesson, scenario, createImageLessonState);
  const [uploadMessage, setUploadMessage] = useState<string | undefined>();
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

  useEffect(() => {
    dispatch({ type: "load-scenario", scenario });
  }, [
    scenario.bitDepth,
    scenario.fixture,
    scenario.phase,
    scenario.samplingPercent,
    scenario.view,
  ]);

  const chooseCanvasPixel = (coordinate: { x: number; y: number }) => {
    dispatch({ type: "select-pixel", ...coordinate });
  };

  const changeFixture = (fixture: ImageFixtureId) => {
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
    try {
      const source = await readUploadedImage(file);
      dispatch({ type: "load-source", source });
      const original = source.sourceDimensions ?? { width: source.width, height: source.height };
      setUploadMessage(
        `已载入 ${source.label}（原图 ${original.width} × ${original.height}；working raster ${source.width} × ${source.height}）`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The selected image could not be decoded.";
      dispatch({ type: "decode-error", message });
      setUploadMessage(undefined);
    }
    event.target.value = "";
  };

  const reset = () => {
    dispatch({ type: "reset" });
    setUploadMessage(undefined);
  };

  return (
    <LabShell
      eyebrow="IMAGE / 01"
      title="图像编码"
      subtitle="Sampling, quantization and reconstruction"
    >
      <div className="image-course">
        <header className="image-course-intro">
          <div>
            <p className="eyebrow">MECHANISM LAB</p>
            <h2>从真实图像到有限的像素编码</h2>
            <p>
              先改变空间采样密度，再限制每个采样像素可使用的颜色状态。重建图像始终保持与原图相同的显示尺寸，方便区分“网页缩小”和“编码后像素化”。
            </p>
          </div>
          <div className="source-meta" aria-label="Current image source">
            <span>
              {lesson.source.sourceKind === "upload" ? "UPLOADED IMAGE" : "LOCAL FIXTURE"}
            </span>
            <strong>{lesson.source.label}</strong>
            <small>
              {lesson.source.sourceDimensions
                ? `original ${lesson.source.sourceDimensions.width} × ${lesson.source.sourceDimensions.height}; working raster `
                : ""}
              {lesson.source.width} × {lesson.source.height} pixels
            </small>
          </div>
        </header>

        <div className="image-course-grid">
          <div className="image-main-column">
            <section className="image-card image-controls-card" aria-labelledby="source-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">SOURCE MATERIAL</p>
                  <h3 id="source-heading">Choose or upload a source image</h3>
                </div>
                <button className="button button-secondary" onClick={reset} type="button">
                  Reset scenario
                </button>
              </div>
              <div className="source-controls">
                <label className="select-field" htmlFor="image-fixture">
                  <span>Built-in material</span>
                  <select
                    id="image-fixture"
                    onChange={(event) => changeFixture(event.target.value as ImageFixtureId)}
                    value={
                      lesson.source.sourceKind === "fixture" ? lesson.source.id : lesson.fixture
                    }
                  >
                    {IMAGE_FIXTURE_LIST.map((fixture) => (
                      <option key={fixture.id} value={fixture.id}>
                        {fixture.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="upload-field">
                  <span>Upload a real image</span>
                  <input accept="image/*" onChange={handleUpload} type="file" />
                  <small>Decode stays local; uploaded pixels are not written to the URL.</small>
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
                  <p className="eyebrow">LIVE RECONSTRUCTION</p>
                  <h3 id="compare-heading">Source → sampled values → quantized reconstruction</h3>
                  <p className="image-card-description">
                    Click either image to inspect the same physical display coordinate.
                  </p>
                </div>
                <span className="display-size-chip">same display size</span>
              </div>
              <div className="canvas-compare-grid">
                <div>
                  <h4>Source image</h4>
                  <CanvasView
                    canvasRef={sourceCanvasRef}
                    label="Original source image"
                    onPick={chooseCanvasPixel}
                    raster={model.source}
                    selectedCoordinate={lesson.selectedCoordinate}
                  />
                </div>
                <div>
                  <h4>Reconstructed image</h4>
                  <CanvasView
                    canvasRef={reconstructionCanvasRef}
                    label="Reconstructed image from sampled and quantized values"
                    onPick={chooseCanvasPixel}
                    raster={model.reconstructed}
                    selectedCoordinate={lesson.selectedCoordinate}
                  />
                </div>
              </div>
              <div className="loss-strip">
                <span>
                  <b>Spatial loss</b> {model.sampled.width} × {model.sampled.height} encoded samples
                </span>
                <span>
                  <b>Color loss</b> up to {model.quantized.palette.length} palette states
                </span>
                <span>
                  <b>Changed display pixels</b> {model.changedPixelCount.toLocaleString()}
                </span>
              </div>
            </section>

            <section className="image-card image-view-card" aria-labelledby="view-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">EVIDENCE VIEWS</p>
                  <h3 id="view-heading">Make the representation visible</h3>
                </div>
                <span className="view-note">Views change what is observed, not the model.</span>
              </div>
              <div className="view-tabs" role="tablist" aria-label="Image encoding evidence views">
                {(Object.keys(VIEW_LABELS) as ImageView[]).map((view) => (
                  <button
                    aria-selected={lesson.view === view}
                    className={`view-tab${lesson.view === view ? " is-active" : ""}`}
                    key={view}
                    onClick={() => dispatch({ type: "set-view", view })}
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
                    label="Pixel error map; brighter orange means a larger RGB difference"
                    onPick={chooseCanvasPixel}
                    raster={model.source}
                    selectedCoordinate={lesson.selectedCoordinate}
                  />
                  <p>
                    每个像素的颜色表示 source 与 reconstructed 的 RGB 距离；它不是浏览器文件的差异。
                  </p>
                </div>
              ) : (
                <div className="representation-stage">
                  <div
                    className="representation-grid"
                    role="grid"
                    aria-label={`${model.quantized.width} by ${model.quantized.height} encoded sample grid`}
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
                        aria-label={`Sample ${pixel.sampleIndex + 1}, source ${rgbToHex(pixel.sourceColor)}, palette index ${pixel.paletteIndex}, encoded ${pixel.encodedBits}`}
                        title={`${pixel.encodedBits} · ${pixel.quantizedHex}`}
                      />
                    ))}
                  </div>
                  <div className="representation-copy">
                    <strong>{VIEW_LABELS[lesson.view]}</strong>
                    <p>
                      {lesson.view === "sampling"
                        ? "每个格子代表一个保留的空间采样值；格子数量改变的是空间离散化密度。"
                        : lesson.view === "quantization"
                          ? "每个格子的颜色来自有限 palette；降低 bit depth 会减少可用状态并产生色带。"
                          : lesson.view === "representation"
                            ? "这是实际写入的 index representation。点击图像后，右侧 inspector 会显示同一个 index 的 bits。"
                            : "像素网格把采样值、palette index 与重建颜色并置显示。"}
                    </p>
                  </div>
                </div>
              )}
            </section>
          </div>

          <aside
            className="image-side-column"
            aria-label="Image encoding controls and pixel inspector"
          >
            <section
              className="image-card image-parameter-card"
              aria-labelledby="parameter-heading"
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">ENCODING PARAMETERS</p>
                  <h3 id="parameter-heading">Change one mechanism at a time</h3>
                </div>
              </div>
              <RangeField
                description="How many source positions are retained on each axis."
                id="sampling-percent"
                label="Spatial sampling"
                max={MAX_SAMPLING_PERCENT}
                min={MIN_SAMPLING_PERCENT}
                onChange={(value) => dispatch({ type: "set-sampling", samplingPercent: value })}
                step={5}
                unit="%"
                value={lesson.samplingPercent}
              />
              <RangeField
                description="Move the sampling grid within one cell to expose phase-sensitive patterns. At 100% sampling, this is fixed at 0 so every source pixel is retained once."
                disabled={lesson.samplingPercent >= MAX_SAMPLING_PERCENT}
                id="sampling-phase"
                label="Sampling grid phase"
                max={MAX_PHASE}
                min={MIN_PHASE}
                onChange={(value) => dispatch({ type: "set-phase", phase: value })}
                step={0.01}
                unit=""
                value={lesson.phase}
              />
              <RangeField
                description="Bits stored for the palette index of each sampled pixel."
                id="bit-depth"
                label="Color bit depth"
                max={MAX_BIT_DEPTH}
                min={MIN_BIT_DEPTH}
                onChange={(value) => dispatch({ type: "set-bit-depth", bitDepth: value })}
                step={1}
                unit=" bit"
                value={lesson.bitDepth}
              />
              <p className="control-note">
                Controls update the sampled representation and reconstruction immediately. There is
                no submit step or target answer.
              </p>
            </section>

            <section className="image-card image-payload-card" aria-labelledby="payload-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">ENCODED REPRESENTATION</p>
                  <h3 id="payload-heading">Theoretical raw payload</h3>
                </div>
              </div>
              <dl className="payload-list">
                <div>
                  <dt>Sampled dimensions</dt>
                  <dd>
                    {model.sampled.width} × {model.sampled.height}
                  </dd>
                </div>
                <div>
                  <dt>Total sampled pixels</dt>
                  <dd>{model.sampled.width * model.sampled.height} px</dd>
                </div>
                <div>
                  <dt>Finite palette states</dt>
                  <dd>
                    ≤ {2 ** model.quantized.bitDepth} ({model.quantized.palette.length} used)
                  </dd>
                </div>
                <div>
                  <dt>Raw payload</dt>
                  <dd>
                    {model.rawPayload.width} × {model.rawPayload.height} ×{" "}
                    {model.rawPayload.bitDepth} = {model.rawPayload.bits} bits
                  </dd>
                </div>
                <div>
                  <dt>Byte conversion</dt>
                  <dd>
                    ceil({model.rawPayload.bits} / 8) = {model.rawPayload.bytes} bytes
                  </dd>
                </div>
              </dl>
              <p className="payload-note">
                这是教学用的 theoretical raw pixel payload，不是 PNG/JPEG 文件大小，不包含 palette
                table、header、metadata 或 codec compression。
              </p>
            </section>

            <section
              className="image-card image-inspector-card"
              aria-labelledby="inspector-heading"
            >
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">PIXEL INSPECTOR</p>
                  <h3 id="inspector-heading">One displayed pixel, all the way to bits</h3>
                </div>
              </div>
              <div className="inspector-selected-pixel">
                <span className="inspector-swatch" style={colorStyle(inspection.quantizedColor)} />
                <div>
                  <strong>
                    Display coordinate ({inspection.sourceX}, {inspection.sourceY})
                  </strong>
                  <small>Click a source or reconstructed image to change it.</small>
                </div>
              </div>
              <dl className="pixel-inspection-list">
                <div>
                  <dt>Original source color</dt>
                  <dd>{rgbToHex(inspection.originalColor)}</dd>
                </div>
                <div>
                  <dt>Sample cell</dt>
                  <dd>
                    ({inspection.sampleX}, {inspection.sampleY}) · #{inspection.sampleIndex + 1}
                  </dd>
                </div>
                <div>
                  <dt>Sampled value</dt>
                  <dd>{rgbToHex(inspection.sampledColor)}</dd>
                </div>
                <div>
                  <dt>Quantized palette color</dt>
                  <dd>
                    {rgbToHex(inspection.quantizedColor)} · index {inspection.paletteIndex}
                  </dd>
                </div>
                <div>
                  <dt>Encoded value</dt>
                  <dd>
                    <code>{inspection.encodedBits}</code> ({model.quantized.bitDepth} bits)
                  </dd>
                </div>
                <div>
                  <dt>Visible RGB error</dt>
                  <dd>{(inspection.errorMagnitude * 100).toFixed(1)}%</dd>
                </div>
              </dl>
            </section>

            <section className="image-card palette-card" aria-labelledby="palette-heading">
              <div className="image-card-heading">
                <div>
                  <p className="eyebrow">PALETTE / INDEX</p>
                  <h3 id="palette-heading">Finite color states</h3>
                </div>
                <span>{model.quantized.palette.length} used</span>
              </div>
              <div className="palette-list">
                {model.quantized.palette.map((entry) => (
                  <div className="palette-entry" key={entry.index}>
                    <span className="palette-swatch" style={colorStyle(entry.color)} />
                    <code>{entry.index.toString(2).padStart(model.quantized.bitDepth, "0")}</code>
                    <span>{entry.hex}</span>
                  </div>
                ))}
              </div>
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
