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

const photo = makeRaster("photo", "受控彩色场景（非照片）", 48, 32, (x, y) => {
  const horizon = Math.floor(13 + Math.sin(x / 8) * 2);
  if (y < horizon) {
    const t = y / Math.max(1, horizon);
    return {
      r: clampChannel(40 + 60 * t),
      g: clampChannel(120 + 80 * t),
      b: clampChannel(190 + 55 * t),
    };
  }
  if (y > 25) {
    const t = (y - 25) / 7;
    return {
      r: clampChannel(35 + 28 * t),
      g: clampChannel(74 + 30 * t),
      b: clampChannel(58 + 22 * t),
    };
  }
  const building = x > 8 && x < 25 && y > 12 && y < 27;
  const tower = x > 30 && x < 42 && y > 8 && y < 27;
  if (building || tower) {
    const wall = (x + y) % 5 === 0;
    return wall ? { r: 233, g: 190, b: 115 } : { r: 167, g: 104, b: 70 };
  }
  const tree = (x - 5) ** 2 + (y - 19) ** 2 < 40 || (x - 44) ** 2 + (y - 18) ** 2 < 35;
  if (tree)
    return {
      r: 28 + ((x * 7 + y * 3) % 35),
      g: 92 + ((x * 5 + y * 9) % 75),
      b: 55 + ((x + y) % 28),
    };
  return { r: 104, g: 132, b: 122 };
});

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

const pixelGrid = makeRaster("pixel-grid", "可追踪像素图", 16, 16, (x, y) => {
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
