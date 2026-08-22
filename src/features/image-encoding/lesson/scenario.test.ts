import { describe, expect, it } from "vitest";
import { parseImageEncodingScenario, serializeImageEncodingScenario } from "./scenario";

describe("image lesson scenario", () => {
  it("parses canonical shareable source and configuration keys", () => {
    expect(
      parseImageEncodingScenario("image=checkerboard&sample=25&phase=0.5&bits=2&view=error"),
    ).toEqual({
      fixture: "checkerboard",
      samplingPercent: 25,
      phase: 0.5,
      bitDepth: 2,
      view: "error",
      colorMode: "rgb24",
    });
  });

  it("keeps the photo image query as a supported shareable source", () => {
    expect(parseImageEncodingScenario("image=photo&sample=25&bits=8&view=error")).toEqual({
      fixture: "photo",
      samplingPercent: 25,
      phase: 0,
      bitDepth: 8,
      view: "error",
      colorMode: "rgb24",
    });
  });

  it("reads legacy color=palette links as the original RGB24 state", () => {
    const state = parseImageEncodingScenario(
      "image=photo&sample=100&bits=4&color=palette&view=compare",
    );

    expect(state).toMatchObject({
      fixture: "photo",
      samplingPercent: 100,
      bitDepth: 4,
      colorMode: "rgb24",
    });
    expect("samplingChanged" in state).toBe(false);
    expect("colorAdjusted" in state).toBe(false);
    expect("formatSelected" in state).toBe(false);
    expect("calculatorEdited" in state).toBe(false);
  });

  it("defaults to original RGB24 color and does not encode lesson progress", () => {
    const state = parseImageEncodingScenario(
      "image=photo&sample=50&bits=4&samplingChanged=true&colorAdjusted=true&formatSelected=true&progress=4",
    );

    expect(state.colorMode).toBe("rgb24");
    expect("samplingChanged" in state).toBe(false);
    expect("colorAdjusted" in state).toBe(false);
    expect("formatSelected" in state).toBe(false);

    const serialized = serializeImageEncodingScenario(state);
    expect(serialized).not.toContain("color=");
    expect(serialized).not.toMatch(
      /progress|samplingChanged|colorAdjusted|formatSelected|calculatorEdited/,
    );
  });

  it("defaults and clamps malformed values without accepting a workflow state", () => {
    expect(
      parseImageEncodingScenario("image=nope&sample=999&phase=-2&bits=99&view=submit"),
    ).toMatchObject({
      fixture: "photo",
      samplingPercent: 100,
      phase: 0,
      bitDepth: 8,
      view: "compare",
      colorMode: "rgb24",
    });
    expect(parseImageEncodingScenario("sample=abc&bits=2.5")).toMatchObject({
      samplingPercent: 50,
      bitDepth: 4,
      colorMode: "rgb24",
    });
  });

  it("uses first duplicate values and keeps legacy scenario links readable", () => {
    expect(parseImageEncodingScenario("sample=25&sample=80&bits=2&bits=8")).toMatchObject({
      samplingPercent: 25,
      bitDepth: 2,
      colorMode: "rgb24",
    });
    expect(parseImageEncodingScenario("scenario=low-sampling")).toMatchObject({
      fixture: "checkerboard",
      samplingPercent: 25,
      colorMode: "rgb24",
    });
    expect(parseImageEncodingScenario("scenario=high-quantization")).toMatchObject({
      fixture: "gradient",
      samplingPercent: 75,
      bitDepth: 2,
      colorMode: "rgb24",
    });
  });

  it.each([
    ["gradient", "gradient"],
    ["checkerboard", "checkerboard"],
  ] as const)("preserves %s as a compatible fixture query", (query, fixture) => {
    expect(parseImageEncodingScenario(`image=${query}&sample=25&bits=2`)).toMatchObject({
      fixture,
      samplingPercent: 25,
      bitDepth: 2,
      colorMode: "rgb24",
    });
  });

  it("canonicalizes phase from rounded fixture geometry rather than percentage alone", () => {
    expect(parseImageEncodingScenario("image=checkerboard&sample=99&phase=0.8")).toMatchObject({
      fixture: "checkerboard",
      samplingPercent: 99,
      phase: 0,
      colorMode: "rgb24",
    });
    expect(
      serializeImageEncodingScenario({
        fixture: "checkerboard",
        samplingPercent: 99,
        phase: 0.8,
        bitDepth: 4,
        view: "compare",
        colorMode: "rgb24",
      }),
    ).toBe("image=checkerboard&sample=99&phase=0.00&bits=4&view=compare");
  });

  it("serializes only reproducible configuration and omits color state", () => {
    const state = {
      fixture: "gradient" as const,
      samplingPercent: 40,
      phase: 0.25,
      bitDepth: 3,
      view: "representation" as const,
      colorMode: "palette" as const,
    };
    const serialized = serializeImageEncodingScenario(state);
    expect(serialized).toBe("image=gradient&sample=40&phase=0.25&bits=3&view=representation");
    expect(serialized).not.toContain("color=");
    expect(parseImageEncodingScenario(serialized)).toMatchObject({
      ...state,
      colorMode: "rgb24",
    });
  });
});
