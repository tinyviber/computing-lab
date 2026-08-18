import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagePath = `${process.cwd()}/src/features/monte-carlo/ui/MonteCarloPage.tsx`;

describe("Monte Carlo architecture", () => {
  it("keeps sampling and estimate semantics out of the UI", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toMatch(/transitionMonteCarloLesson/);
    expect(source).not.toMatch(/function\s+(nextSample|stepMonteCarlo|runMonteCarlo)/);
    expect(source).not.toMatch(/Math\.random/);
    expect(source).not.toMatch(
      /BitGrid|ExperimentStatus|ParameterControl|FormulaPanel|VisualizationPanel/,
    );
    expect(source).not.toMatch(/submit|check answer|score|setTimeout|setInterval/);
  });
});
