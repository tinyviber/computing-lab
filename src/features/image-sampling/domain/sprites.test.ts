import { describe, expect, it } from "vitest";
import { imageToRows, inkCount } from "./bitmap.ts";
import { galleryFor, CATEGORIES, type CategoryId } from "./sprites.ts";
import { publicGalleryFor } from "./fixtures.ts";
import { judgeResolution } from "./recognize.ts";
import { IMAGE_SAMPLING_STAGES } from "./stages.ts";

const CATEGORY_IDS = Object.keys(CATEGORIES) as CategoryId[];

describe("procedural sprites", () => {
  it.each(CATEGORY_IDS)("%s: same seed → identical gallery", (category) => {
    const a = galleryFor(category, 12345, 6);
    const b = galleryFor(category, 12345, 6);
    expect(a.map((e) => imageToRows(e.image))).toEqual(b.map((e) => imageToRows(e.image)));
  });

  it.each(CATEGORY_IDS)("%s: members are distinct and non-empty at full res", (category) => {
    const gallery = galleryFor(category, 777, 12);
    const signatures = new Set(gallery.map((e) => imageToRows(e.image).join("/")));
    expect(signatures.size).toBe(gallery.length);
    for (const entry of gallery) expect(inkCount(entry.image)).toBeGreaterThan(0);
  });

  it("different seeds draw different hidden members", () => {
    const a = galleryFor("robot", 1, 8).map((e) => imageToRows(e.image).join("/"));
    const b = galleryFor("robot", 2, 8).map((e) => imageToRows(e.image).join("/"));
    expect(a).not.toEqual(b);
  });
});

describe("public gallery vs stage contracts", () => {
  // The stage table must be winnable: each stage's own probe list contains a
  // resolution that already clears the accuracy bar on the *public* gallery.
  // (The hidden superset is asserted server-side where its seed lives.)
  for (const stage of IMAGE_SAMPLING_STAGES) {
    it(`stage ${stage.index} (${stage.id}) has a passing probe on the public gallery`, () => {
      const gallery = publicGalleryFor(stage.category);
      const passing = stage.probes.some((probe) => {
        if (probe.width * probe.height > stage.cellBudget) return false;
        const report = judgeResolution(gallery, gallery, probe.width, probe.height);
        return report.accuracy >= stage.requiredAccuracy;
      });
      expect(passing).toBe(true);
    });
  }
});
