import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagePath = `${process.cwd()}/src/features/utf8/ui/Utf8Page.tsx`;

describe("UTF-8 architecture", () => {
  it("keeps encoding and frame semantics out of the UI", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toMatch(/transitionUtf8Lesson/);
    expect(source).not.toMatch(/function\s+(encodeCodePoint|stepUtf8|runUtf8)/);
    expect(source).not.toMatch(
      /BitGrid|ExperimentStatus|ParameterControl|FormulaPanel|VisualizationPanel/,
    );
    expect(source).not.toMatch(/submit|check answer|score|setTimeout|setInterval/);
  });
});
