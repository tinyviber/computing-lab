import type { RGB, RasterImage } from "./model";

export type ImageFixtureId = "photo" | "gradient" | "checkerboard" | "text-edge" | "pixel-grid";

function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function makeRaster(
  id: ImageFixtureId,
  label: string,
  width: number,
  height: number,
  paint: (x: number, y: number) => RGB,
): RasterImage {
  return {
    id,
    label,
    sourceKind: "fixture",
    width,
    height,
    pixels: Array.from({ length: width * height }, (_, index) => {
      const x = index % width;
      const y = Math.floor(index / width);
      return paint(x, y);
    }),
  };
}

function makeRasterFromRgb(
  id: ImageFixtureId,
  label: string,
  width: number,
  height: number,
  encodedRgb: string,
): RasterImage {
  const decoded = globalThis.atob(encodedRgb);
  const bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  const expectedLength = width * height * 3;
  if (bytes.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} RGB bytes, received ${bytes.length}`);
  }
  return {
    id,
    label,
    sourceKind: "fixture",
    width,
    height,
    pixels: Array.from({ length: width * height }, (_, index) => {
      const offset = index * 3;
      return {
        r: bytes[offset] ?? 0,
        g: bytes[offset + 1] ?? 0,
        b: bytes[offset + 2] ?? 0,
      };
    }),
  };
}

import { PHOTO_RGB_BASE64 } from "./photo-rgb";
// Generated local RGB source, fixed at 240 × 160 for the sampling comparison.
const photo = makeRasterFromRgb("photo", "小猫插图", 240, 160, PHOTO_RGB_BASE64);
const gradient = makeRaster("gradient", "平滑色彩渐变", 48, 32, (x, y) => {
  const horizontal = x / 47;
  const vertical = y / 31;
  return {
    r: clampChannel(25 + horizontal * 220),
    g: clampChannel(65 + vertical * 145),
    b: clampChannel(210 - horizontal * 145 + vertical * 35),
  };
});

const checkerboard = makeRaster("checkerboard", "细棋盘格", 48, 32, (x, y) => {
  const cell = (Math.floor(x / 3) + Math.floor(y / 3)) % 2;
  return cell === 0 ? { r: 245, g: 242, b: 232 } : { r: 27, g: 38, b: 56 };
});

const textEdge = makeRaster("text-edge", "文字与细线边缘", 48, 32, (x, y) => {
  const horizontalLine = y === 6 || y === 7 || y === 24;
  const verticalLine = x === 7 || x === 8 || x === 35;
  const diagonal = Math.abs(y - (x * 0.55 + 9)) < 1.2;
  if (horizontalLine || verticalLine || diagonal) return { r: 28, g: 44, b: 67 };
  if (y > 12 && y < 21 && x > 13 && x < 29 && ((x + y) % 4 === 0 || x % 7 === 0)) {
    return { r: 74, g: 101, b: 136 };
  }
  return { r: 232, g: 237, b: 241 };
});

const pixelGrid = makeRaster("pixel-grid", "像素方格", 16, 16, (x, y) => {
  const colors: RGB[] = [
    { r: 31, g: 78, b: 121 },
    { r: 218, g: 86, b: 74 },
    { r: 242, g: 185, b: 61 },
    { r: 76, g: 157, b: 132 },
  ];
  return colors[(Math.floor(x / 4) + Math.floor(y / 4) * 2) % colors.length];
});

export const IMAGE_FIXTURES: Record<ImageFixtureId, RasterImage> = {
  photo,
  gradient,
  checkerboard,
  "text-edge": textEdge,
  "pixel-grid": pixelGrid,
};

export const IMAGE_FIXTURE_LIST = Object.values(IMAGE_FIXTURES);

export function getImageFixture(id: ImageFixtureId): RasterImage {
  return IMAGE_FIXTURES[id] ?? IMAGE_FIXTURES.photo;
}
