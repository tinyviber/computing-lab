import { describe, expect, it } from "vitest";
import { clampDigit, DEMO_STEPS, FIVE_PARTS, STEP_COUNT, sum } from "./demo.ts";
import { FIVE_PARTS_STAGES, fivePartsStageUnlocked, nextFivePartsStage } from "./stages.ts";

describe("five-parts demo model", () => {
  it("has exactly five parts and four walkthrough steps after idle", () => {
    expect(FIVE_PARTS).toHaveLength(5);
    expect(FIVE_PARTS.map((p) => p.id)).toEqual(["input", "memory", "controller", "alu", "output"]);
    expect(STEP_COUNT).toBe(4);
    expect(DEMO_STEPS[0].highlight).toBeNull();
    expect(DEMO_STEPS[3].highlight).toBe("alu");
    expect(DEMO_STEPS[4].highlight).toBe("output");
  });

  it("clamps inputs to single digits", () => {
    expect(clampDigit(3)).toBe(3);
    expect(clampDigit(-4)).toBe(0);
    expect(clampDigit(42)).toBe(9);
    expect(clampDigit("7")).toBe(7);
    expect(clampDigit(Number.NaN)).toBe(0);
    expect(clampDigit(undefined)).toBe(0);
  });

  it("sums two digits", () => {
    expect(sum(3, 5)).toBe(8);
    expect(sum(9, 9)).toBe(18);
  });
});

describe("five-parts stages", () => {
  it("keeps the spec's first two pages, then storage and phone", () => {
    expect(FIVE_PARTS_STAGES.map((s) => s.id)).toEqual(["observe", "think", "storage", "phone"]);
    expect(FIVE_PARTS_STAGES.map((s) => s.index)).toEqual([1, 2, 3, 4]);
    expect(FIVE_PARTS_STAGES[0].title).toBe("让计算机把两个数字相加");
    expect(FIVE_PARTS_STAGES[1].question?.prompt).toBe(
      "如果运算器只负责计算，那么是谁指挥它进行加法的？",
    );
  });

  it("opens every later page once the observation is recorded — questions never gate", () => {
    expect(fivePartsStageUnlocked([], 1)).toBe(true);
    for (const index of [2, 3, 4]) {
      expect(fivePartsStageUnlocked([], index)).toBe(false);
      expect(fivePartsStageUnlocked([1], index)).toBe(true);
    }
    expect(fivePartsStageUnlocked([1], 5)).toBe(false);
    expect(nextFivePartsStage([])).toBe(1);
    expect(nextFivePartsStage([1, 3])).toBe(2);
    expect(nextFivePartsStage([1, 2, 3, 4])).toBe(5);
  });

  it("ships questions without a readable correct flag or verdict copy", () => {
    const questions = FIVE_PARTS_STAGES.flatMap((s) => (s.question ? [s.question] : []));
    expect(questions).toHaveLength(3);
    for (const question of questions) {
      for (const option of question.options) {
        expect(Object.keys(option).sort()).toEqual(["id", "label"]);
      }
    }
    expect(JSON.stringify(FIVE_PARTS_STAGES)).not.toMatch(/正确|correct/);
  });
});
