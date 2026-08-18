import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagePath = `${process.cwd()}/src/features/relational-data/ui/RelationalDataPage.tsx`;

describe("Relational Data architecture", () => {
  it("keeps query and constraint semantics out of the UI", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toMatch(/transitionRelationalLesson/);
    expect(source).not.toMatch(
      /function\s+(runRelationalQuery|stepRelational|runRelational|validateRelational)/,
    );
    expect(source).not.toMatch(/SELECT\s+\*/i);
    expect(source).not.toMatch(
      /BitGrid|ExperimentStatus|ParameterControl|FormulaPanel|VisualizationPanel/,
    );
    expect(source).not.toMatch(/submit|check answer|score|setTimeout|setInterval/);
  });
});
