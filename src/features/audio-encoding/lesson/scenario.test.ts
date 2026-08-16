import { describe, expect, it } from "vitest";
import * as scenario from "./scenario";

type SoundScenario = {
  source: string;
  sampleRate: number;
  bitDepth: number;
  phase: number;
  mode: string;
  loop: "off" | { startMs: number; endMs: number };
  view: string;
};

const scenarioExports = scenario as Record<string, unknown>;
const parse = scenarioExports.parseSoundScenario ?? scenarioExports.parseAudioEncodingScenario;
const serialize =
  scenarioExports.serializeSoundScenario ??
  scenarioExports.serializeAudioEncodingScenario ??
  scenarioExports.serializeAudioEncodingScenarioSearch;

function parseScenario(input: string): SoundScenario {
  expect(parse, "Sound scenario parser is not exported").toEqual(expect.any(Function));
  return (parse as (input: string) => SoundScenario)(input);
}

function serializeScenario(input: SoundScenario): string {
  expect(serialize, "Sound scenario serializer is not exported").toEqual(expect.any(Function));
  return (serialize as (input: SoundScenario) => string)(input);
}

describe("Sound URL scenario", () => {
  it("uses the canonical defaults", () => {
    expect(parseScenario("")).toMatchObject({
      source: "pure440",
      sampleRate: 8000,
      bitDepth: 8,
      phase: 0,
      mode: "compare",
      loop: "off",
      view: "compare",
    });
  });

  it("uses canonical keys ahead of legacy aliases and preserves the first duplicate", () => {
    expect(
      parseScenario(
        "source=high-pulse&source=speech&sampleRate=16000&sampleRate=4000&bitDepth=12&bitDepth=2&phase=0.5&mode=aliasing&loop=on&view=error&rate=4000&bits=2&scenario=speech&frequency=220",
      ),
    ).toMatchObject({
      source: "high-pulse",
      sampleRate: 16000,
      bitDepth: 12,
      phase: 0.5,
      mode: "aliasing",
      loop: { startMs: 0, endMs: 1000 },
      view: "error",
    });
  });

  it("defaults an invalid first canonical value instead of falling through to duplicates or legacy values", () => {
    expect(
      parseScenario(
        "source=not-a-fixture&source=sawtooth&sampleRate=NaN&sampleRate=16000&rate=16000&bitDepth=Infinity&bitDepth=12&bits=12&phase=&phase=90&mode=nope&mode=aliasing&loop=maybe&view=unknown",
      ),
    ).toMatchObject({
      source: "pure440",
      sampleRate: 8000,
      bitDepth: 8,
      phase: 0,
      mode: "compare",
      loop: "off",
      view: "compare",
    });
  });

  it("clamps finite numeric values and rejects empty, non-finite, and malformed values", () => {
    const low = parseScenario("sampleRate=-1&bitDepth=-1&phase=-999");
    const high = parseScenario("sampleRate=999999&bitDepth=999&phase=999999");
    const malformed = parseScenario("sampleRate=1.2x&bitDepth=&phase=Infinity");

    expect(low.sampleRate).toBeGreaterThanOrEqual(1);
    expect(low.bitDepth).toBeGreaterThanOrEqual(1);
    expect(high.sampleRate).toBeLessThan(999999);
    expect(high.bitDepth).toBeLessThan(999);
    expect(Number.isFinite(high.phase)).toBe(true);
    expect(Number.isFinite(malformed.sampleRate)).toBe(true);
    expect(Number.isFinite(malformed.bitDepth)).toBe(true);
    expect(Number.isFinite(malformed.phase)).toBe(true);
  });

  it("serializes in canonical order, omits defaults, and round-trips without history concerns", () => {
    const defaults: SoundScenario = {
      source: "pure440",
      sampleRate: 8000,
      bitDepth: 8,
      phase: 0,
      mode: "compare",
      loop: "off",
      view: "compare",
    };
    expect(serializeScenario(defaults)).toBe("");

    const custom = {
      ...defaults,
      source: "sawtooth",
      sampleRate: 16000,
      bitDepth: 12,
      phase: 0.5,
      mode: "quantization",
      loop: { startMs: 200, endMs: 700 },
      view: "levels",
    };
    const encoded = serializeScenario(custom);
    expect(encoded).toBe(
      "source=sawtooth&sampleRate=16000&bitDepth=12&phase=0.5&mode=quantization&loop=200%2C700&view=levels",
    );
    expect(parseScenario(encoded)).toMatchObject(custom);
  });
});
