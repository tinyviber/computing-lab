import { describe, expect, it } from "vitest";
import * as model from "./model";

type Callable = (...args: unknown[]) => unknown;

function scenarioParser(): Callable {
  const candidate = (model as Record<string, unknown>).parseImageEncodingScenario;
  expect(typeof candidate).toBe("function");
  return candidate as Callable;
}

describe("image encoding scenario contract", () => {
  it("applies default, preset, explicit-first, then clamp precedence", () => {
    const parse = scenarioParser();

    expect(parse(new URLSearchParams())).toMatchObject({ density: 4, bits: 8 });
    expect(parse(new URLSearchParams("scenario=low-sampling"))).toMatchObject({
      density: 2,
      bits: 8,
    });
    expect(parse(new URLSearchParams("scenario=low-sampling&sampling=8&bits=2"))).toMatchObject({
      density: 8,
      bits: 2,
    });
    expect(parse(new URLSearchParams("sampling=999&bits=-1"))).toMatchObject({
      density: 8,
      bits: 2,
    });
  });

  it("uses defaults for unknown, malformed, and missing values; first duplicate wins", () => {
    const parse = scenarioParser();

    expect(parse(new URLSearchParams("scenario=nope"))).toMatchObject({ density: 4, bits: 8 });
    expect(parse(new URLSearchParams("sampling=abc&bits=1.5"))).toMatchObject({
      density: 4,
      bits: 8,
    });
    expect(parse(new URLSearchParams("sampling=2&sampling=8&bits=8&bits=2"))).toMatchObject({
      density: 2,
      bits: 8,
    });
  });
});
