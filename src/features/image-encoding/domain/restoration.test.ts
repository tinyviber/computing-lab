import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getHallucinationCase,
  getRestorationAsset,
  HALLUCINATION_CASES,
  RESTORATION_ASSETS,
  hotspotHits,
  pointInRect,
  restorationAssetPath,
} from "./restoration";

describe("restoration cases", () => {
  it("builds the deterministic asset path the offline pipeline writes", () => {
    expect(restorationAssetPath("photo", 50, "palette4")).toBe(
      "labs/image-encoding/restored/photo-50-palette4.webp",
    );
  });

  it("treats hotspot rectangles as half-open", () => {
    const rect = { x: 10, y: 10, width: 20, height: 20 };
    expect(pointInRect({ x: 10, y: 10 }, rect)).toBe(true);
    expect(pointInRect({ x: 29, y: 29 }, rect)).toBe(true);
    expect(pointInRect({ x: 30, y: 10 }, rect)).toBe(false);
    expect(pointInRect({ x: 9, y: 15 }, rect)).toBe(false);
  });

  it("counts each hit hotspot once even with repeated clicks", () => {
    const hotspots = [
      { x: 0, y: 0, width: 10, height: 10 },
      { x: 50, y: 50, width: 10, height: 10 },
    ];
    expect(
      hotspotHits(
        [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 40, y: 40 },
        ],
        hotspots,
      ),
    ).toBe(1);
    expect(
      hotspotHits(
        [
          { x: 1, y: 1 },
          { x: 55, y: 55 },
        ],
        hotspots,
      ),
    ).toBe(2);
    expect(hotspotHits([], hotspots)).toBe(0);
  });

  it("does not claim hallucination cases before generated assets are reviewed", () => {
    expect(HALLUCINATION_CASES).toEqual([]);
    expect(getHallucinationCase("nope")).toBeUndefined();
  });

  it("points every registered restoration asset at a generated file under public/", () => {
    expect(RESTORATION_ASSETS.length).toBeGreaterThan(0);
    for (const entry of RESTORATION_ASSETS) {
      expect(entry.asset).toBe(restorationAssetPath(entry.image, entry.resStop, entry.colorStop));
      expect(existsSync(join(process.cwd(), "public", entry.asset))).toBe(true);
    }
    expect(getRestorationAsset("photo", 25, "palette8")?.model).toBe("realesrgan-x4plus");
    expect(getRestorationAsset("photo", 100, "palette2")).toBeUndefined();
  });
});
