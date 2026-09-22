import { describe, expect, it } from "vitest";
import { makeImage } from "./indexed.ts";
import { SOURCE_COLORS, TONER_RACK } from "./palette.ts";
import {
  countOverrides,
  nnTable,
  quantizeImage,
  sanitizeSubset,
  sanitizeTable,
  usedToners,
} from "./quantize.ts";
import { galleryFor } from "./sprites.ts";
import { judgeMapping, confusionPairs } from "./recognize.ts";

describe("nnTable", () => {
  it("maps anchor colors onto their own toner when the full rack is loaded", () => {
    const table = nnTable([0, 1, 2, 3, 4, 5, 6, 7]);
    // crimson -> red, leaf -> green, azure -> blue, charcoal -> black
    expect(table[0]).toBe(1);
    expect(table[5]).toBe(4);
    expect(table[9]).toBe(6);
    expect(table[12]).toBe(0);
  });

  it("falls back to paper when paper is nearest", () => {
    // With only black loaded, the lightest colors are nearer to paper.
    const table = nnTable([0]);
    expect(table.some((v) => v === -1)).toBe(true);
    // charcoal sits next to black and must stay on it.
    expect(table[12]).toBe(0);
  });

  it("is deterministic and returns one entry per source color", () => {
    const a = nnTable([1, 4, 6]);
    const b = nnTable([1, 4, 6]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(SOURCE_COLORS.length);
  });
});

describe("quantizeImage", () => {
  it("remaps every source cell through the table; paper stays paper", () => {
    const img = makeImage(2, 2);
    img.cells.set([0, 1, 2, 3]);
    const table = new Array(SOURCE_COLORS.length).fill(-1);
    table[0] = 4; // crimson -> green toner
    table[1] = 0; // brick -> black
    // source 3 (tangerine) -> paper
    const out = quantizeImage(img, table);
    expect([...out.cells]).toEqual([0, 5, 1, 0]); // toner idx + 1
  });
});

describe("sanitizers", () => {
  it("sanitizeSubset dedupes, sorts and bounds-checks", () => {
    expect(sanitizeSubset([4, 1, 1, 6])).toEqual([1, 4, 6]);
    expect(sanitizeSubset([])).toEqual([]);
    expect(sanitizeSubset([8])).toBeNull();
    expect(sanitizeSubset([-1])).toBeNull();
    expect(sanitizeSubset("x")).toBeNull();
    expect(sanitizeSubset([1.5])).toBeNull();
  });

  it("sanitizeTable enforces length and range", () => {
    const ok = new Array(SOURCE_COLORS.length).fill(-1);
    expect(sanitizeTable(ok)).toEqual(ok);
    expect(sanitizeTable([...ok.slice(1)])).toBeNull();
    expect(sanitizeTable(ok.map(() => 8))).toBeNull();
    expect(sanitizeTable(ok.map(() => -2))).toBeNull();
    expect(sanitizeTable(null)).toBeNull();
  });
});

describe("usedToners / countOverrides", () => {
  it("counts distinct non-paper targets", () => {
    expect(usedToners([1, 1, -1, 3, 3, 3])).toEqual([1, 3]);
  });
  it("counts differences against a reference table", () => {
    const ref = nnTable([0, 1, 2, 3, 4, 5, 6, 7]);
    const t = ref.slice();
    t[2] = ref[2] === 0 ? 1 : 0;
    expect(countOverrides(t, ref)).toBe(1);
    expect(countOverrides(ref, ref)).toBe(0);
  });
});

describe("galleryFor", () => {
  it("is deterministic per seed and category", () => {
    const a = galleryFor("patrol", 42, 6);
    const b = galleryFor("patrol", 42, 6);
    expect(a.map((e) => e.id)).toEqual(b.map((e) => e.id));
    expect(a.map((e) => JSON.stringify(e.parts))).toEqual(b.map((e) => JSON.stringify(e.parts)));
  });

  it("produces distinct members that share the silhouette", () => {
    const gallery = galleryFor("cargo", 7, 8);
    expect(gallery).toHaveLength(8);
    const keys = new Set(gallery.map((e) => JSON.stringify(e.parts)));
    expect(keys.size).toBe(8);
    // same shape → identical ink footprint regardless of colors
    const mask = (e: (typeof gallery)[number]) =>
      e.image.cells.map((v) => (v === 0 ? 0 : 1)).join("");
    const masks = new Set(gallery.map(mask));
    expect(masks.size).toBe(1);
  });
});

describe("judgeMapping", () => {
  it("flags every member of a colliding pair", () => {
    const gallery = galleryFor("patrol", 0x9e3779, 9);
    // degenerate table: everything -> paper
    const blank = new Array(SOURCE_COLORS.length).fill(-1);
    const report = judgeMapping(gallery, blank);
    expect(report.identified).toBe(0);
    expect(report.verdicts.every((v) => !v.ok)).toBe(true);
  });

  it("the full rack separates the anchor-only training gallery", () => {
    const gallery = galleryFor("cadet", 0x9e3779, 9);
    const report = judgeMapping(gallery, nnTable(TONER_RACK.map((_t, i) => i)));
    expect(report.accuracy).toBe(1);
  });

  it("confusionPairs lists the merged members", () => {
    const gallery = galleryFor("patrol", 0x9e3779, 9);
    const blank = new Array(SOURCE_COLORS.length).fill(-1);
    const pairs = confusionPairs(gallery, blank);
    expect(pairs.length).toBe(9 * 4); // C(9,2)
  });
});
