/**
 * Procedural colored sprites for the color-quantization lab.
 *
 * Unlike the sampling lab — where identity lives in geometry — every member
 * of a category here shares the *same shape*; they differ only in which
 * source ink color each part is painted. Identity is therefore purely a
 * color assignment, and quantizing colors is exactly what can erase it.
 *
 * `galleryFor(category, seed, count)` is deterministic and lives in shared
 * domain code: the public lesson gallery uses a published seed; the hidden
 * judge gallery draws extra members from server-only seeds, so hidden
 * members are not enumerable from the client bundle even though the whole
 * variant pool (part color axes) is inspectable.
 *
 * All drawing is integer rect math — no floats, no Math.random.
 */

import { fillRect, imageSignature, makeImage, type IndexedImage } from "./indexed.ts";
import { makeRng, type Rng } from "./rng.ts";

export const SOURCE_SIZE = 64;

export type CategoryId = "cadet" | "patrol" | "cargo" | "recon";

/** The six paintable parts of the robot figure. */
export const PART_NAMES = ["body", "tip", "ear", "leg", "eye", "mouth"] as const;
export type PartName = (typeof PART_NAMES)[number];

/** A full color assignment: part name -> source palette index (1..14). */
export type Parts = Record<PartName, number>;

/** One mutation axis: a part and the source-color indices it may take. */
export type ColorAxis = { part: PartName; options: number[] };

export type CategoryDef = {
  id: CategoryId;
  name: string;
  /** Short label prefix for members, e.g. "P" → "P-03". */
  labelPrefix: string;
  base: Parts;
  axes: ColorAxis[];
};

export type GalleryEntry = {
  id: string;
  label: string;
  parts: Parts;
  image: IndexedImage;
};

/* ------------------------------------------------------------------ */
/* robot geometry — same silhouette as the sampling lab's robot, but   */
/* each semantic part is filled with its own palette index             */
/* ------------------------------------------------------------------ */

function renderRobot(c: Parts): IndexedImage {
  const img = makeImage(SOURCE_SIZE, SOURCE_SIZE);
  const antH = 8,
    antW = 7,
    tipS = 6,
    earD = 5,
    earH = 9,
    eyeDx = 9,
    eyeS = 6,
    mouthW = 8,
    legW = 7,
    legH = 7;
  // body + antenna stem share the body color
  fillRect(img, 16, 20, 48, 56, c.body);
  const ax = 32;
  fillRect(img, ax - (antW >> 1), 20 - antH, ax - (antW >> 1) + antW, 20, c.body);
  // tip ball
  const t = tipS >> 1;
  fillRect(img, ax - t, 20 - antH - tipS, ax - t + tipS, 20 - antH, c.tip);
  // ear stubs
  const ey = 34 - (earH >> 1);
  fillRect(img, 16 - earD, ey, 16, ey + earH, c.ear);
  fillRect(img, 48, ey, 48 + earD, ey + earH, c.ear);
  // legs
  fillRect(img, 20, 56, 20 + legW, 56 + legH, c.leg);
  fillRect(img, 44 - legW, 56, 44, 56 + legH, c.leg);
  // eyes
  const es = eyeS >> 1;
  fillRect(img, 32 - eyeDx - es, 32 - es, 32 - eyeDx - es + eyeS, 32 - es + eyeS, c.eye);
  fillRect(img, 32 + eyeDx - es, 32 - es, 32 + eyeDx - es + eyeS, 32 - es + eyeS, c.eye);
  // mouth
  fillRect(img, 32 - mouthW, 42, 32 + mouthW, 46, c.mouth);
  return img;
}

/* ------------------------------------------------------------------ */
/* Categories: same figure, different color-variant pools. Axis options */
/* are source palette indices (1-based). Designs calibrated in          */
/* scripts/calibrate-quantization.ts.                                   */
/* ------------------------------------------------------------------ */

const BASE: Parts = { body: 1, tip: 9, ear: 11, leg: 13, eye: 4, mouth: 6 };

/** Base assignment for the training category — all anchor colors. */
const CADET_BASE: Parts = { body: 1, tip: 5, ear: 11, leg: 13, eye: 3, mouth: 8 };

/**
 * cadet — every axis option is an anchor color sitting squarely on one
 * toner, and no two options on an axis share an anchor. With the full rack
 * loaded every option maps to its own toner, so identity survives
 * trivially; the warm-up stage is about the pipeline, not the puzzle.
 */
const CADET_AXES: ColorAxis[] = [
  { part: "body", options: [1, 6, 10] },
  { part: "tip", options: [5, 8, 13] },
  { part: "ear", options: [11, 3, 6] },
  { part: "leg", options: [13, 10, 1] },
  { part: "eye", options: [3, 11, 5] },
  { part: "mouth", options: [8, 1, 6] },
];

/** patrol — every conflicting color pair is separable inside {R,O,G,B}. */
const PATROL_AXES: ColorAxis[] = [
  { part: "body", options: [1, 2, 6, 10] },
  { part: "tip", options: [3, 6, 10] },
  { part: "ear", options: [12, 5, 14] },
  { part: "leg", options: [13, 9, 2] },
  { part: "eye", options: [4, 8, 6, 1] },
  { part: "mouth", options: [7, 5, 12] },
];

/** cargo — separations are spread over all 8 toners; no 4-slot subset covers them. */
const CARGO_AXES: ColorAxis[] = [
  { part: "body", options: [1, 2, 6, 10] },
  { part: "tip", options: [9, 10, 5] },
  { part: "ear", options: [11, 7, 14] },
  { part: "leg", options: [13, 14, 2] },
  { part: "eye", options: [4, 5, 12] },
  { part: "mouth", options: [6, 7] },
];

/**
 * recon — the ear axis pits violet against wine, which only separate when
 * magenta is *not* loaded (violet falls back to blue, wine to red). Loading
 * every plausible toner actively loses.
 */
const RECON_AXES: ColorAxis[] = [
  { part: "body", options: [1, 6, 10] },
  { part: "tip", options: [3, 6, 10] },
  { part: "ear", options: [11, 12] },
  { part: "leg", options: [13, 9, 2] },
  { part: "eye", options: [4, 8, 1] },
  { part: "mouth", options: [7, 5, 12] },
];

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  cadet: {
    id: "cadet",
    name: "训练机器人",
    labelPrefix: "T",
    base: CADET_BASE,
    axes: CADET_AXES,
  },
  patrol: {
    id: "patrol",
    name: "巡逻机器人",
    labelPrefix: "P",
    base: BASE,
    axes: PATROL_AXES,
  },
  cargo: {
    id: "cargo",
    name: "货运机器人",
    labelPrefix: "C",
    base: BASE,
    axes: CARGO_AXES,
  },
  recon: {
    id: "recon",
    name: "侦察机器人",
    labelPrefix: "R",
    base: BASE,
    axes: RECON_AXES,
  },
};

/* ------------------------------------------------------------------ */
/* Seeded gallery builder                                              */
/* ------------------------------------------------------------------ */

function partsKey(p: Parts): string {
  return PART_NAMES.map((n) => p[n]).join(",");
}

/**
 * Draw one mutated color assignment: one axis moved off its base value, a
 * second ~60% of the time, and a third ~30% — keeps variants legible while
 * widening the reachable pool enough for a large hidden gallery.
 */
function sampleParts(def: CategoryDef, rng: Rng): Parts {
  const parts = { ...def.base };
  const mutate = () => {
    const axis = def.axes[rng() % def.axes.length];
    const options = axis.options.filter((v) => v !== parts[axis.part]);
    if (options.length) parts[axis.part] = options[rng() % options.length];
  };
  mutate();
  if (rng() % 100 < 60) mutate();
  if (rng() % 100 < 30) mutate();
  return parts;
}

/**
 * `count` distinct members of a category: member 0 is the base assignment,
 * the rest are seeded mutations, deduplicated by color assignment (two
 * assignments render identically iff their part colors match).
 */
export function galleryFor(category: CategoryId, seed: number, count: number): GalleryEntry[] {
  const def = CATEGORIES[category];
  const rng = makeRng(seed);
  const seen = new Set<string>();
  const out: GalleryEntry[] = [];
  const push = (parts: Parts) => {
    const key = partsKey(parts);
    if (seen.has(key)) return false;
    seen.add(key);
    const i = out.length;
    out.push({
      id: `${category}-${i}`,
      label: `${def.labelPrefix}-${String(i).padStart(2, "0")}`,
      parts: { ...parts },
      image: renderRobot(parts),
    });
    return true;
  };
  push(def.base);
  let guard = count * 60;
  while (out.length < count && guard > 0) {
    guard -= 1;
    push(sampleParts(def, rng));
  }
  if (out.length < count) {
    throw new Error(`gallery exhausted for ${category} (seed ${seed})`);
  }
  return out;
}

/** Fast identity signature: the part-color tuple (equivalent to pixels here). */
export function partsSignature(entry: GalleryEntry): string {
  return imageSignature(entry.image);
}
