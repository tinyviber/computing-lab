import {
  DEFAULT_WORDS,
  normalizeBitPattern,
  normalizeWordWidth,
  type BitPattern,
  type Reading,
  type WordWidth,
} from "../domain/model";

export type TwosComplementScenario = {
  width: WordWidth;
  left: BitPattern;
  right: BitPattern;
  reading: Reading;
};

export type TwosComplementScenarioSearch = URLSearchParams | string | Record<string, unknown>;

export const DEFAULT_TWOS_COMPLEMENT_SCENARIO: TwosComplementScenario = {
  width: 4,
  left: DEFAULT_WORDS[4].left,
  right: DEFAULT_WORDS[4].right,
  reading: "signed",
};

function toParams(input: TwosComplementScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.set(key, String(firstValue));
  }
  return params;
}

function widthFromParam(value: string | null): WordWidth {
  return value === "8" ? 8 : 4;
}

function readingFromParam(value: string | null): Reading {
  return value === "unsigned" ? "unsigned" : "signed";
}

export function parseTwosComplementScenario(
  input: TwosComplementScenarioSearch,
): TwosComplementScenario {
  const params = toParams(input);
  const width = widthFromParam(params.get("width"));
  const defaults = DEFAULT_WORDS[width];
  return {
    width,
    left: normalizeBitPattern(params.get("a"), width, defaults.left),
    right: normalizeBitPattern(params.get("b"), width, defaults.right),
    reading: readingFromParam(params.get("reading")),
  };
}

export function serializeTwosComplementScenario(scenario: TwosComplementScenario): string {
  const width = normalizeWordWidth(scenario.width);
  const defaults = DEFAULT_WORDS[width];
  const left = normalizeBitPattern(scenario.left, width, defaults.left);
  const right = normalizeBitPattern(scenario.right, width, defaults.right);
  const reading: Reading = scenario.reading === "unsigned" ? "unsigned" : "signed";
  const params = new URLSearchParams();
  params.set("width", String(width));
  params.set("a", left);
  params.set("b", right);
  params.set("reading", reading);
  return params.toString();
}
