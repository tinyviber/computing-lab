import { describe, expect, it } from "vitest";
import { getImageFixture, FIXTURE_TARGET_REGIONS } from "./fixture";
import {
  checkChallenge2,
  checkCore1,
  checkCore2,
  checkCore3,
  core3Window,
  CORE3_MIN_DIFF_PIXELS,
} from "./checks";
import type { RGB, RasterImage } from "./model";
import { budgetCombos, type Artifact } from "./stops";
import type { RestorationCase } from "./restoration";

function makeRaster(
  id: string,
  width: number,
  height: number,
  paint: (x: number, y: number) => RGB,
): RasterImage {
  return {
    id,
    label: id,
    sourceKind: "upload",
    width,
    height,
    pixels: Array.from({ length: width * height }, (_, index) =>
      paint(index % width, Math.floor(index / width)),
    ),
  };
}

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

function signPhoto(): RasterImage {
  const target = FIXTURE_TARGET_REGIONS.photo;
  return makeRaster("sign", 240, 160, (x, y) =>
    x >= target.x && x < target.x + target.width && y >= target.y && y < target.y + target.height
      ? BLACK
      : WHITE,
  );
}

function flickerPhoto(): RasterImage {
  const target = FIXTURE_TARGET_REGIONS.photo;
  return makeRaster("flicker", 240, 160, (x, y) => {
    const inside =
      x >= target.x && x < target.x + target.width && y >= target.y && y < target.y + target.height;
    return inside && (x + y) % 2 === 0 ? BLACK : WHITE;
  });
}

describe("checkCore1", () => {
  const expected = "0111010101011001";

  it("passes only on an exact bit-for-bit match", () => {
    expect(checkCore1({ studentBits: expected, expectedBits: expected }).passed).toBe(true);
    expect(checkCore1({ studentBits: ` ${expected} `, expectedBits: expected }).passed).toBe(true);
  });

  it("points at the first wrong bit", () => {
    const result = checkCore1({ studentBits: "0110010101101001", expectedBits: expected });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("第 4 位");
  });

  it("reports how many bits are still missing", () => {
    const result = checkCore1({ studentBits: "0111", expectedBits: expected });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("还差 12 位");
  });
});

describe("checkCore2", () => {
  const artifact: Artifact = { image: "photo", resStop: 50, colorStop: "palette4" };

  it("passes an in-budget artifact whose target region stays recognizable", () => {
    const result = checkCore2({ source: signPhoto(), artifact });
    expect(result.passed).toBe(true);
  });

  it("fails an artifact over budget before even looking at the picture", () => {
    const result = checkCore2({
      source: signPhoto(),
      artifact: { image: "photo", resStop: 100, colorStop: "rgb24" },
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("超出预算");
  });

  it("fails an in-budget artifact whose target region is unreadable", () => {
    const result = checkCore2({ source: flickerPhoto(), artifact });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("目标区域");
  });

  it("offers multiple passing and failing strategies on the current classroom photo", () => {
    const photo = getImageFixture("photo");
    const results = budgetCombos(photo).map((candidate) => ({
      candidate,
      result: checkCore2({ source: photo, artifact: candidate }),
    }));
    expect(results.filter(({ result }) => result.passed).length).toBeGreaterThanOrEqual(3);
    expect(results.filter(({ result }) => !result.passed).length).toBeGreaterThanOrEqual(3);
    expect(
      results.some(({ candidate, result }) => candidate.colorStop === "gray8" && result.passed),
    ).toBe(true);
    expect(
      results.some(({ candidate, result }) => candidate.colorStop === "palette2" && !result.passed),
    ).toBe(true);
  });
});

describe("checkCore3", () => {
  function withEdits(
    base: RasterImage,
    edits: { x: number; y: number; color: RGB }[],
  ): RasterImage {
    const pixels = base.pixels.slice();
    for (const edit of edits) {
      pixels[edit.y * base.width + edit.x] = edit.color;
    }
    return { ...base, pixels };
  }

  // The edit window sits at the fixture target region; signatures must be
  // computed by patching the window back into the FULL source, because the
  // sampling grid is defined on the full image (240×160 photo → window at
  // global (112,56)).
  const uniformSource = makeRaster("full", 240, 160, () => ({ r: 10, g: 10, b: 10 }));
  const photoArtifact: Artifact = { image: "photo", resStop: 50, colorStop: "palette4" };

  it("passes when many pixels changed but the encoding did not", () => {
    const { original } = core3Window(uniformSource, photoArtifact);
    const edits = Array.from({ length: CORE3_MIN_DIFF_PIXELS }, (_, i) => ({
      x: (i * 2) % 16,
      y: 0,
      color: { r: 250, g: 250, b: 250 },
    }));
    const result = checkCore3({
      source: uniformSource,
      artifact: photoArtifact,
      original,
      edited: withEdits(original, edits),
    });
    expect(result.passed).toBe(true);
  });

  it("rejects an edit that reaches a kept pixel", () => {
    const { original } = core3Window(uniformSource, photoArtifact);
    const result = checkCore3({
      source: uniformSource,
      artifact: photoArtifact,
      original,
      edited: withEdits(original, [{ x: 1, y: 1, color: { r: 250, g: 250, b: 250 } }]),
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("编码变了");
  });

  it("uses the full-image sampling grid, not a re-derived crop grid", () => {
    // At 10% the full 240×160 grid samples global x ∈ {5,15,25,…}; inside the
    // window (x offset 112) that means local x ∈ {3,13} and local y = 9.
    // Encoding the 16×16 crop standalone would sample local {4,12} instead and
    // wrongly call this edit invisible.
    const lowArtifact: Artifact = { image: "photo", resStop: 10, colorStop: "rgb24" };
    const { original } = core3Window(uniformSource, lowArtifact);
    const result = checkCore3({
      source: uniformSource,
      artifact: lowArtifact,
      original,
      edited: withEdits(original, [{ x: 3, y: 9, color: { r: 250, g: 250, b: 250 } }]),
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("编码变了");
  });

  it("accepts color collisions too — quantization is also many-to-one", () => {
    const splitSource = makeRaster("split", 240, 160, (x) =>
      x < 120 ? { r: 10, g: 10, b: 10 } : { r: 245, g: 245, b: 245 },
    );
    const artifact: Artifact = { image: "photo", resStop: 100, colorStop: "palette2" };
    const { original } = core3Window(splitSource, artifact);
    const edits = Array.from({ length: CORE3_MIN_DIFF_PIXELS }, (_, i) => ({
      x: i,
      y: 0,
      color: { r: 30, g: 30, b: 30 }, // still maps to the dark palette entry
    }));
    const result = checkCore3({
      source: splitSource,
      artifact,
      original,
      edited: withEdits(original, edits),
    });
    expect(result.passed).toBe(true);
  });

  it("asks for a bolder edit below the diff threshold", () => {
    const { original } = core3Window(uniformSource, photoArtifact);
    const result = checkCore3({
      source: uniformSource,
      artifact: photoArtifact,
      original,
      edited: withEdits(original, [{ x: 0, y: 0, color: { r: 250, g: 250, b: 250 } }]),
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("至少改 8 个");
  });

  it("rejects an unchanged image before computing anything else", () => {
    const { original } = core3Window(uniformSource, photoArtifact);
    const result = checkCore3({
      source: uniformSource,
      artifact: photoArtifact,
      original,
      edited: original,
    });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("还没有改动");
  });
});

describe("checkChallenge2", () => {
  const restorationCase: RestorationCase = {
    id: "test-case",
    image: "photo",
    resStop: 50,
    colorStop: "palette4",
    asset: "x.webp",
    model: "test",
    hotspots: [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 50, y: 50, width: 10, height: 10 },
    ],
    requiredHits: 1,
  };

  it("passes once enough hotspots are found", () => {
    expect(checkChallenge2({ restorationCase, clicks: [{ x: 5, y: 5 }] }).passed).toBe(true);
  });

  it("fails on a miss and on too few hits", () => {
    expect(checkChallenge2({ restorationCase, clicks: [{ x: 30, y: 30 }] }).passed).toBe(false);
    const strict = { ...restorationCase, requiredHits: 2 };
    const result = checkChallenge2({ restorationCase: strict, clicks: [{ x: 5, y: 5 }] });
    expect(result.passed).toBe(false);
    expect(result.detail).toContain("还需要 1 处");
  });
});

describe("core3Window", () => {
  it("crops a 16×16 window centered on the target region", () => {
    const photo = getImageFixture("photo");
    const { original, region } = core3Window(photo, {
      image: "photo",
      resStop: 50,
      colorStop: "palette4",
    });
    expect(region).toEqual({ x: 112, y: 56, width: 16, height: 16 });
    expect(original.width).toBe(16);
    expect(original.pixels[0]).toEqual(photo.pixels[56 * 240 + 112]);
  });

  it("clamps the window for small sources", () => {
    const grid = getImageFixture("pixel-grid");
    const { region } = core3Window(grid, { image: "pixel-grid", resStop: 50, colorStop: "gray8" });
    expect(region).toEqual({ x: 0, y: 0, width: 16, height: 16 });
  });
});
