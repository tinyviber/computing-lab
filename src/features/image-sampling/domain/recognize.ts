/**
 * Closed-set identification over a gallery of silhouettes.
 *
 * The judge question is the honest inverse problem: "which gallery member
 * compresses to exactly this grid?" Every candidate is downsampled with the
 * same fixed rule and compared in the *compressed* space — the judger never
 * looks at source detail that the encoding no longer contains.
 *
 * Verdict per query:
 *   unique exact match (only its own entry collides)  → identified
 *   any other member shares the compressed grid        → ambiguous, fail
 * Chamfer distance ranks the near-miss list shown to the student; it never
 * decides pass/fail.
 */

import { imageToBase64, type BinaryImage } from "./bitmap.ts";
import { downsample } from "./downsample.ts";
import { chamferSym, hamming } from "./match.ts";
import type { GalleryEntry } from "./sprites.ts";

export type CandidateDistance = { id: string; label: string; distance: number };

export type QueryVerdict = {
  queryId: string;
  queryLabel: string;
  ok: boolean;
  /** Nearest gallery member by chamfer — display only. */
  predictedId: string;
  predictedLabel: string;
  /** Members (besides the query itself) whose compressed grid is identical. */
  collidedWith: { id: string; label: string }[];
  /** Closest few candidates by chamfer, for the UI's near-miss list. */
  ranking: CandidateDistance[];
};

export type ResolutionReport = {
  width: number;
  height: number;
  cells: number;
  verdicts: QueryVerdict[];
  /** Fraction of queries uniquely identifiable at this resolution. */
  accuracy: number;
  identified: number;
  total: number;
};

const RANK_DISPLAY = 4;

function compareQuery(
  queryCompressed: BinaryImage,
  query: GalleryEntry,
  compressedGallery: { entry: GalleryEntry; image: BinaryImage }[],
): QueryVerdict {
  const collidedWith: { id: string; label: string }[] = [];
  const distances: CandidateDistance[] = [];
  let predicted = compressedGallery[0].entry;
  let best = Infinity;
  for (const { entry, image } of compressedGallery) {
    if (hamming(queryCompressed, image) === 0 && entry.id !== query.id) {
      collidedWith.push({ id: entry.id, label: entry.label });
    }
    const distance = chamferSym(queryCompressed, image);
    distances.push({ id: entry.id, label: entry.label, distance });
    if (distance < best) {
      best = distance;
      predicted = entry;
    }
  }
  distances.sort((a, b) => a.distance - b.distance || (a.id < b.id ? -1 : 1));
  return {
    queryId: query.id,
    queryLabel: query.label,
    ok: collidedWith.length === 0,
    predictedId: predicted.id,
    predictedLabel: predicted.label,
    collidedWith,
    ranking: distances.slice(0, RANK_DISPLAY),
  };
}

/**
 * Score a resolution against a gallery: each query is compressed and must be
 * the *unique* member producing that grid. Queries are gallery members, so
 * the self-match is guaranteed; a pass means nobody else collides.
 */
export function judgeResolution(
  gallery: GalleryEntry[],
  queries: GalleryEntry[],
  width: number,
  height: number,
): ResolutionReport {
  const compressedGallery = gallery.map((entry) => ({
    entry,
    image: downsample(entry.image, width, height),
  }));
  const verdicts = queries.map((query) =>
    compareQuery(downsample(query.image, width, height), query, compressedGallery),
  );
  const identified = verdicts.filter((v) => v.ok).length;
  return {
    width,
    height,
    cells: width * height,
    verdicts,
    accuracy: verdicts.length ? identified / verdicts.length : 0,
    identified,
    total: verdicts.length,
  };
}

/** Pairs of gallery members that become identical at (w,h) — the confusion set. */
export function confusionPairs(
  gallery: GalleryEntry[],
  width: number,
  height: number,
): { aId: string; aLabel: string; bId: string; bLabel: string }[] {
  const compressed = gallery.map((entry) => ({
    entry,
    image: downsample(entry.image, width, height),
  }));
  const pairs: { aId: string; aLabel: string; bId: string; bLabel: string }[] = [];
  for (let i = 0; i < compressed.length; i += 1) {
    for (let j = i + 1; j < compressed.length; j += 1) {
      if (hamming(compressed[i].image, compressed[j].image) === 0) {
        pairs.push({
          aId: compressed[i].entry.id,
          aLabel: compressed[i].entry.label,
          bId: compressed[j].entry.id,
          bLabel: compressed[j].entry.label,
        });
      }
    }
  }
  return pairs;
}

/** Whole-gallery accuracy for each resolution in `resolutions` (sweep view). */
export function sweepResolutions(
  gallery: GalleryEntry[],
  resolutions: { width: number; height: number }[],
): { width: number; height: number; cells: number; accuracy: number; collisions: number }[] {
  return resolutions.map(({ width, height }) => {
    const report = judgeResolution(gallery, gallery, width, height);
    return {
      width,
      height,
      cells: width * height,
      accuracy: report.accuracy,
      collisions: report.total - report.identified,
    };
  });
}

/** Serialisable form of a verdict's failing case for the judge payload. */
export function encodeVerdictDetail(
  query: GalleryEntry,
  predicted: GalleryEntry | null,
  width: number,
  height: number,
  verdict: QueryVerdict,
) {
  const pack = (entry: GalleryEntry) => {
    const small = downsample(entry.image, width, height);
    return {
      id: entry.id,
      label: entry.label,
      full: {
        width: entry.image.width,
        height: entry.image.height,
        b64: imageToBase64(entry.image),
      },
      small: { width: small.width, height: small.height, b64: imageToBase64(small) },
    };
  };
  return {
    query: pack(query),
    predicted: predicted ? pack(predicted) : null,
    ranking: verdict.ranking,
    collidedWith: verdict.collidedWith,
  };
}
