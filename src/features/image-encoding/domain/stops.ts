import { getImageFixture, type ImageFixtureId } from "./fixture.ts";
import {
  normalizeSamplingPercent,
  rawPayload,
  sampledDimensions,
  type ImageColorMode,
  type ImageEncodingOptions,
  type RasterImage,
} from "./model.ts";

export const RESOLUTION_STOPS = [100, 50, 25, 10] as const;
export type ResolutionStop = (typeof RESOLUTION_STOPS)[number];

export const COLOR_STOPS = ["rgb24", "gray8", "palette8", "palette4", "palette2"] as const;
export type ColorStop = (typeof COLOR_STOPS)[number];

export type Artifact = {
  image: ImageFixtureId;
  resStop: ResolutionStop;
  colorStop: ColorStop;
};

export const DEFAULT_BUDGET_RATIO = 0.125;

export function stopBitDepth(colorStop: ColorStop): number {
  switch (colorStop) {
    case "rgb24":
      return 24;
    case "gray8":
    case "palette8":
      return 8;
    case "palette4":
      return 4;
    case "palette2":
      return 2;
  }
}

export function colorStopOptions(colorStop: ColorStop): {
  colorMode: ImageColorMode;
  bitDepth: number;
} {
  switch (colorStop) {
    case "rgb24":
      return { colorMode: "rgb24", bitDepth: 24 };
    case "gray8":
      return { colorMode: "gray", bitDepth: 8 };
    case "palette8":
      return { colorMode: "palette", bitDepth: 8 };
    case "palette4":
      return { colorMode: "palette", bitDepth: 4 };
    case "palette2":
      return { colorMode: "palette", bitDepth: 2 };
  }
}

export function normalizeColorStop(value: unknown): ColorStop {
  return (COLOR_STOPS as readonly string[]).includes(String(value))
    ? (value as ColorStop)
    : "palette4";
}

function nearestResolutionStop(value: number): ResolutionStop {
  const percent = normalizeSamplingPercent(value);
  let best: ResolutionStop = RESOLUTION_STOPS[0];
  for (const stop of RESOLUTION_STOPS) {
    if (Math.abs(stop - percent) < Math.abs(best - percent)) best = stop;
  }
  return best;
}

export function normalizeArtifact(input: {
  image?: unknown;
  resStop?: unknown;
  colorStop?: unknown;
}): Artifact {
  const image = getImageFixture(input.image as ImageFixtureId).id as ImageFixtureId;
  const requested = Number(input.resStop);
  return {
    image,
    resStop: nearestResolutionStop(Number.isFinite(requested) ? requested : 50),
    colorStop: normalizeColorStop(input.colorStop),
  };
}

export function artifactOptions(artifact: Artifact): ImageEncodingOptions {
  const { colorMode, bitDepth } = colorStopOptions(artifact.colorStop);
  return {
    samplingPercent: artifact.resStop,
    bitDepth,
    colorMode,
    phase: 0,
  };
}

export function artifactRawBits(source: RasterImage, artifact: Artifact): number {
  const { width, height } = sampledDimensions(source, artifact.resStop);
  return rawPayload(width, height, stopBitDepth(artifact.colorStop)).bits;
}

export function budgetBits(source: RasterImage, ratio = DEFAULT_BUDGET_RATIO): number {
  const baseline = rawPayload(source.width, source.height, 24).bits;
  return Math.floor(baseline * ratio);
}

export function budgetCombos(source: RasterImage, ratio = DEFAULT_BUDGET_RATIO): Artifact[] {
  const budget = budgetBits(source, ratio);
  const image = source.id as ImageFixtureId;
  const combos: Artifact[] = [];
  for (const resStop of RESOLUTION_STOPS) {
    for (const colorStop of COLOR_STOPS) {
      const artifact: Artifact = { image, resStop, colorStop };
      if (artifactRawBits(source, artifact) <= budget) combos.push(artifact);
    }
  }
  return combos;
}
