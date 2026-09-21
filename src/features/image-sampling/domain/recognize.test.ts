import { describe, expect, it } from "vitest";
import { imageFromRows } from "./bitmap.ts";
import { chamferSym, hamming } from "./match.ts";
import { confusionPairs, judgeResolution } from "./recognize.ts";
import type { GalleryEntry } from "./sprites.ts";

const entry = (id: string, rows: string[]): GalleryEntry => ({
  id,
  label: id,
  image: imageFromRows(rows),
});

describe("hamming / chamfer", () => {
  it("hamming counts differing cells", () => {
    const a = imageFromRows(["10", "01"]);
    const b = imageFromRows(["11", "01"]);
    expect(hamming(a, b)).toBe(1);
    expect(hamming(a, a)).toBe(0);
  });

  it("chamfer is 0 for identical images and small for shifted ones", () => {
    const a = imageFromRows(["1000", "0000", "0000", "0000"]);
    const b = imageFromRows(["0100", "0000", "0000", "0000"]);
    expect(chamferSym(a, a)).toBe(0);
    expect(chamferSym(a, b)).toBeGreaterThan(0);
  });
});

describe("judgeResolution (closed-set, compressed space)", () => {
  const gallery = [
    entry("a", ["1100", "1100", "0000", "0000"]),
    entry("b", ["0000", "0000", "0011", "0011"]),
    entry("c", ["1010", "0101", "1010", "0101"]),
  ];

  it("identifies every member at full resolution", () => {
    const report = judgeResolution(gallery, gallery, 4, 4);
    expect(report.identified).toBe(3);
    expect(report.accuracy).toBe(1);
  });

  it("a collision marks both members unidentifiable", () => {
    // a and b both compress to all-ones at 2×2? a: top half on → [11,00]... let's compute:
    // a at 2x2: cells TL(2x2 full)=1 TR=0 BL=0 BR=0 → "10/00"
    // b at 2x2: "00/01" ; c at 2x2: every cell half → "11/11"
    const report = judgeResolution(gallery, gallery, 2, 2);
    expect(report.identified).toBe(3);
    // now collide a and b by construction
    const colliding = [
      entry("a", ["1100", "1100", "0000", "0000"]),
      entry("b2", ["1100", "1100", "0000", "0000"]),
    ];
    const report2 = judgeResolution(colliding, colliding, 4, 4);
    expect(report2.identified).toBe(0);
    expect(report2.verdicts[0].collidedWith).toEqual([{ id: "b2", label: "b2" }]);
  });

  it("confusionPairs lists colliding pairs once", () => {
    const colliding = [
      entry("a", ["11", "11"]),
      entry("b", ["11", "11"]),
      entry("c", ["10", "10"]),
    ];
    const pairs = confusionPairs(colliding, 2, 2);
    expect(pairs).toEqual([{ aId: "a", aLabel: "a", bId: "b", bLabel: "b" }]);
  });
});
