import type { ImageFixtureId } from "./fixture.ts";
import type { Rect } from "./model.ts";
import type { ColorStop, ResolutionStop } from "./stops.ts";

export type RestorationCase = {
  id: string;
  image: ImageFixtureId;
  resStop: ResolutionStop;
  colorStop: ColorStop;
  asset: string;
  model: string;
  hotspots: readonly Rect[];
  requiredHits: number;
};

export function restorationAssetPath(
  image: ImageFixtureId,
  resStop: ResolutionStop,
  colorStop: ColorStop,
): string {
  return `labs/image-encoding/restored/${image}-${resStop}-${colorStop}.webp`;
}

/**
 * A generated + visually reviewed AI output under `public/`. Separate from
 * `RestorationCase`: an asset may be shown in Challenge 1 before anyone has
 * annotated hallucination hotspots for Challenge 2.
 */
export type RestorationAsset = {
  image: ImageFixtureId;
  resStop: ResolutionStop;
  colorStop: ColorStop;
  asset: string;
  model: string;
};

function restorationAsset(
  image: ImageFixtureId,
  resStop: ResolutionStop,
  colorStop: ColorStop,
  model: string,
): RestorationAsset {
  return {
    image,
    resStop,
    colorStop,
    asset: restorationAssetPath(image, resStop, colorStop),
    model,
  };
}

/**
 * Outputs produced offline by `scripts/restoration/` (Real-ESRGAN ncnn
 * `realesrgan-x4plus`, threads 1:1:1, no TTA) and converted to lossless WebP.
 * The gray8 entries are super-resolved but not yet colorized — DDColor stays
 * out until a separate offline run is reviewed.
 */
export const RESTORATION_ASSETS: readonly RestorationAsset[] = [
  restorationAsset("photo", 50, "gray8", "realesrgan-x4plus"),
  restorationAsset("photo", 50, "palette8", "realesrgan-x4plus"),
  restorationAsset("photo", 25, "rgb24", "realesrgan-x4plus"),
  restorationAsset("photo", 25, "gray8", "realesrgan-x4plus"),
  restorationAsset("photo", 25, "palette8", "realesrgan-x4plus"),
  restorationAsset("photo", 10, "rgb24", "realesrgan-x4plus"),
  restorationAsset("photo", 10, "palette8", "realesrgan-x4plus"),
];

export function getRestorationAsset(
  image: ImageFixtureId,
  resStop: ResolutionStop,
  colorStop: ColorStop,
): RestorationAsset | undefined {
  return RESTORATION_ASSETS.find(
    (entry) => entry.image === image && entry.resStop === resStop && entry.colorStop === colorStop,
  );
}

export const HALLUCINATION_CASES: readonly RestorationCase[] = [];

export function getHallucinationCase(id: string): RestorationCase | undefined {
  return HALLUCINATION_CASES.find((entry) => entry.id === id);
}

export function pointInRect(point: { x: number; y: number }, rect: Rect): boolean {
  return (
    point.x >= rect.x &&
    point.x < rect.x + rect.width &&
    point.y >= rect.y &&
    point.y < rect.y + rect.height
  );
}

export function hotspotHits(
  clicks: readonly { x: number; y: number }[],
  hotspots: readonly Rect[],
): number {
  return hotspots.filter((rect) => clicks.some((click) => pointInRect(click, rect))).length;
}
