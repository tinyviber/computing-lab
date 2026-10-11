import { describe, expect, it } from "vitest";
import { CPU_STAGES } from "./stages.ts";
import { seedFor, shuffledIndices } from "./rng.ts";

describe("shuffled option indices", () => {
  it("is stable for a seed and preserves every option index", () => {
    const order = shuffledIndices(5, 1234);
    expect(shuffledIndices(5, 1234)).toEqual(order);
    expect([...order].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("spreads the first correct answer across the guided prompts", () => {
    const prompts = CPU_STAGES.flatMap((stage) =>
      (stage.guided?.prompts ?? []).map((prompt) => ({ stage, prompt })),
    );
    const correctPositions = prompts.map(({ stage, prompt }) => {
      const correctIndex = prompt.options.findIndex((option) => option.correct === true);
      const order = shuffledIndices(
        prompt.options.length,
        seedFor("student-1", `cpu-prompt-${prompt.id}`, stage.index),
      );
      return order.indexOf(correctIndex);
    });

    expect(prompts).toHaveLength(28);
    expect(new Set(correctPositions).size).toBeGreaterThan(1);
  });
});
