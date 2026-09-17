import type { RGB } from "./model.ts";

export const BIT_CANVAS_SIZE = 8;
export const BIT_CANVAS_BITS_PER_PIXEL = 2;
export const BIT_CANVAS_SYMBOLS = 4;

export type ConventionTable = {
  id: string;
  label: string;
  colors: readonly RGB[];
};

export const BIT_CANVAS_TABLES: Record<"gray" | "color", ConventionTable> = {
  gray: {
    id: "gray",
    label: "约定 A · 灰阶",
    colors: [
      { r: 255, g: 255, b: 255 },
      { r: 170, g: 170, b: 170 },
      { r: 85, g: 85, b: 85 },
      { r: 0, g: 0, b: 0 },
    ],
  },
  color: {
    id: "color",
    label: "约定 B · 彩色",
    colors: [
      { r: 255, g: 255, b: 255 },
      { r: 224, g: 68, b: 68 },
      { r: 40, g: 100, b: 216 },
      { r: 246, g: 190, b: 60 },
    ],
  },
};

export const DEFAULT_CONVENTION: ConventionTable = BIT_CANVAS_TABLES.gray;

export const BIT_CANVAS_CELLS: readonly number[] = [
  "00000000",
  "01100110",
  "13111121",
  "11111111",
  "01111110",
  "00111100",
  "00011000",
  "00000000",
]
  .join("")
  .split("")
  .map(Number);

export const BIT_CANVAS_EDIT_ROW = 2;

function clampSymbol(value: number): number {
  return Math.max(0, Math.min(BIT_CANVAS_SYMBOLS - 1, Math.floor(value)));
}

function cellAt(cells: readonly number[], x: number, y: number): number {
  return clampSymbol(cells[y * BIT_CANVAS_SIZE + x] ?? 0);
}

function symbolBits(symbol: number): string {
  return clampSymbol(symbol).toString(2).padStart(BIT_CANVAS_BITS_PER_PIXEL, "0");
}

export function encodeCells(cells: readonly number[]): string {
  return Array.from({ length: BIT_CANVAS_SIZE * BIT_CANVAS_SIZE }, (_, index) =>
    symbolBits(cells[index] ?? 0),
  ).join("");
}

export function encodeRow(cells: readonly number[], row: number): string {
  const safeRow = Math.max(0, Math.min(BIT_CANVAS_SIZE - 1, Math.floor(row)));
  return Array.from({ length: BIT_CANVAS_SIZE }, (_, x) =>
    symbolBits(cellAt(cells, x, safeRow)),
  ).join("");
}

export function decodeBits(bits: string, table: ConventionTable): RGB[] {
  const colors: RGB[] = [];
  for (let offset = 0; offset + BIT_CANVAS_BITS_PER_PIXEL <= bits.length; offset += 2) {
    const symbol = Number.parseInt(bits.slice(offset, offset + BIT_CANVAS_BITS_PER_PIXEL), 2);
    colors.push(table.colors[clampSymbol(Number.isFinite(symbol) ? symbol : 0)]);
  }
  return colors;
}
