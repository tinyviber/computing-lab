import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pagePath = `${process.cwd()}/src/features/protocol-process/ui/ProtocolProcessPage.tsx`;

function pageSource(): string {
  return readFileSync(pagePath, "utf8");
}

describe("Protocol Process architecture", () => {
  it("keeps queue transitions and trace semantics out of the UI", () => {
    const source = pageSource();

    expect(source).toMatch(/stepProtocol|transitionProtocolLesson/);
    expect(source).not.toMatch(/function\s+(stepProtocol|runProtocol)|setTimeout|setInterval/);
    expect(source).not.toMatch(/ExperimentStatus|ParameterControl|FormulaPanel|VisualizationPanel/);
    expect(source).not.toMatch(/submit|check answer|score|phase/);
  });
});
