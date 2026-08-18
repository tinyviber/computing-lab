import type { BitPattern, WordWidth } from "../domain/model";

export type TwosComplementExample = "signed-boundary" | "carry-only" | "negative-overflow";

export type TwosComplementExampleMetadata = {
  id: TwosComplementExample;
  width: WordWidth;
  words: {
    left: BitPattern;
    right: BitPattern;
  };
  label: string;
  description: string;
};

type WidthValues<T> = Record<WordWidth, T>;

type ExampleVariant = {
  words: {
    left: BitPattern;
    right: BitPattern;
  };
  label: string;
  description: string;
};

type ExampleDefinition = {
  id: TwosComplementExample;
  variants: WidthValues<ExampleVariant>;
};

const GUIDED_EXAMPLE_DEFINITIONS: readonly ExampleDefinition[] = [
  {
    id: "signed-boundary",
    variants: {
      4: {
        words: { left: "0111", right: "0001" },
        label: "7 + 1",
        description: "signed overflow at +7; no carry-out",
      },
      8: {
        words: { left: "01111111", right: "00000001" },
        label: "127 + 1",
        description: "signed overflow at +127; no carry-out",
      },
    },
  },
  {
    id: "carry-only",
    variants: {
      4: {
        words: { left: "1111", right: "0001" },
        label: "15 + 1",
        description: "unsigned carry-out; signed −1 + 1 does not overflow",
      },
      8: {
        words: { left: "11111111", right: "00000001" },
        label: "255 + 1",
        description: "unsigned carry-out; signed −1 + 1 does not overflow",
      },
    },
  },
  {
    id: "negative-overflow",
    variants: {
      4: {
        words: { left: "1000", right: "1111" },
        label: "−8 + −1",
        description: "negative signed overflow below −8",
      },
      8: {
        words: { left: "10000000", right: "11111111" },
        label: "−128 + −1",
        description: "negative signed overflow below −128",
      },
    },
  },
];

export function getTwosComplementExamples(
  width: WordWidth,
): ReadonlyArray<TwosComplementExampleMetadata> {
  return GUIDED_EXAMPLE_DEFINITIONS.map((definition) => {
    const variant = definition.variants[width];
    return { id: definition.id, width, ...variant };
  });
}

export function getTwosComplementExample(
  width: WordWidth,
  id: TwosComplementExample,
): TwosComplementExampleMetadata {
  const example = getTwosComplementExamples(width).find((candidate) => candidate.id === id);
  if (!example) throw new Error(`Unknown two's-complement example: ${id}`);
  return example;
}
