import { SOURCE_HEIGHT, SOURCE_PIXELS, SOURCE_WIDTH } from "./fixture";

export { SOURCE_COLORS, SOURCE_HEIGHT, SOURCE_PIXELS, SOURCE_WIDTH } from "./fixture";

export type Phase = "ready" | "editing" | "success" | "failure";

export type EncodingOptions = {
  density: number;
  bits: number;
};

export type SampledPixel = {
  row: number;
  col: number;
  sourceRow: number;
  sourceCol: number;
  sourceColor: string;
  sampleIndex: number;
};

export type PixelCell = SampledPixel & {
  paletteIndex: number;
  displayColor: string;
};

export type PaletteEntry = {
  index: number;
  color: string;
};

export type EncodingStats = {
  sampledPixels: number;
  quantizationBits: number;
  paletteLevels: number;
  encodedBits: number;
  encodedBytes: number;
  rawSourceBits: number;
  theoreticalPixelPayloadComparison: number;
};

export type CompressionMetrics = EncodingStats;

export type ImageScenario = "balanced" | "low-sampling" | "high-quantization";

export type ImageScenarioState = {
  scenario: ImageScenario;
  density: number;
  sampling: number;
  bits: number;
};

export const DEFAULT_IMAGE_OPTIONS = { density: 4, bits: 8 } as const;

export const IMAGE_SCENARIO_PRESETS: Record<Exclude<ImageScenario, "balanced">, EncodingOptions> = {
  "low-sampling": { density: 2, bits: 8 },
  "high-quantization": { density: 8, bits: 2 },
};

export const SOURCE_BITS_PER_PIXEL = 24;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function normalizeInteger(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? clamp(Math.round(value), min, max) : min;
}

function normalizeBits(bits: number): number {
  return normalizeInteger(bits, 2, 8);
}

function normalizeDensity(density: number): number {
  return normalizeInteger(density, 2, 8);
}

function firstInteger(params: URLSearchParams, key: string): number | undefined {
  const value = params.get(key);
  if (value === null || value.trim() === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && Number.isInteger(parsed) ? parsed : undefined;
}

export type ImageScenarioSearch = URLSearchParams | string | Record<string, unknown>;

function toParams(input: ImageScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.set(key, String(firstValue));
  }
  return params;
}

/** Parse shareable lesson state: default → preset → first valid explicit value → clamp. */
export function parseImageEncodingScenario(input: ImageScenarioSearch): ImageScenarioState {
  const params = toParams(input);
  const requested = params.get("scenario");
  const scenario: ImageScenario =
    requested === "low-sampling" || requested === "high-quantization" ? requested : "balanced";
  const preset = scenario === "balanced" ? DEFAULT_IMAGE_OPTIONS : IMAGE_SCENARIO_PRESETS[scenario];
  const explicitSampling = firstInteger(params, "sampling");
  const explicitDensity = firstInteger(params, "density");
  const explicitBits = firstInteger(params, "bits");
  const density = normalizeDensity(explicitSampling ?? explicitDensity ?? preset.density);
  const bits = normalizeBits(explicitBits ?? preset.bits);

  return { scenario, density, sampling: density, bits };
}

function parseHex(hex: string): [number, number, number] {
  const normalized = normalizeHex(hex).slice(1);
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function normalizeHex(hex: string): string {
  const raw = hex.replace(/^#/, "");
  const expanded =
    raw.length === 3 ? [...raw].map((channel) => `${channel}${channel}`).join("") : raw;
  return `#${expanded.padEnd(6, "0").slice(0, 6)}`.toUpperCase();
}

function packRgb([red, green, blue]: [number, number, number]): number {
  return (red << 16) | (green << 8) | blue;
}

function luminance([red, green, blue]: [number, number, number]): number {
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function sortedSourceColors(): string[] {
  return [...new Set(SOURCE_PIXELS)].sort((first, second) => {
    const firstRgb = parseHex(first);
    const secondRgb = parseHex(second);
    return luminance(firstRgb) - luminance(secondRgb) || packRgb(firstRgb) - packRgb(secondRgb);
  });
}

/** Build a deterministic indexed palette from the canonical source colors. */
export function buildPalette(bits: number): string[] {
  const colors = sortedSourceColors();
  const requestedLevels = 2 ** normalizeBits(bits);
  const entryCount = Math.min(requestedLevels, colors.length);
  if (entryCount === colors.length) return colors;
  if (entryCount === 1) return [colors[0]];

  return Array.from({ length: entryCount }, (_, index) => {
    const sourceIndex = Math.round((index * (colors.length - 1)) / (entryCount - 1));
    return colors[sourceIndex];
  });
}

export function buildPaletteEntries(bits: number): PaletteEntry[] {
  return buildPalette(bits).map((color, index) => ({ index, color }));
}

function colorDistance(first: [number, number, number], second: [number, number, number]): number {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2 + (first[2] - second[2]) ** 2;
}

export function quantizeColorToPalette(
  hex: string,
  bits: number,
): { paletteIndex: number; displayColor: string } {
  const safeBits = normalizeBits(bits);
  const normalizedHex = normalizeHex(hex);
  const source = parseHex(normalizedHex);
  const palette = buildPalette(safeBits);

  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  palette.forEach((color, index) => {
    const distance = colorDistance(source, parseHex(color));
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  });

  return { paletteIndex: nearestIndex, displayColor: palette[nearestIndex] };
}

/** Quantize a source color to the nearest deterministic indexed palette entry. */
export function quantizeColor(hex: string, bits: number): string {
  return quantizeColorToPalette(hex, bits).displayColor;
}

/** Backward-compatible name for callers from the first lesson prototype. */
export const snapColor = quantizeColor;
export const snapHex = quantizeColor;

function sampleCoordinate(index: number, density: number, sourceSize: number): number {
  return Math.min(sourceSize - 1, Math.floor(((index + 0.5) * sourceSize) / density));
}

/** Return actual center-nearest samples from the canonical 8×8 source image. */
export function sampleImage(density: number): SampledPixel[] {
  const safeDensity = normalizeDensity(density);
  return Array.from({ length: safeDensity * safeDensity }, (_, index) => {
    const row = Math.floor(index / safeDensity);
    const col = index % safeDensity;
    const sourceRow = sampleCoordinate(row, safeDensity, SOURCE_HEIGHT);
    const sourceCol = sampleCoordinate(col, safeDensity, SOURCE_WIDTH);
    return {
      row,
      col,
      sourceRow,
      sourceCol,
      sourceColor: SOURCE_PIXELS[sourceRow * SOURCE_WIDTH + sourceCol],
      sampleIndex: index + 1,
    };
  });
}

export function calculateEncodingStats({ density, bits }: EncodingOptions): EncodingStats {
  const safeDensity = normalizeDensity(density);
  const safeBits = normalizeBits(bits);
  const sampledPixels = safeDensity ** 2;
  const encodedBits = sampledPixels * safeBits;
  const rawSourceBits = SOURCE_WIDTH * SOURCE_HEIGHT * SOURCE_BITS_PER_PIXEL;

  return {
    sampledPixels,
    quantizationBits: safeBits,
    paletteLevels: 2 ** safeBits,
    encodedBits,
    encodedBytes: Math.ceil(encodedBits / 8),
    rawSourceBits,
    theoreticalPixelPayloadComparison: Math.round((rawSourceBits / encodedBits) * 10) / 10,
  };
}

export function calculateMetrics(density: number, bits: number): CompressionMetrics {
  return calculateEncodingStats({ density, bits });
}

export function buildPixelGrid({ density, bits }: EncodingOptions): PixelCell[] {
  const safeBits = normalizeBits(bits);
  return sampleImage(density).map((pixel) => ({
    ...pixel,
    ...quantizeColorToPalette(pixel.sourceColor, safeBits),
  }));
}
