import { describe, expect, it } from "vitest";
import { parseImageEncodingScenario } from "./scenario";

describe("image lesson scenario", () => {
  it("applies default, preset, explicit-first, then clamp precedence", () => {
    expect(parseImageEncodingScenario(new URLSearchParams())).toMatchObject({
      density: 4,
      bits: 8,
    });
    expect(parseImageEncodingScenario(new URLSearchParams("scenario=low-sampling"))).toMatchObject({
      density: 2,
      bits: 8,
    });
    expect(
      parseImageEncodingScenario(new URLSearchParams("scenario=low-sampling&sampling=8&bits=2")),
    ).toMatchObject({ density: 8, bits: 2 });
    expect(parseImageEncodingScenario(new URLSearchParams("sampling=999&bits=-1"))).toMatchObject({
      density: 8,
      bits: 2,
    });
  });

  it("fails closed for unknown, malformed, and missing values; first duplicate wins", () => {
    expect(parseImageEncodingScenario(new URLSearchParams("scenario=nope"))).toMatchObject({
      density: 4,
      bits: 8,
    });
    expect(parseImageEncodingScenario(new URLSearchParams("sampling=abc&bits=1.5"))).toMatchObject({
      density: 4,
      bits: 8,
    });
    expect(
      parseImageEncodingScenario(new URLSearchParams("sampling=2&sampling=8&bits=8&bits=2")),
    ).toMatchObject({ density: 2, bits: 8 });
  });

  it("is deterministic for the same URL state", () => {
    const search = new URLSearchParams("scenario=high-quantization&density=3&bits=7");
    expect(parseImageEncodingScenario(search)).toEqual(parseImageEncodingScenario(search));
  });
});
