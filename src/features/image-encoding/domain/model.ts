import { SOURCE_COLORS } from "./fixture";

export { SOURCE_COLORS } from "./fixture";

export type Phase = "ready" | "editing" | "success" | "failure";

export type PixelCell = {
  row: number;
  col: number;
  sourceColor: string;
  displayColor: string;
  sampleIndex: number;
};

export type CompressionMetrics = {
  sampled: number;
  file: number;
  quality: number;
  error: number;
  ratio: number;
  paletteLevels: number;
};

export type EncodingOptions = {
  density: number;
  bits: number;
};

export type EncodingStats = {
  sampledPixels: number;
  fileSize: number;
  quality: number;
  error: number;
  ratio: number;
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseHex(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function toHex(channel: number): string {
  return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, "0").toUpperCase();
}

export function snapColor(hex: string, bits: number): string {
  const levels = 2 ** clamp(Math.round(bits), 2, 8);
  const step = 255 / (levels - 1);
  const snapped = parseHex(hex).map((channel) => Math.round(Math.round(channel / step) * step));

  return `#${toHex(snapped[0])}${toHex(snapped[1])}${toHex(snapped[2])}`;
}

export const snapHex = snapColor;

export function calculateEncodingStats({ density, bits }: EncodingOptions): EncodingStats {
  const safeDensity = clamp(Math.round(density), 2, 8);
  const safeBits = clamp(Math.round(bits), 2, 8);
  const sampled = safeDensity * safeDensity;
  const file = Math.round(sampled * safeBits * 0.75);
  const quality = clamp(Math.round(50 + safeDensity * 6 + safeBits * 2.25), 0, 100);
  const error = 100 - quality;
  const ratio = file === 0 ? 0 : Math.round((2048 / file) * 10) / 10;

  return {
    sampledPixels: sampled,
    fileSize: file,
    quality,
    error,
    ratio,
  };
}

export function calculateMetrics(density: number, bits: number): CompressionMetrics {
  const stats = calculateEncodingStats({ density, bits });

  return {
    sampled: stats.sampledPixels,
    file: stats.fileSize,
    quality: stats.quality,
    error: stats.error,
    ratio: stats.ratio,
    paletteLevels: 2 ** clamp(Math.round(bits), 2, 8),
  };
}

export function buildPixelGrid({ density, bits }: EncodingOptions): PixelCell[] {
  const sampled = calculateEncodingStats({ density, bits }).sampledPixels;

  return SOURCE_COLORS.map((sourceColor, index) => {
    const row = Math.floor(index / 4);
    const col = index % 4;

    return {
      row,
      col,
      sourceColor,
      displayColor: snapColor(sourceColor, bits),
      sampleIndex: ((row * 4 + col) % sampled) + 1,
    };
  });
}
