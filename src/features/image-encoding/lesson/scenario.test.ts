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
    });
  });

  it("keeps the photo image query as a supported shareable source", () => {
    expect(parseImageEncodingScenario("image=photo&sample=25&bits=8&view=error")).toEqual({
      fixture: "photo",
      samplingPercent: 25,
      phase: 0,
      bitDepth: 8,
      view: "error",
    });
  });

  it("round-trips the original-color mode without changing palette bit depth", () => {
    const state = parseImageEncodingScenario(
      "image=photo&sample=100&bits=4&color=rgb24&view=compare",
    );
    expect(state).toMatchObject({
      fixture: "photo",
      samplingPercent: 100,
      bitDepth: 4,
      colorMode: "rgb24",
    });
    expect(serializeImageEncodingScenario(state)).toBe(
      "image=photo&sample=100&phase=0.00&bits=4&color=rgb24&view=compare",
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
    });
    expect(parseImageEncodingScenario("sample=abc&bits=2.5")).toMatchObject({
      samplingPercent: 50,
      bitDepth: 4,
    });
  });

  it("uses first duplicate values and keeps legacy scenario links readable", () => {
    expect(parseImageEncodingScenario("sample=25&sample=80&bits=2&bits=8")).toMatchObject({
      samplingPercent: 25,
      bitDepth: 2,
    });
    expect(parseImageEncodingScenario("scenario=low-sampling")).toMatchObject({
      fixture: "checkerboard",
      samplingPercent: 25,
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
    });
  });

  it("canonicalizes phase from rounded fixture geometry rather than percentage alone", () => {
    expect(parseImageEncodingScenario("image=checkerboard&sample=99&phase=0.8")).toMatchObject({
      fixture: "checkerboard",
      samplingPercent: 99,
      phase: 0,
    });
    expect(
      serializeImageEncodingScenario({
        fixture: "checkerboard",
        samplingPercent: 99,
        phase: 0.8,
        bitDepth: 4,
        view: "compare",
      }),
    ).toBe("image=checkerboard&sample=99&phase=0.00&bits=4&view=compare");
  });

  it("serializes only reproducible configuration", () => {
    const state = {
      fixture: "gradient" as const,
      samplingPercent: 40,
      phase: 0.25,
      bitDepth: 3,
      view: "representation" as const,
    };
    expect(serializeImageEncodingScenario(state)).toBe(
      "image=gradient&sample=40&phase=0.25&bits=3&view=representation",
    );
    expect(parseImageEncodingScenario(serializeImageEncodingScenario(state))).toEqual(state);
  });
});
