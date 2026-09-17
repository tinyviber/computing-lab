import { describe, expect, it } from "vitest";
import {
  challengeStages,
  coreStages,
  getStage,
  IMAGE_STAGES,
  isStageUnlocked,
  stageCount,
} from "./stages.ts";

describe("image restoration stage contracts", () => {
  it("defines three core stages and two challenges", () => {
    expect(stageCount()).toBe(5);
    expect(coreStages().map((stage) => stage.index)).toEqual([1, 2, 3]);
    expect(challengeStages().map((stage) => stage.index)).toEqual([4, 5]);
    expect(new Set(IMAGE_STAGES.map((stage) => stage.index)).size).toBe(IMAGE_STAGES.length);
  });

  it("carries a playtest time budget on core stages", () => {
    expect(coreStages().map((stage) => stage.timeBudgetMin)).toEqual([8, 12, 12]);
  });

  it("keeps core stages unlocked and gates challenges on all core passes", () => {
    expect(isStageUnlocked([], 1)).toBe(true);
    expect(isStageUnlocked([], 4)).toBe(false);
    expect(isStageUnlocked([1, 2], 5)).toBe(false);
    expect(isStageUnlocked([1, 2, 3], 4)).toBe(true);
    expect(isStageUnlocked([1, 2, 3], 5)).toBe(true);
    expect(isStageUnlocked([1, 2, 3], 99)).toBe(false);
  });

  it("finds stage definitions by index", () => {
    expect(getStage(2)?.id).toBe("budget");
    expect(getStage(5)?.track).toBe("challenge");
    expect(getStage(6)).toBeUndefined();
  });
});
