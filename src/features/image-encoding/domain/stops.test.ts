import { describe, expect, it } from "vitest";
import { getImageFixture } from "./fixture.ts";
import {
  artifactOptions,
  artifactRawBits,
  budgetBits,
  budgetCombos,
  colorStopOptions,
  DEFAULT_BUDGET_RATIO,
  normalizeArtifact,
  stopBitDepth,
} from "./stops.ts";

const photo = getImageFixture("photo");

describe("encoding stops and artifacts", () => {
  it("normalizes malformed artifacts to legal stops", () => {
    expect(normalizeArtifact({ image: "bogus", resStop: 37, colorStop: "weird" })).toEqual({
      image: "photo",
      resStop: 25,
      colorStop: "palette4",
    });
    expect(normalizeArtifact({ resStop: 80 }).resStop).toBe(100);
    expect(normalizeArtifact({ resStop: 4 }).resStop).toBe(10);
  });

  it("maps color stops onto raster-model options", () => {
    expect(colorStopOptions("rgb24")).toEqual({ colorMode: "rgb24", bitDepth: 24 });
    expect(colorStopOptions("gray8")).toEqual({ colorMode: "gray", bitDepth: 8 });
    expect(colorStopOptions("palette2")).toEqual({ colorMode: "palette", bitDepth: 2 });
    expect(stopBitDepth("palette4")).toBe(4);
    expect(stopBitDepth("gray8")).toBe(8);
  });

  it("derives model options with the phase fixed at zero", () => {
    expect(artifactOptions({ image: "photo", resStop: 25, colorStop: "palette2" })).toEqual({
      samplingPercent: 25,
      bitDepth: 2,
      colorMode: "palette",
      phase: 0,
    });
  });

  it("computes the artifact payload from sampled geometry, not display size", () => {
    expect(artifactRawBits(photo, { image: "photo", resStop: 50, colorStop: "palette4" })).toBe(
      120 * 80 * 4,
    );
    expect(artifactRawBits(photo, { image: "photo", resStop: 10, colorStop: "gray8" })).toBe(
      24 * 16 * 8,
    );
  });

  it("sets the budget to one eighth of the source's RGB24 payload", () => {
    expect(budgetBits(photo)).toBe(Math.floor((240 * 160 * 24) / 8));
    expect(budgetBits(photo, 0.25)).toBe(Math.floor(240 * 160 * 24 * 0.25));
  });

  it("enumerates exactly the budget-legal combinations for the classroom photo", () => {
    const combos = budgetCombos(photo);
    const budget = budgetBits(photo);
    expect(combos).toHaveLength(15);
    expect(combos).toContainEqual({ image: "photo", resStop: 100, colorStop: "palette2" });
    expect(combos).toContainEqual({ image: "photo", resStop: 25, colorStop: "rgb24" });
    expect(combos).not.toContainEqual({ image: "photo", resStop: 50, colorStop: "rgb24" });
    for (const combo of combos) {
      expect(artifactRawBits(photo, combo)).toBeLessThanOrEqual(budget);
    }
  });

  it("keeps the budget ratio as a single tunable constant", () => {
    expect(DEFAULT_BUDGET_RATIO).toBe(0.125);
  });
});
