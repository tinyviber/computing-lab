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

const photo = makeRaster("photo", "彩色采样练习图", 48, 32, (x, y) => {
  const horizontal = x / 47;
  const vertical = y / 31;
  let color: RGB = {
    r: clampChannel(28 + horizontal * 94 + vertical * 32),
    g: clampChannel(76 + vertical * 88 + horizontal * 18),
    b: clampChannel(164 - horizontal * 54 + vertical * 35),
  };

  const coralBlock = x >= 3 && x <= 21 && y >= 3 && y <= 15;
  if (coralBlock) {
    const shade = (x - 3) / 18;
    color = {
      r: clampChannel(238 - shade * 24),
      g: clampChannel(58 + shade * 32),
      b: clampChannel(63 + shade * 12),
    };
  }

  const tealBlock = x >= 29 && x <= 44 && y >= 4 && y <= 19;
  if (tealBlock) {
    color = { r: 15, g: 178, b: 164 };
  }

  const diagonalWedge = x >= 20 && y >= 0.55 * (x - 20) + 7 && y <= 27;
  if (diagonalWedge) {
    color = { r: 35, g: 57, b: 132 };
  }

  const circle = (x - 13) ** 2 + (y - 23) ** 2 <= 38;
  if (circle) {
    color = { r: 250, g: 202, b: 36 };
  }

  const circleOutline = (x - 37) ** 2 + (y - 23) ** 2 >= 20 && (x - 37) ** 2 + (y - 23) ** 2 <= 29;
  if (circleOutline) {
    color = { r: 248, g: 241, b: 211 };
  }

  const fineTexture = x >= 30 && x <= 44 && y >= 25 && y <= 29 && (x + y) % 2 === 0;
  if (fineTexture) {
    color = { r: 246, g: 113, b: 38 };
  }

  return color;
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
