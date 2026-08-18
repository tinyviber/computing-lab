import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  `${process.cwd()}/src/features/program-execution/ui/ProgramExecutionPage.tsx`,
  "utf8",
);

describe("Program Execution UI boundary", () => {
  it("projects domain evidence without becoming a second executor", () => {
    expect(pageSource).not.toMatch(/evaluateExpression|stepProgram|runProgram/);
    expect(pageSource).not.toMatch(/Math\.(random|floor|round)|while\s*\(/);
    expect(pageSource).not.toMatch(
      /ExperimentStatus|ParameterControl|FormulaPanel|VisualizationPanel/,
    );
    expect(pageSource).not.toMatch(/<textarea|contentEditable|onKeyDown=.*parse/);
  });
});
