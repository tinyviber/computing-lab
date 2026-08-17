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
};

export type SampledPixel = {
  sampleX: number;
  sampleY: number;
  sampleIndex: number;
  sourceX: number;
  sourceY: number;
  sourceColor: RGB;
};

export type SampledRepresentation = {
  width: number;
  height: number;
  pixels: readonly SampledPixel[];
  samplingPercent: number;
  phase: number;
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
  phase: number;
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

export type ImageEncodingModel = {
  source: RasterImage;
  sampled: SampledRepresentation;
  quantized: QuantizedRepresentation;
  reconstructed: RasterImage;
  errorMap: readonly PixelError[];
  averageError: number;
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
export const MIN_PHASE = 0;
export const MAX_PHASE = 0.99;

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

export function normalizePhase(value: number): number {
  return clamp(finiteOr(value, 0), MIN_PHASE, MAX_PHASE);
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
  return colorKey(first).localeCompare(colorKey(second));
}

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

function sampleSourceCoordinate(
  index: number,
  sampledSize: number,
  sourceSize: number,
  phase: number,
): number {
  const position = ((index + 0.5 + normalizePhase(phase)) / sampledSize) * sourceSize;
  return Math.min(sourceSize - 1, Math.max(0, Math.floor(position)));
}

function sampleIndexForSourceCoordinate(
  coordinate: number,
  sampledSize: number,
  sourceSize: number,
  phase: number,
): number {
  const position = (coordinate / sourceSize) * sampledSize - normalizePhase(phase);
  return Math.min(sampledSize - 1, Math.max(0, Math.floor(position)));
}

export function sampleImage(
  sourceInput: RasterImage,
  options: Pick<ImageEncodingOptions, "samplingPercent" | "phase">,
): SampledRepresentation {
  const source = normalizeImage(sourceInput);
  const { width, height } = sampledDimensions(source, options.samplingPercent);
  const phase = normalizePhase(options.phase);
  const pixels = Array.from({ length: width * height }, (_, index) => {
    const sampleY = Math.floor(index / width);
    const sampleX = index % width;
    const sourceX = sampleSourceCoordinate(sampleX, width, source.width, phase);
    const sourceY = sampleSourceCoordinate(sampleY, height, source.height, phase);
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
    samplingPercent: normalizeSamplingPercent(options.samplingPercent),
    phase,
  };
}

export function buildPalette(
  sampledPixels: readonly SampledPixel[],
  bitDepth: number,
): PaletteEntry[] {
  const safeBits = normalizeBitDepth(bitDepth);
  const unique = [
    ...new Map(
      sampledPixels.map((pixel) => [colorKey(pixel.sourceColor), pixel.sourceColor]),
    ).values(),
  ]
    .map(normalizeRgb)
    .sort(colorOrder);
  const count = Math.max(1, Math.min(2 ** safeBits, unique.length || 1));
  const colors =
    count === unique.length
      ? unique
      : Array.from(
          { length: count },
          (_, index) => unique[Math.round((index * (unique.length - 1)) / Math.max(1, count - 1))],
        );
  return colors.map((color, index) => ({ index, color, hex: rgbToHex(color) }));
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
): QuantizedRepresentation {
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
    phase: sampled.phase,
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
      quantized.phase,
    );
    const sampleY = sampleIndexForSourceCoordinate(
      y,
      quantized.height,
      normalized.height,
      quantized.phase,
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
  const safeBits = normalizeBitDepth(bitDepth);
  const bits = Math.max(1, Math.floor(width)) * Math.max(1, Math.floor(height)) * safeBits;
  return { width, height, bitDepth: safeBits, bits, bytes: Math.ceil(bits / 8) };
}

export function deriveImageEncodingModel(
  sourceInput: RasterImage,
  options: ImageEncodingOptions,
): ImageEncodingModel {
  const source = normalizeImage(sourceInput);
  const sampled = sampleImage(source, options);
  const quantized = quantizeSampledImage(sampled, options.bitDepth);
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
  return {
    source,
    sampled,
    quantized,
    reconstructed,
    errorMap,
    averageError,
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
    model.quantized.phase,
  );
  const sampleY = sampleIndexForSourceCoordinate(
    sourceY,
    model.sampled.height,
    model.source.height,
    model.quantized.phase,
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
