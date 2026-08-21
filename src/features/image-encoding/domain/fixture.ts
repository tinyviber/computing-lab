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

// A small, deterministic local copy of the classroom sample. The source and license
// are recorded in docs/image-encoding-optimization.md; runtime never requests it.
const PHOTO_RGB_BASE64 =
  "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m6u8nK6+o7fIqb3OrMDRr8TVts3evtXlu9Lluc7gwNLjxdfmyNnnyNnmytvoy9voy9vozNzozNrk1d/k3Obp3OPj29/e2dvX1NTJ0dHEz829ysSuycKvxr2rxruqxLakw7Wiwrilw7utwryzv7y3urm2ub6/tL3ClJ6jd3h5i3ZzooB5qIF4rId+sIuCs4+Gq7/Rr8TVssjXtczau9HevdLfwNXhwdbius3as8TSusnXv8/cw9PfxtbjydjmyNjkxtfjyNjl0d3n1t/l2+Xn3eXn3OTl3ePj3N7Z2dnR1tbL0s/By8W1zMSzy72tzLmrzbyxybmwxbauxbeyxcC9wsPDvsXItr/ErLe/mJealHp2nHZsoHpwpH50p4J4q4l/tsrUtMbTuMrav9LewdXdvdHYuMrQtcXKsL7Erbi/sr3GuMTNvsvVw9Ldx9fkxdTgxNPezNvm2OPp2N7h1t7h3ufq3+bm3eTi3eLe3N/b2NnT09LIzsm5zse40sW508G40r64z7+5zL66zMPAzszMzNHUw8zQtL7Br7vDlJCSiGxlj2lgjWZbkGpemHNon350oq2vq7W8s7/JuMjQtMXJqri6n6iomJ6fl56hoKeqqrC1r7e8ucPLwM3YxNLfw9Dbytnl0+Dp2uPo2d7f1dnX2N/h4Ons4Ofn4Ofn3uPf2NrT0dLJ0M/Dz8i81ce+2czG18vI1crH0svJ1dLR1tjaz9fawszPtcHEtMPMoKWqdmRdaUk+aEQ5b0o8e1ZIhGFVk5eWn6amnqepoaytlp6dfIB8aGliYmNdbnFvjZOWoqeqp6yvsbm/u8bQwMvVw9Da0N3n2OLo2ODi2NzZ19jP09HB0tHA1NTF1NTE1tnO1djQ0tXOysrBzMm91s3H2MzI18vH187M19PP2drY1NnaydHSucPEsL6/tcTKtcXOhYSDXEg7Vz0wWz0vZUQ2aUg5lJiThIZ/e3x2j5GMh4iCc3Noa2lcbWxjeXp1kJKRnqGhoKKjqa2xtLzCu8TNws3Yz9zm1uPq2uXn3OTl3uTh3d/V2trK2dnJ293R3uXj4ers3unr09zcys3JzcrE08zH2NLP19PP2trW2dzb0tfWytHQvcfGuMbHu8zQuMnRrLnBgnlzc11PdFhJd1lIeFtJlJaOlJSLlZaOm5yWmZqTmJmRmJiPmZqTmZqVm5yXnp6YoJ+Zp6eksLGytLi9vMXOy9bf0Nrh1t/j2+Lj3+Xl4efn4urs4ezw5O3y5O3x5e/x5O7x4Ovy2eXqzdPTycvG0NHN09TR19nX09fUz9LO1N3e0t/jxtXcvc3VuMfQsLvEkIeCiHFijXJjkXZmknlp";
const photo = makeRasterFromRgb("photo", "小猫照片", 48, 32, PHOTO_RGB_BASE64);

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
