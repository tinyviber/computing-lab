/**
 * Calibration harness for the image-sampling lab.
 *   node scripts/calibrate-sampling.ts
 * Prints, per category, the unique-identification rate of the merged
 * public+hidden gallery across resolutions, so stage budgets and accuracy
 * thresholds are evidence rather than guesses.
 */

import {
  galleryFor,
  CATEGORIES,
  type CategoryId,
  type GalleryEntry,
} from "../src/features/image-sampling/domain/sprites.ts";
import { judgeResolution } from "../src/features/image-sampling/domain/recognize.ts";
import { imageToRows, type BinaryImage } from "../src/features/image-sampling/domain/bitmap.ts";

const PUBLIC_SEED = 0x9e3779;
const HIDDEN_SEED = 0x51f0ab;
const PUBLIC_COUNT = Number(process.env.CAL_PUB ?? 9);
const HIDDEN_EXTRA = Number(process.env.CAL_HID ?? 12);

// Mirror server/judge/image-sampling/hiddenGallery.ts exactly: the hidden
// stream is drawn from HIDDEN_SEED and cross-deduplicated against the public
// set so the judge gallery matches what the server evaluates.
function judgeLikeGallery(category: CategoryId): GalleryEntry[] {
  const pub = galleryFor(category, PUBLIC_SEED, PUBLIC_COUNT);
  const seen = new Set(pub.map((e) => imageToRows(e.image).join("/")));
  const candidates = galleryFor(category, HIDDEN_SEED, HIDDEN_EXTRA * 4);
  const hidden: GalleryEntry[] = [];
  for (const candidate of candidates) {
    const sig = imageToRows(candidate.image).join("/");
    if (seen.has(sig)) continue;
    seen.add(sig);
    hidden.push(candidate);
    if (hidden.length >= HIDDEN_EXTRA) break;
  }
  return [...pub, ...hidden];
}

function sig(img: BinaryImage): string {
  return imageToRows(img).join("/");
}

for (const id of Object.keys(CATEGORIES) as CategoryId[]) {
  const gallery = judgeLikeGallery(id);
  // full-res uniqueness sanity
  const sigs = new Set(gallery.map((e) => sig(e.image)));
  console.log(
    `\n=== ${id} (${gallery.length} members, full-res unique: ${sigs.size === gallery.length}) ===`,
  );
  const square = [4, 6, 8, 10, 12, 16, 20, 24, 32];
  for (const n of square) {
    const r = judgeResolution(gallery, gallery, n, n);
    console.log(
      `  ${n}x${n} (${String(n * n).padStart(4)} cells): ${r.identified}/${r.total} = ${(r.accuracy * 100).toFixed(0)}%`,
    );
  }
  const rect = [
    [16, 6],
    [6, 16],
    [12, 6],
    [6, 12],
    [16, 8],
    [8, 16],
    [24, 8],
    [8, 24],
    [10, 16],
    [16, 10],
    [8, 20],
    [20, 8],
    [12, 20],
    [20, 12],
  ];
  for (const [w, h] of rect) {
    const r = judgeResolution(gallery, gallery, w, h);
    console.log(
      `  ${w}x${h} (${String(w * h).padStart(4)} cells): ${r.identified}/${r.total} = ${(r.accuracy * 100).toFixed(0)}%`,
    );
  }
}
