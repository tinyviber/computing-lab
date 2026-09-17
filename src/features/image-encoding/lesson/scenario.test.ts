import { describe, expect, it } from "vitest";
import { parseImageEncodingScenario, serializeImageEncodingScenario } from "./scenario";

describe("image restoration scenario", () => {
  it("parses the canonical stage and artifact keys", () => {
    expect(parseImageEncodingScenario("stage=3&image=checkerboard&res=25&colors=gray8")).toEqual({
      stageIndex: 3,
      artifact: { image: "checkerboard", resStop: 25, colorStop: "gray8" },
    });
  });

  it("clamps malformed values at the domain boundary", () => {
    expect(parseImageEncodingScenario("stage=999&image=nope&res=37&colors=nope&case=nope")).toEqual(
      {
        stageIndex: 5,
        artifact: { image: "photo", resStop: 25, colorStop: "palette4" },
      },
    );
    expect(parseImageEncodingScenario("stage=-4&res=abc")).toEqual({
      stageIndex: 1,
      artifact: { image: "photo", resStop: 50, colorStop: "palette4" },
    });
  });

  it("uses the first value when query keys repeat", () => {
    expect(parseImageEncodingScenario("stage=2&stage=5&res=25&res=100&colors=palette2")).toEqual({
      stageIndex: 2,
      artifact: { image: "photo", resStop: 25, colorStop: "palette2" },
    });
  });

  it("maps old sampling, bit-depth, and view links onto the nearest new scenario", () => {
    expect(
      parseImageEncodingScenario("image=gradient&sample=40&bits=8&view=representation"),
    ).toEqual({
      stageIndex: 1,
      artifact: { image: "gradient", resStop: 50, colorStop: "palette8" },
    });
    expect(parseImageEncodingScenario("image=photo&sample=25&color=rgb24&view=error")).toEqual({
      stageIndex: 3,
      artifact: { image: "photo", resStop: 25, colorStop: "rgb24" },
    });
  });

  it("keeps named legacy scenarios readable", () => {
    expect(parseImageEncodingScenario("scenario=low-sampling")).toEqual({
      stageIndex: 1,
      artifact: { image: "checkerboard", resStop: 25, colorStop: "palette4" },
    });
    expect(parseImageEncodingScenario("scenario=high-quantization&bits=2")).toEqual({
      stageIndex: 1,
      artifact: { image: "gradient", resStop: 50, colorStop: "palette2" },
    });
  });

  it("serializes only the reproducible artifact and stage", () => {
    const serialized = serializeImageEncodingScenario({
      stageIndex: 2,
      artifact: { image: "photo", resStop: 10, colorStop: "gray8" },
      caseId: "not-reviewed",
    });
    expect(serialized).toBe("stage=2&image=photo&res=10&colors=gray8");
    expect(parseImageEncodingScenario(serialized)).toEqual({
      stageIndex: 2,
      artifact: { image: "photo", resStop: 10, colorStop: "gray8" },
    });
  });
});
