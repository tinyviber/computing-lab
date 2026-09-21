/**
 * Procedural silhouette sprites for the image-sampling lab.
 *
 * Each category is a base 64×64 silhouette plus seeded param mutations.
 * Variants differ only in the *position/extent* of boundary bumps and
 * interior holes — never in style — so what separates two members is
 * spatial structure, and shrinking the grid is what erases it.
 *
 * `galleryFor(category, seed, count)` is deterministic and lives in shared
 * domain code: the public lesson gallery uses a published seed; the hidden
 * judge gallery draws extra members from server-only seeds, so the hidden
 * members are not enumerable from the client bundle even though the
 * generator itself is fully inspectable.
 *
 * All drawing is integer rect/ellipse math — no floats, no Math.random.
 */

import { fillEllipse, fillRect, imageToRows, makeImage, type BinaryImage } from "./bitmap.ts";
import { makeRng, rngInt, type Rng } from "./rng.ts";

export const SOURCE_SIZE = 64;

export type CategoryId = "robot" | "invader" | "sigil" | "ridge" | "pillar";

type Params = Record<string, number>;

/** A mutable feature and the ladder of values its mutations draw from. */
type Feature = { key: string; values: number[] };

export type CategoryDef = {
  id: CategoryId;
  name: string;
  /** Short label prefix for members, e.g. "R" → "R-03". */
  labelPrefix: string;
  base: Params;
  features: Feature[];
  render: (p: Params) => BinaryImage;
};

export type GalleryEntry = {
  id: string;
  label: string;
  image: BinaryImage;
};

/* ------------------------------------------------------------------ */
/* robot — filled body + antenna/ear/leg bumps + eye & mouth holes     */
/* ------------------------------------------------------------------ */

const ROBOT_BASE: Params = {
  antH: 8,
  antW: 7,
  antX: 0,
  tipS: 6,
  earD: 5,
  earH: 9,
  eyeDx: 9,
  eyeS: 6,
  mouthW: 8,
  mouthY: 0,
  legW: 7,
  legH: 7,
  gapW: 9,
};

function renderRobot(p: Params): BinaryImage {
  const img = makeImage(SOURCE_SIZE, SOURCE_SIZE);
  // body
  fillRect(img, 16, 20, 48, 56);
  // antenna + tip ball
  const ax = 32 + p.antX;
  fillRect(img, ax - (p.antW >> 1), 20 - p.antH, ax - (p.antW >> 1) + p.antW, 20);
  if (p.tipS > 0) {
    const t = p.tipS >> 1;
    fillRect(img, ax - t, 20 - p.antH - p.tipS, ax - t + p.tipS, 20 - p.antH);
  }
  // ear stubs
  if (p.earD > 0) {
    const ey = 34 - (p.earH >> 1);
    fillRect(img, 16 - p.earD, ey, 16, ey + p.earH);
    fillRect(img, 48, ey, 48 + p.earD, ey + p.earH);
  }
  // legs hanging below the body, with a gap cut between them
  fillRect(img, 20, 56, 20 + p.legW, 56 + p.legH);
  fillRect(img, 44 - p.legW, 56, 44, 56 + p.legH);
  fillRect(img, 32 - (p.gapW >> 1), 56, 32 + (p.gapW >> 1), 56 + p.legH, 0);
  // eye holes
  const es = p.eyeS >> 1;
  fillRect(img, 32 - p.eyeDx - es, 32 - es, 32 - p.eyeDx - es + p.eyeS, 32 - es + p.eyeS, 0);
  fillRect(img, 32 + p.eyeDx - es, 32 - es, 32 + p.eyeDx - es + p.eyeS, 32 - es + p.eyeS, 0);
  // mouth hole
  fillRect(img, 32 - p.mouthW, 42 + p.mouthY, 32 + p.mouthW, 46 + p.mouthY, 0);
  return img;
}

/* ------------------------------------------------------------------ */
/* invader — symmetric blob with arms, tentacle cuts, eye slits        */
/* ------------------------------------------------------------------ */

const INVADER_BASE: Params = {
  rx: 16,
  ry: 18,
  armY: 30,
  armL: 7,
  armH: 7,
  tentD: 9,
  crownW: 11,
  crownH: 7,
  eyeDx: 8,
  eyeW: 7,
  eyeY: 30,
};

function renderInvader(p: Params): BinaryImage {
  const img = makeImage(SOURCE_SIZE, SOURCE_SIZE);
  // body mass + flat bottom
  fillEllipse(img, 32, 34, p.rx, p.ry);
  fillRect(img, 32 - p.rx, 34, 32 + p.rx, 52);
  // crown bump
  fillRect(img, 32 - (p.crownW >> 1), 34 - p.ry - p.crownH, 32 + (p.crownW >> 1), 34 - p.ry + 2);
  // side arms (mirrored)
  const ay = p.armY - (p.armH >> 1);
  fillRect(img, 32 - p.rx - p.armL, ay, 32 - p.rx + 2, ay + p.armH);
  fillRect(img, 32 + p.rx - 2, ay, 32 + p.rx + p.armL, ay + p.armH);
  // tentacle cuts: three slots up from the bottom edge
  for (const tx of [22, 30, 38]) {
    fillRect(img, tx, 52 - p.tentD, tx + 5, 60, 0);
  }
  // eye slits (mirrored horizontal holes)
  fillRect(img, 32 - p.eyeDx - p.eyeW, p.eyeY - 2, 32 - p.eyeDx, p.eyeY + 3, 0);
  fillRect(img, 32 + p.eyeDx, p.eyeY - 2, 32 + p.eyeDx + p.eyeW, p.eyeY + 3, 0);
  return img;
}

/* ------------------------------------------------------------------ */
/* sigil — punch-token plate with a 2×3 grid of cutout slots           */
/* ------------------------------------------------------------------ */

const SIGIL_BASE: Params = {
  s0: 0,
  s1: 0,
  s2: 0,
  s3: 0,
  s4: 0,
  s5: 0,
  tabW: 9,
  tabH: 5,
  notchW: 0,
};

const SLOT_X = [22, 36];
const SLOT_Y = [18, 28, 38];

function renderSigil(p: Params): BinaryImage {
  const img = makeImage(SOURCE_SIZE, SOURCE_SIZE);
  // plate
  fillRect(img, 16, 12, 48, 52);
  // top tab
  fillRect(img, 32 - (p.tabW >> 1), 12 - p.tabH, 32 + (p.tabW >> 1), 12);
  // side notch (right edge)
  if (p.notchW > 0) fillRect(img, 48 - p.notchW, 28, 48, 36, 0);
  // six possible interior slots
  const slots = [p.s0, p.s1, p.s2, p.s3, p.s4, p.s5];
  for (let i = 0; i < 6; i += 1) {
    if (!slots[i]) continue;
    const sx = SLOT_X[i % 2];
    const sy = SLOT_Y[(i / 2) | 0];
    fillRect(img, sx, sy, sx + 8, sy + 7, 0);
  }
  return img;
}

/* ------------------------------------------------------------------ */
/* ridge — wide skyline band; meaningful variation is horizontal        */
/* ------------------------------------------------------------------ */

const RIDGE_BASE: Params = {
  b1x: 12,
  b2x: 28,
  b3x: 44,
  dipX: 0,
};

function renderRidge(p: Params): BinaryImage {
  const img = makeImage(SOURCE_SIZE, SOURCE_SIZE);
  // ground band
  fillRect(img, 6, 42, 58, 60);
  // three skyline bumps — identical height/width, only x positions vary,
  // so identity in this category lives entirely along the x axis.
  fillRect(img, p.b1x, 28, p.b1x + 12, 42);
  fillRect(img, p.b2x, 28, p.b2x + 12, 42);
  fillRect(img, p.b3x, 28, p.b3x + 12, 42);
  // a shallow dip cut into the band
  if (p.dipX > 0) fillRect(img, p.dipX, 42, p.dipX + 6, 47, 0);
  return img;
}

/* ------------------------------------------------------------------ */
/* pillar — tall column; meaningful variation is vertical               */
/* ------------------------------------------------------------------ */

const PILLAR_BASE: Params = {
  capH: 4,
  s1y: 16,
  s2y: 31,
  s3y: 46,
  footH: 3,
};

function renderPillar(p: Params): BinaryImage {
  const img = makeImage(SOURCE_SIZE, SOURCE_SIZE);
  // column + cap + foot
  fillRect(img, 24, 12, 40, 58);
  fillRect(img, 29, 12 - p.capH, 35, 12);
  fillRect(img, 22, 58, 42, 58 + p.footH);
  // Paired hairline slots — two 2px cuts 1px apart. At coarse row counts the
  // pair merges into one smudge and positions collide; only a taller grid
  // resolves them as two separate marks.
  for (const y of [p.s1y, p.s2y, p.s3y]) {
    fillRect(img, 24, y, 40, y + 2, 0);
    fillRect(img, 24, y + 3, 40, y + 5, 0);
  }
  return img;
}

/* ------------------------------------------------------------------ */
/* Registry                                                            */
/* ------------------------------------------------------------------ */

export const CATEGORIES: Record<CategoryId, CategoryDef> = {
  robot: {
    id: "robot",
    name: "机器人",
    labelPrefix: "R",
    base: ROBOT_BASE,
    features: [
      { key: "antH", values: [5, 8, 13] },
      { key: "antW", values: [4, 7, 10] },
      { key: "antX", values: [-10, 0, 10] },
      { key: "tipS", values: [0, 6, 9] },
      { key: "earD", values: [0, 5, 8] },
      { key: "eyeDx", values: [6, 9, 12] },
      { key: "eyeS", values: [5, 6, 8] },
      { key: "mouthW", values: [4, 8, 12] },
      { key: "mouthY", values: [-4, 0, 4] },
      { key: "legW", values: [4, 7, 10] },
      { key: "legH", values: [4, 7, 10] },
      { key: "gapW", values: [5, 9, 14] },
    ],
    render: renderRobot,
  },
  invader: {
    id: "invader",
    name: "异星剪影",
    labelPrefix: "V",
    base: INVADER_BASE,
    features: [
      { key: "rx", values: [13, 16, 19] },
      { key: "ry", values: [15, 18, 21] },
      { key: "armY", values: [24, 30, 36] },
      { key: "armL", values: [3, 7, 11] },
      { key: "armH", values: [5, 7, 10] },
      { key: "tentD", values: [5, 9, 13] },
      { key: "crownW", values: [7, 11, 15] },
      { key: "crownH", values: [4, 7, 10] },
      { key: "eyeDx", values: [5, 8, 11] },
      { key: "eyeW", values: [5, 7, 10] },
      { key: "eyeY", values: [25, 30, 35] },
    ],
    render: renderInvader,
  },
  sigil: {
    id: "sigil",
    name: "打孔印记",
    labelPrefix: "S",
    base: SIGIL_BASE,
    features: [
      { key: "s0", values: [0, 1] },
      { key: "s1", values: [0, 1] },
      { key: "s2", values: [0, 1] },
      { key: "s3", values: [0, 1] },
      { key: "s4", values: [0, 1] },
      { key: "s5", values: [0, 1] },
      { key: "tabW", values: [4, 9, 14] },
      { key: "tabH", values: [2, 5, 8] },
      { key: "notchW", values: [0, 5, 9] },
    ],
    render: renderSigil,
  },
  ridge: {
    id: "ridge",
    name: "山脊",
    labelPrefix: "G",
    base: RIDGE_BASE,
    features: [
      { key: "b1x", values: [8, 11, 14, 17] },
      { key: "b2x", values: [23, 26, 29, 32] },
      { key: "b3x", values: [38, 41, 44, 47] },
      { key: "dipX", values: [0, 16, 34, 52] },
    ],
    render: renderRidge,
  },
  pillar: {
    id: "pillar",
    name: "立柱",
    labelPrefix: "P",
    base: PILLAR_BASE,
    features: [
      { key: "capH", values: [4, 8, 12] },
      { key: "s1y", values: [14, 18, 22, 26] },
      { key: "s2y", values: [26, 30, 34, 38] },
      { key: "s3y", values: [38, 42, 46, 50] },
      { key: "footH", values: [3, 6, 9] },
    ],
    render: renderPillar,
  },
};

/* ------------------------------------------------------------------ */
/* Seeded gallery builder                                              */
/* ------------------------------------------------------------------ */

function signature(image: BinaryImage): string {
  return imageToRows(image).join("/");
}

/**
 * Draw one mutated param set: one feature moved off its base value, a second
 * ~55% of the time, and a third ~20% — keeps variants single-feature-legible
 * while widening the reachable pool enough for a large hidden gallery.
 */
function sampleParams(def: CategoryDef, rng: Rng): Params {
  const params = { ...def.base };
  const mutate = () => {
    const feature = def.features[rng() % def.features.length];
    const options = feature.values.filter((v) => v !== params[feature.key]);
    params[feature.key] = options[rng() % options.length];
  };
  mutate();
  if (rngInt(rng, 0, 99) < 55) mutate();
  if (rngInt(rng, 0, 99) < 20) mutate();
  return params;
}

/**
 * `count` distinct members of a category: member 0 is the base silhouette,
 * the rest are seeded mutations, deduplicated by pixel content (two param
 * sets can rasterize to the same image — those redraw).
 */
export function galleryFor(category: CategoryId, seed: number, count: number): GalleryEntry[] {
  const def = CATEGORIES[category];
  const rng = makeRng(seed);
  const seen = new Set<string>();
  const out: GalleryEntry[] = [];
  const push = (params: Params) => {
    const image = def.render(params);
    const sig = signature(image);
    if (seen.has(sig)) return false;
    seen.add(sig);
    const i = out.length;
    out.push({
      id: `${category}-${i}`,
      label: `${def.labelPrefix}-${String(i).padStart(2, "0")}`,
      image,
    });
    return true;
  };
  push(def.base);
  let guard = count * 40;
  while (out.length < count && guard > 0) {
    guard -= 1;
    push(sampleParams(def, rng));
  }
  if (out.length < count) {
    throw new Error(`gallery exhausted for ${category} (seed ${seed})`);
  }
  return out;
}
