/**
 * Public gallery fixture. The 9-member public set is generated client- and
 * server-side from a published seed — students explore on it; the judge adds
 * extra members drawn from server-only seeds (server/judge/image-sampling),
 * so submissions must generalise beyond what is visible.
 */

import { imageToRows } from "./bitmap.ts";
import { galleryFor, type CategoryId, type GalleryEntry } from "./sprites.ts";

export const PUBLIC_GALLERY_SEED = 0x9e3779;
export const PUBLIC_GALLERY_COUNT = 9;

const cache = new Map<CategoryId, GalleryEntry[]>();

export function publicGalleryFor(category: CategoryId): GalleryEntry[] {
  const hit = cache.get(category);
  if (hit) return hit;
  const gallery = galleryFor(category, PUBLIC_GALLERY_SEED, PUBLIC_GALLERY_COUNT);
  cache.set(category, gallery);
  return gallery;
}

/** Full-resolution content signature — used to keep hidden members distinct. */
export function gallerySignature(entry: GalleryEntry): string {
  return imageToRows(entry.image).join("/");
}
