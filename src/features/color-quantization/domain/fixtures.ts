/**
 * Public gallery fixtures: the lesson shows a fixed, fully inspectable set
 * of members per category. The judge additionally draws hidden members from
 * server-only seeds — the generator and the whole variant pool are public,
 * so a mapping that memorizes the public nine does not generalize.
 */

import { galleryFor, type CategoryId, type GalleryEntry } from "./sprites.ts";

export const PUBLIC_GALLERY_SEED = 0x9e3779;
export const PUBLIC_GALLERY_COUNT = 9;

const cache = new Map<CategoryId, GalleryEntry[]>();

export function publicGalleryFor(category: CategoryId): GalleryEntry[] {
  let gallery = cache.get(category);
  if (!gallery) {
    gallery = galleryFor(category, PUBLIC_GALLERY_SEED, PUBLIC_GALLERY_COUNT);
    cache.set(category, gallery);
  }
  return gallery;
}
