/**
 * Hidden gallery extension — server-only.
 *
 * The judge evaluates over the public gallery PLUS extra members drawn from
 * this seed. The generator itself is public domain code, but the seed below
 * never ships to the client, so the hidden members cannot be enumerated by
 * inspecting the bundle. Extra draws are deduplicated against the public set
 * — a hidden member identical to a public one would collide at every
 * mapping and make the stage unanswerable.
 */

import { imageSignature } from "../../../src/features/color-quantization/domain/indexed.ts";
import {
  PUBLIC_GALLERY_COUNT,
  PUBLIC_GALLERY_SEED,
} from "../../../src/features/color-quantization/domain/fixtures.ts";
import {
  CATEGORIES,
  galleryFor,
  type CategoryId,
  type GalleryEntry,
} from "../../../src/features/color-quantization/domain/sprites.ts";

export const HIDDEN_GALLERY_SEED = 0x51f0ab;
export const HIDDEN_GALLERY_EXTRA = 11;

const cache = new Map<CategoryId, GalleryEntry[]>();

export function publicGallery(category: CategoryId): GalleryEntry[] {
  return galleryFor(category, PUBLIC_GALLERY_SEED, PUBLIC_GALLERY_COUNT);
}

export function hiddenGallery(category: CategoryId): GalleryEntry[] {
  const seen = new Set(publicGallery(category).map((e) => imageSignature(e.image)));
  const def = CATEGORIES[category];
  // Draw well past the target count: some draws land on an existing
  // (public or earlier hidden) color assignment and get skipped.
  const candidates = galleryFor(category, HIDDEN_GALLERY_SEED, HIDDEN_GALLERY_EXTRA * 5);
  const hidden: GalleryEntry[] = [];
  for (const candidate of candidates) {
    const sig = imageSignature(candidate.image);
    if (seen.has(sig)) continue;
    seen.add(sig);
    hidden.push({
      id: `${category}-h${hidden.length}`,
      label: `${def.labelPrefix}-H${String(hidden.length + 1).padStart(2, "0")}`,
      parts: candidate.parts,
      image: candidate.image,
    });
    if (hidden.length >= HIDDEN_GALLERY_EXTRA) break;
  }
  if (hidden.length < HIDDEN_GALLERY_EXTRA) {
    throw new Error(`hidden gallery exhausted for ${category}`);
  }
  return hidden;
}

/** The full judge gallery: every member is both a query and a candidate. */
export function judgeGalleryFor(category: CategoryId): GalleryEntry[] {
  const hit = cache.get(category);
  if (hit) return hit;
  const gallery = [...publicGallery(category), ...hiddenGallery(category)];
  cache.set(category, gallery);
  return gallery;
}
