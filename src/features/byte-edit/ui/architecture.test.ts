import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagePath = `${process.cwd()}/src/features/byte-edit/ui/ByteEditPage.tsx`;

describe("Byte Edit architecture", () => {
  it("keeps decoding and edit semantics out of the UI", () => {
    const source = readFileSync(pagePath, "utf8");
    expect(source).toMatch(/transitionByteEditLesson/);
    expect(source).not.toMatch(/function\s+(decodeUtf8|stepByteEdit)/);
    expect(source).not.toMatch(/TextEncoder|new TextDecoder/);
    expect(source).not.toMatch(
      /BitGrid|ExperimentStatus|ParameterControl|FormulaPanel|VisualizationPanel/,
    );
    expect(source).not.toMatch(/submit|check answer|score|setTimeout|setInterval/);
  });
});
