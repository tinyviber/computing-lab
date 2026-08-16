import { describe, expect, it } from "vitest";
import { parseAudioEncodingScenario } from "./scenario";

describe("audio lesson scenario", () => {
  it("applies default, preset, explicit-first, then clamp precedence", () => {
    expect(parseAudioEncodingScenario(new URLSearchParams())).toMatchObject({
      frequency: 2,
      sampleRate: 16,
      bits: 8,
    });
    expect(parseAudioEncodingScenario(new URLSearchParams("scenario=low-frequency"))).toMatchObject(
      {
        frequency: 1,
        sampleRate: 8,
        bits: 8,
      },
    );
    expect(
      parseAudioEncodingScenario(new URLSearchParams("scenario=low-frequency&rate=32&bits=2")),
    ).toMatchObject({ sampleRate: 32, bits: 2 });
    expect(parseAudioEncodingScenario(new URLSearchParams("sampleRate=999&bits=-1"))).toMatchObject(
      {
        sampleRate: 32,
        bits: 2,
      },
    );
  });

  it("fails closed for unknown, malformed, and missing values; first duplicate wins", () => {
    expect(parseAudioEncodingScenario(new URLSearchParams("scenario=nope"))).toMatchObject({
      sampleRate: 16,
      bits: 8,
    });
    expect(
      parseAudioEncodingScenario(new URLSearchParams("sampleRate=abc&bits=1.5")),
    ).toMatchObject({
      sampleRate: 16,
      bits: 8,
    });
    expect(
      parseAudioEncodingScenario(new URLSearchParams("rate=8&rate=32&bits=8&bits=2")),
    ).toMatchObject({ sampleRate: 8, bits: 8 });
  });
});
