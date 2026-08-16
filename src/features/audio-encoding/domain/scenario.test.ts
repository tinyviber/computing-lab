import { describe, expect, it } from "vitest";
import * as model from "./model";

type Callable = (...args: unknown[]) => unknown;

function scenarioParser(): Callable {
  const candidate = (model as Record<string, unknown>).parseAudioEncodingScenario;
  expect(typeof candidate).toBe("function");
  return candidate as Callable;
}

describe("audio encoding scenario contract", () => {
  it("applies default, preset, explicit-first, then clamp precedence", () => {
    const parse = scenarioParser();

    expect(parse(new URLSearchParams())).toMatchObject({ frequency: 2, sampleRate: 16, bits: 8 });
    expect(parse(new URLSearchParams("scenario=low-frequency"))).toMatchObject({
      frequency: 1,
      sampleRate: 8,
      bits: 8,
    });
    expect(parse(new URLSearchParams("scenario=low-frequency&rate=32&bits=2"))).toMatchObject({
      sampleRate: 32,
      bits: 2,
    });
    expect(parse(new URLSearchParams("sampleRate=999&bits=-1"))).toMatchObject({
      sampleRate: 32,
      bits: 2,
    });
  });

  it("uses defaults for unknown, malformed, and missing values; first duplicate wins", () => {
    const parse = scenarioParser();

    expect(parse(new URLSearchParams("scenario=nope"))).toMatchObject({ sampleRate: 16, bits: 8 });
    expect(parse(new URLSearchParams("sampleRate=abc&bits=1.5"))).toMatchObject({
      sampleRate: 16,
      bits: 8,
    });
    expect(parse(new URLSearchParams("rate=8&rate=32&bits=8&bits=2"))).toMatchObject({
      sampleRate: 8,
      bits: 8,
    });
  });
});
