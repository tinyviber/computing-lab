import type { ImageFixtureId } from "./fixture";

export type RGB = { r: number; g: number; b: number };

export type RasterImage = {
  id: string;
  label: string;
  sourceKind: "fixture" | "upload";
  width: number;
  height: number;
  pixels: readonly RGB[];
  sourceDimensions?: { width: number; height: number };
};

export type ImageEncodingOptions = {
  samplingPercent: number;
  bitDepth: number;
  phase: number;
  colorMode?: ImageColorMode;
};

export type ImageColorMode = "palette" | "rgb24";

export type SampledPixel = {
  sampleX: number;
  sampleY: number;
  sampleIndex: number;
  sourceX: number;
  sourceY: number;
  sourceColor: RGB;
};

export type SamplingAxisGeometry = {
  sourceSize: number;
  sampledSize: number;
  effectivePhase: number;
};

export type SamplingGeometry = {
  x: SamplingAxisGeometry;
  y: SamplingAxisGeometry;
};

export type SampledRepresentation = {
  width: number;
  height: number;
  pixels: readonly SampledPixel[];
  samplingPercent: number;
  requestedPhase: number;
  geometry: SamplingGeometry;
};

export type PaletteEntry = {
  index: number;
  color: RGB;
  hex: string;
};

export type QuantizedPixel = SampledPixel & {
  paletteIndex: number;
  encodedBits: string;
  quantizedColor: RGB;
  quantizedHex: string;
};

export type QuantizedRepresentation = {
  width: number;
  height: number;
  pixels: readonly QuantizedPixel[];
  palette: readonly PaletteEntry[];
  bitDepth: number;
  colorMode: ImageColorMode;
  requestedPhase: number;
};

export type PixelError = {
  sourceColor: RGB;
  reconstructedColor: RGB;
  magnitude: number;
};

export type RawPayload = {
  width: number;
  height: number;
  bitDepth: number;
  bits: number;
  bytes: number;
};

export type ImageEncodingFormat = "raw" | "png" | "jpeg" | "webp";

export type ImageFormatProfile = {
  format: ImageEncodingFormat;
  label: string;
  fixedBytes: number;
  rawByteFactor: number;
  pixelsPerOverheadByte: number;
};

export type ImageEncodingCalculation = {
  width: number;
  height: number;
  bitsPerPixel: number;
  pixelCount: number;
  rawBits: number;
  rawBytes: number;
  format: ImageEncodingFormat;
  formatLabel: string;
  classroomBytes: number;
};

export type ImageEncodingModel = {
  source: RasterImage;
  sampled: SampledRepresentation;
  quantized: QuantizedRepresentation;
  reconstructed: RasterImage;
  errorMap: readonly PixelError[];
  averageError: number;
  averageQuantizationError: number;
  changedPixelCount: number;
  rawPayload: RawPayload;
};

export type PixelInspection = {
  sourceX: number;
  sourceY: number;
  sampleX: number;
  sampleY: number;
  sampleIndex: number;
  originalColor: RGB;
  sampledColor: RGB;
  paletteIndex: number;
  quantizedColor: RGB;
  encodedBits: string;
  errorMagnitude: number;
};

export const MIN_SAMPLING_PERCENT = 10;
export const MAX_SAMPLING_PERCENT = 100;
export const MIN_BIT_DEPTH = 1;
export const MAX_BIT_DEPTH = 8;
export const RGB24_BIT_DEPTH = 24;
export const MIN_PHASE = 0;
export const MAX_PHASE = 0.99;
export const MIN_CALCULATOR_DIMENSION = 1;
export const MAX_CALCULATOR_DIMENSION = 10000;
export const MIN_CALCULATOR_BITS_PER_PIXEL = 1;
export const MAX_CALCULATOR_BITS_PER_PIXEL = 32;

export const IMAGE_FORMAT_PROFILES: readonly ImageFormatProfile[] = [
  {
    format: "raw",
    label: "未压缩 / 原始",
    fixedBytes: 0,
    rawByteFactor: 1,
    pixelsPerOverheadByte: Number.POSITIVE_INFINITY,
  },
  {
    format: "png",
    label: "PNG",
    fixedBytes: 64,
    rawByteFactor: 0.72,
    pixelsPerOverheadByte: 256,
  },
  {
    format: "jpeg",
    label: "JPG / JPEG",
    fixedBytes: 128,
    rawByteFactor: 0.48,
    pixelsPerOverheadByte: 512,
  },
  {
    format: "webp",
    label: "WebP",
    fixedBytes: 96,
    rawByteFactor: 0.42,
    pixelsPerOverheadByte: 512,
  },
];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizeSamplingPercent(value: number): number {
  return clamp(Math.round(finiteOr(value, 50)), MIN_SAMPLING_PERCENT, MAX_SAMPLING_PERCENT);
}

export function normalizeBitDepth(value: number): number {
  return clamp(Math.round(finiteOr(value, 4)), MIN_BIT_DEPTH, MAX_BIT_DEPTH);
}

export function normalizeColorMode(value: unknown): ImageColorMode {
  return value === "rgb24" ? "rgb24" : "palette";
}

export function normalizePhase(value: number): number {
  return clamp(finiteOr(value, 0), MIN_PHASE, MAX_PHASE);
}

export function normalizeCalculatorDimension(value: number, fallback = 1): number {
  return clamp(
    Math.floor(finiteOr(value, fallback)),
    MIN_CALCULATOR_DIMENSION,
    MAX_CALCULATOR_DIMENSION,
  );
}

export function normalizeCalculatorBitsPerPixel(value: number, fallback = 8): number {
  return clamp(
    Math.floor(finiteOr(value, fallback)),
    MIN_CALCULATOR_BITS_PER_PIXEL,
    MAX_CALCULATOR_BITS_PER_PIXEL,
  );
}

export function normalizeImage(source: RasterImage): RasterImage {
  const width = Math.max(1, Math.floor(finiteOr(source.width, 1)));
  const height = Math.max(1, Math.floor(finiteOr(source.height, 1)));
  const pixels = Array.from(
    { length: width * height },
    (_, index) => source.pixels[index] ?? { r: 0, g: 0, b: 0 },
  );
  return { ...source, width, height, pixels };
}

function channel(value: number): number {
  return clamp(Math.round(finiteOr(value, 0)), 0, 255);
}

function normalizeRgb(color: RGB): RGB {
  return { r: channel(color.r), g: channel(color.g), b: channel(color.b) };
}

export function rgbToHex(color: RGB): string {
  return `#${[color.r, color.g, color.b]
    .map((value) => channel(value).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function hexToRgb(hex: string): RGB {
  const raw = hex.replace(/^#/, "");
  const expanded = raw.length === 3 ? [...raw].map((part) => `${part}${part}`).join("") : raw;
  const value = expanded.padEnd(6, "0").slice(0, 6);
  return {
    r: Number.parseInt(value.slice(0, 2), 16) || 0,
    g: Number.parseInt(value.slice(2, 4), 16) || 0,
    b: Number.parseInt(value.slice(4, 6), 16) || 0,
  };
}

export function colorDistance(first: RGB, second: RGB): number {
  return Math.sqrt(
    (first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2,
  );
}

function colorKey(color: RGB): string {
  return `${channel(color.r)},${channel(color.g)},${channel(color.b)}`;
}

function colorOrder(first: RGB, second: RGB): number {
  return first.r - second.r || first.g - second.g || first.b - second.b;
}

const CODEBOOK_CHANNELS = [0, 36, 73, 109, 146, 182, 219, 255] as const;
const MAX_CODEBOOK_STATES = 2 ** MAX_BIT_DEPTH;

function squaredColorDistance(first: RGB, second: RGB): number {
  return (first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2;
}

/**
 * Build one nested, deterministic codebook. Prefixes are retained as bit depth grows,
 * so adding an index bit can only add candidate colors and cannot increase nearest-color error.
 */
function buildProgressiveCodebook(): PaletteEntry[] {
  const candidates = CODEBOOK_CHANNELS.flatMap((r) =>
    CODEBOOK_CHANNELS.flatMap((g) => CODEBOOK_CHANNELS.map((b) => ({ r, g, b }))),
  );
  const chosen: RGB[] = [
    { r: 0, g: 0, b: 0 },
    { r: 255, g: 255, b: 255 },
  ];
  const chosenKeys = new Set(chosen.map(colorKey));
  while (chosen.length < MAX_CODEBOOK_STATES) {
    let bestCandidate: RGB | undefined;
    let bestDistance = -1;
    for (const candidate of candidates) {
      if (chosenKeys.has(colorKey(candidate))) continue;
      const distance = Math.min(...chosen.map((color) => squaredColorDistance(candidate, color)));
      if (
        distance > bestDistance ||
        (distance === bestDistance &&
          bestCandidate !== undefined &&
          colorOrder(candidate, bestCandidate) < 0)
      ) {
        bestCandidate = candidate;
        bestDistance = distance;
      }
    }
    if (!bestCandidate) break;
    chosen.push(bestCandidate);
    chosenKeys.add(colorKey(bestCandidate));
  }
  return chosen.map((color, index) => ({ index, color, hex: rgbToHex(color) }));
}

const PROGRESSIVE_CODEBOOK = buildProgressiveCodebook();

export function sampledDimensions(
  source: RasterImage,
  samplingPercent: number,
): { width: number; height: number } {
  const percent = normalizeSamplingPercent(samplingPercent) / 100;
  return {
    width: Math.max(1, Math.round(source.width * percent)),
    height: Math.max(1, Math.round(source.height * percent)),
  };
}

function effectivePhaseForAxis(phase: number, sampledSize: number, sourceSize: number): number {
  return sampledSize >= sourceSize ? MIN_PHASE : normalizePhase(phase);
}

function samplingGeometryForNormalizedSource(
  source: RasterImage,
  samplingPercentInput: number,
  phaseInput: number,
): SamplingGeometry {
  const samplingPercent = normalizeSamplingPercent(samplingPercentInput);
  const { width, height } = sampledDimensions(source, samplingPercent);
  const phase = normalizePhase(phaseInput);
  return {
    x: {
      sourceSize: source.width,
      sampledSize: width,
      effectivePhase: effectivePhaseForAxis(phase, width, source.width),
    },
    y: {
      sourceSize: source.height,
      sampledSize: height,
      effectivePhase: effectivePhaseForAxis(phase, height, source.height),
    },
  };
}

/** Per-axis geometry is the source of truth for whether phase can affect sampling. */
export function samplingGeometry(
  sourceInput: RasterImage,
  options: Pick<ImageEncodingOptions, "samplingPercent" | "phase">,
): SamplingGeometry {
  return samplingGeometryForNormalizedSource(
    normalizeImage(sourceInput),
    options.samplingPercent,
    options.phase,
  );
}

export function isSamplingPhaseInert(sourceInput: RasterImage, samplingPercent: number): boolean {
  const geometry = samplingGeometry(sourceInput, { samplingPercent, phase: MIN_PHASE });
  return (
    geometry.x.sampledSize >= geometry.x.sourceSize &&
    geometry.y.sampledSize >= geometry.y.sourceSize
  );
}

function wrapIndex(index: number, size: number): number {
  return ((index % size) + size) % size;
}

function sampleSourceCoordinate(
  index: number,
  sampledSize: number,
  sourceSize: number,
  phase: number,
): number {
  const axisPhase = effectivePhaseForAxis(phase, sampledSize, sourceSize);
  const position = ((index + 0.5 + axisPhase) / sampledSize) * sourceSize;
  return wrapIndex(Math.floor(position), sourceSize);
}

function sampleIndexForSourceCoordinate(
  coordinate: number,
  sampledSize: number,
  sourceSize: number,
  phase: number,
): number {
  const axisPhase = effectivePhaseForAxis(phase, sampledSize, sourceSize);
  const position = ((coordinate + 0.5) / sourceSize) * sampledSize - axisPhase;
  return wrapIndex(Math.floor(position), sampledSize);
}

export function sampleImage(
  sourceInput: RasterImage,
  options: Pick<ImageEncodingOptions, "samplingPercent" | "phase">,
): SampledRepresentation {
  const source = normalizeImage(sourceInput);
  const samplingPercent = normalizeSamplingPercent(options.samplingPercent);
  const requestedPhase = normalizePhase(options.phase);
  const geometry = samplingGeometryForNormalizedSource(source, samplingPercent, requestedPhase);
  const { sampledSize: width } = geometry.x;
  const { sampledSize: height } = geometry.y;
  const pixels = Array.from({ length: width * height }, (_, index) => {
    const sampleY = Math.floor(index / width);
    const sampleX = index % width;
    const sourceX = sampleSourceCoordinate(sampleX, width, source.width, geometry.x.effectivePhase);
    const sourceY = sampleSourceCoordinate(
      sampleY,
      height,
      source.height,
      geometry.y.effectivePhase,
    );
    return {
      sampleX,
      sampleY,
      sampleIndex: index,
      sourceX,
      sourceY,
      sourceColor: normalizeRgb(source.pixels[sourceY * source.width + sourceX]),
    };
  });
  return {
    width,
    height,
    pixels,
    samplingPercent,
    requestedPhase,
    geometry,
  };
}

export function buildPalette(
  _sampledPixels: readonly SampledPixel[],
  bitDepth: number,
): PaletteEntry[] {
  const safeBits = normalizeBitDepth(bitDepth);
  void _sampledPixels;
  return PROGRESSIVE_CODEBOOK.slice(0, 2 ** safeBits);
}

export function quantizeColorToPalette(
  colorInput: RGB,
  palette: readonly PaletteEntry[],
): { paletteIndex: number; color: RGB; hex: string } {
  const color = normalizeRgb(colorInput);
  let best = palette[0] ?? { index: 0, color: { r: 0, g: 0, b: 0 }, hex: "#000000" };
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of palette) {
    const distance = colorDistance(color, entry.color);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return { paletteIndex: best.index, color: best.color, hex: best.hex };
}

export function quantizeSampledImage(
  sampled: SampledRepresentation,
  bitDepth: number,
  colorMode: ImageColorMode = "palette",
): QuantizedRepresentation {
  if (normalizeColorMode(colorMode) === "rgb24") {
    const pixels = sampled.pixels.map((pixel) => {
      const color = normalizeRgb(pixel.sourceColor);
      const encodedBits = [color.r, color.g, color.b]
        .map((channelValue) => channelValue.toString(2).padStart(8, "0"))
        .join("");
      return {
        ...pixel,
        paletteIndex: 0,
        encodedBits,
        quantizedColor: color,
        quantizedHex: rgbToHex(color),
      };
    });
    return {
      width: sampled.width,
      height: sampled.height,
      pixels,
      palette: [],
      bitDepth: RGB24_BIT_DEPTH,
      colorMode: "rgb24",
      requestedPhase: sampled.requestedPhase,
    };
  }

  const safeBits = normalizeBitDepth(bitDepth);
  const palette = buildPalette(sampled.pixels, safeBits);
  const pixels = sampled.pixels.map((pixel) => {
    const quantized = quantizeColorToPalette(pixel.sourceColor, palette);
    return {
      ...pixel,
      paletteIndex: quantized.paletteIndex,
      encodedBits: quantized.paletteIndex.toString(2).padStart(safeBits, "0"),
      quantizedColor: quantized.color,
      quantizedHex: quantized.hex,
    };
  });
  return {
    width: sampled.width,
    height: sampled.height,
    pixels,
    palette,
    bitDepth: safeBits,
    colorMode: "palette",
    requestedPhase: sampled.requestedPhase,
  };
}

export function reconstructImage(
  source: RasterImage,
  quantized: QuantizedRepresentation,
): RasterImage {
  const normalized = normalizeImage(source);
  const pixels = Array.from({ length: normalized.width * normalized.height }, (_, index) => {
    const x = index % normalized.width;
    const y = Math.floor(index / normalized.width);
    const sampleX = sampleIndexForSourceCoordinate(
      x,
      quantized.width,
      normalized.width,
      quantized.requestedPhase,
    );
    const sampleY = sampleIndexForSourceCoordinate(
      y,
      quantized.height,
      normalized.height,
      quantized.requestedPhase,
    );
    return (
      quantized.pixels[sampleY * quantized.width + sampleX]?.quantizedColor ?? { r: 0, g: 0, b: 0 }
    );
  });
  return {
    ...normalized,
    id: `${normalized.id}-reconstructed`,
    label: `${normalized.label} · reconstructed`,
    pixels,
  };
}

export function rawPayload(width: number, height: number, bitDepth: number): RawPayload {
  const safeWidth = normalizeCalculatorDimension(width);
  const safeHeight = normalizeCalculatorDimension(height);
  const safeBits = bitDepth === RGB24_BIT_DEPTH ? RGB24_BIT_DEPTH : normalizeBitDepth(bitDepth);
  const bits = safeWidth * safeHeight * safeBits;
  return {
    width: safeWidth,
    height: safeHeight,
    bitDepth: safeBits,
    bits,
    bytes: Math.ceil(bits / 8),
  };
}

export function normalizeImageEncodingFormat(value: unknown): ImageEncodingFormat {
  if (value === "png" || value === "jpeg" || value === "jpg" || value === "webp") {
    return value === "jpg" ? "jpeg" : value;
  }
  return "raw";
}

export function imageFormatLabel(format: ImageEncodingFormat | "jpg"): string {
  return getImageFormatProfile(format).label;
}

export function getImageFormatProfile(format: ImageEncodingFormat | "jpg"): ImageFormatProfile {
  const normalized = normalizeImageEncodingFormat(format);
  return (
    IMAGE_FORMAT_PROFILES.find((profile) => profile.format === normalized) ??
    IMAGE_FORMAT_PROFILES[0]
  );
}

/**
 * Returns a stable classroom estimate, not a browser file size or a codec promise.
 * The simple profile model keeps format comparisons repeatable for the same sampled data.
 */
export function estimateClassroomBytes(
  rawBytes: number,
  pixelCount: number,
  format: ImageEncodingFormat | "jpg",
): number {
  const profile = getImageFormatProfile(format);
  const safeRawBytes = Math.max(0, Math.floor(finiteOr(rawBytes, 0)));
  const safePixelCount = Math.max(0, Math.floor(finiteOr(pixelCount, 0)));
  const overheadBytes = Number.isFinite(profile.pixelsPerOverheadByte)
    ? Math.ceil(safePixelCount / profile.pixelsPerOverheadByte)
    : 0;
  return Math.max(
    1,
    Math.ceil(safeRawBytes * profile.rawByteFactor) + profile.fixedBytes + overheadBytes,
  );
}

export function calculateImageEncoding(
  widthInput: number,
  heightInput: number,
  bitsPerPixelInput: number,
  formatInput: ImageEncodingFormat | "jpg",
): ImageEncodingCalculation {
  const width = normalizeCalculatorDimension(widthInput);
  const height = normalizeCalculatorDimension(heightInput);
  const bitsPerPixel = normalizeCalculatorBitsPerPixel(bitsPerPixelInput);
  const rawBits = width * height * bitsPerPixel;
  const rawBytes = Math.ceil(rawBits / 8);
  const format = normalizeImageEncodingFormat(formatInput);
  return {
    width,
    height,
    bitsPerPixel,
    pixelCount: width * height,
    rawBits,
    rawBytes,
    format,
    formatLabel: imageFormatLabel(format),
    classroomBytes: estimateClassroomBytes(rawBytes, width * height, format),
  };
}

export function deriveImageEncodingModel(
  sourceInput: RasterImage,
  options: ImageEncodingOptions,
): ImageEncodingModel {
  const source = normalizeImage(sourceInput);
  const sampled = sampleImage(source, options);
  const quantized = quantizeSampledImage(sampled, options.bitDepth, options.colorMode);
  const reconstructed = reconstructImage(source, quantized);
  const errorMap = source.pixels.map((sourceColor, index) => {
    const reconstructedColor = reconstructed.pixels[index] ?? { r: 0, g: 0, b: 0 };
    return {
      sourceColor: normalizeRgb(sourceColor),
      reconstructedColor,
      magnitude: colorDistance(sourceColor, reconstructedColor) / Math.sqrt(3 * 255 ** 2),
    };
  });
  const averageError =
    errorMap.reduce((sum, error) => sum + error.magnitude, 0) / Math.max(1, errorMap.length);
  const averageQuantizationError =
    quantized.pixels.reduce(
      (sum, pixel) =>
        sum + colorDistance(pixel.sourceColor, pixel.quantizedColor) / Math.sqrt(3 * 255 ** 2),
      0,
    ) / Math.max(1, quantized.pixels.length);
  return {
    source,
    sampled,
    quantized,
    reconstructed,
    errorMap,
    averageError,
    averageQuantizationError,
    changedPixelCount: errorMap.filter((error) => error.magnitude > 0).length,
    rawPayload: rawPayload(sampled.width, sampled.height, quantized.bitDepth),
  };
}

export function inspectPixel(
  model: ImageEncodingModel,
  sourceXInput: number,
  sourceYInput: number,
): PixelInspection {
  const sourceX = clamp(Math.floor(sourceXInput), 0, model.source.width - 1);
  const sourceY = clamp(Math.floor(sourceYInput), 0, model.source.height - 1);
  const sampleX = sampleIndexForSourceCoordinate(
    sourceX,
    model.sampled.width,
    model.source.width,
    model.quantized.requestedPhase,
  );
  const sampleY = sampleIndexForSourceCoordinate(
    sourceY,
    model.sampled.height,
    model.source.height,
    model.quantized.requestedPhase,
  );
  const sampled = model.sampled.pixels[sampleY * model.sampled.width + sampleX];
  const quantized = model.quantized.pixels[sampleY * model.quantized.width + sampleX];
  const originalColor = model.source.pixels[sourceY * model.source.width + sourceX] ?? {
    r: 0,
    g: 0,
    b: 0,
  };
  return {
    sourceX,
    sourceY,
    sampleX,
    sampleY,
    sampleIndex: quantized?.sampleIndex ?? sampled?.sampleIndex ?? 0,
    originalColor,
    sampledColor: sampled?.sourceColor ?? originalColor,
    paletteIndex: quantized?.paletteIndex ?? 0,
    quantizedColor: quantized?.quantizedColor ?? { r: 0, g: 0, b: 0 },
    encodedBits: quantized?.encodedBits ?? "0".repeat(model.quantized.bitDepth),
    errorMagnitude: model.errorMap[sourceY * model.source.width + sourceX]?.magnitude ?? 0,
  };
}

export function imageFixtureId(source: RasterImage): ImageFixtureId | undefined {
  return source.sourceKind === "fixture" ? (source.id as ImageFixtureId) : undefined;
}
