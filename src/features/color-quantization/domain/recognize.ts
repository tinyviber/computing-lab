/**
 * Closed-set identification over a gallery of colored sprites.
 *
 * The judge question mirrors the sampling lab: "after this mapping, could a
 * decoder still tell every member apart?" Every member is printed through
 * the same mapping table and compared in *toner space* — the judger never
 * looks at source detail the print no longer contains.
 *
 * Verdict per member:
 *   its print is unique in the gallery      → identified
 *   another member prints identically       → ambiguous, fail
 */

import { imageSignature, imageToBase64, type IndexedImage } from "./indexed.ts";
import { quantizeImage } from "./quantize.ts";
import type { GalleryEntry } from "./sprites.ts";

export type QueryVerdict = {
  queryId: string;
  queryLabel: string;
  ok: boolean;
  /** Members (besides the query itself) whose print is identical. */
  collidedWith: { id: string; label: string }[];
};

export type MappingReport = {
  verdicts: QueryVerdict[];
  /** Fraction of members whose print is unique. */
  accuracy: number;
  identified: number;
  total: number;
};

/**
 * Score a mapping table against a gallery: every member is printed and its
 * print must be unique. Collisions are symmetric — when A and B merge, both
 * count as unidentified.
 */
export function judgeMapping(gallery: GalleryEntry[], table: readonly number[]): MappingReport {
  const printed = gallery.map((entry) => ({
    entry,
    sig: imageSignature(quantizeImage(entry.image, table)),
  }));
  const counts = new Map<string, number>();
  for (const p of printed) counts.set(p.sig, (counts.get(p.sig) ?? 0) + 1);
  const verdicts = printed.map(({ entry, sig }) => {
    const collidedWith =
      (counts.get(sig) ?? 0) > 1
        ? printed
            .filter((p) => p.sig === sig && p.entry.id !== entry.id)
            .map((p) => ({ id: p.entry.id, label: p.entry.label }))
        : [];
    return {
      queryId: entry.id,
      queryLabel: entry.label,
      ok: collidedWith.length === 0,
      collidedWith,
    };
  });
  const identified = verdicts.filter((v) => v.ok).length;
  return {
    verdicts,
    accuracy: verdicts.length ? identified / verdicts.length : 0,
    identified,
    total: verdicts.length,
  };
}

/** Pairs of gallery members whose prints are identical — the confusion set. */
export function confusionPairs(
  gallery: GalleryEntry[],
  table: readonly number[],
): { aId: string; aLabel: string; bId: string; bLabel: string }[] {
  const printed = gallery.map((entry) => ({
    entry,
    sig: imageSignature(quantizeImage(entry.image, table)),
  }));
  const pairs: { aId: string; aLabel: string; bId: string; bLabel: string }[] = [];
  for (let i = 0; i < printed.length; i += 1) {
    for (let j = i + 1; j < printed.length; j += 1) {
      if (printed[i].sig === printed[j].sig) {
        pairs.push({
          aId: printed[i].entry.id,
          aLabel: printed[i].entry.label,
          bId: printed[j].entry.id,
          bLabel: printed[j].entry.label,
        });
      }
    }
  }
  return pairs;
}

/**
 * Serialisable form of a failing case for the judge payload: the source
 * artwork and the printed result for the query plus one member it collides
 * with — concrete evidence of what the mapping destroyed.
 */
export function encodeVerdictDetail(
  query: GalleryEntry,
  collided: GalleryEntry | null,
  table: readonly number[],
  verdict: QueryVerdict,
) {
  const pack = (entry: GalleryEntry) => {
    const printed: IndexedImage = quantizeImage(entry.image, table);
    return {
      id: entry.id,
      label: entry.label,
      source: {
        width: entry.image.width,
        height: entry.image.height,
        b64: imageToBase64(entry.image),
      },
      printed: { width: printed.width, height: printed.height, b64: imageToBase64(printed) },
    };
  };
  return {
    query: pack(query),
    collided: collided ? pack(collided) : null,
    collidedWith: verdict.collidedWith,
  };
}
