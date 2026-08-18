import { describe, expect, it } from "vitest";
import { deriveIntegerModel } from "../domain/model";
import { getTwosComplementExamples } from "./examples";
import { parseTwosComplementScenario } from "./scenario";
import { createTwosComplementLessonState, transitionTwosComplementLesson } from "./state";

describe("two's-complement lesson state", () => {
  it("keeps fixed-width words while toggling bits and changing width", () => {
    let state = createTwosComplementLessonState(
      parseTwosComplementScenario("width=4&a=1000&b=0001&reading=signed"),
    );
    state = transitionTwosComplementLesson(state, {
      type: "toggle-bit",
      operand: "left",
      msbIndex: 3,
    });
    expect(state.left).toBe("1001");
    expect(state.left).toHaveLength(4);

    state = transitionTwosComplementLesson(state, { type: "set-width", width: 8 });
    expect(state).toMatchObject({
      width: 8,
      left: "11111001",
      right: "00000001",
      reading: "signed",
    });
    expect(state.left).toHaveLength(8);
    expect(state.right).toHaveLength(8);
  });

  it("uses the active reading when expanding words and preserves it", () => {
    let state = createTwosComplementLessonState(
      parseTwosComplementScenario("width=4&a=1000&b=0001&reading=unsigned"),
    );
    state = transitionTwosComplementLesson(state, { type: "set-width", width: 8 });
    expect(state).toMatchObject({ left: "00001000", right: "00000001", reading: "unsigned" });
    state = transitionTwosComplementLesson(state, { type: "set-reading", reading: "signed" });
    expect(state.reading).toBe("signed");
  });

  it.each([
    [4, "signed-boundary", "0111", "0001"],
    [4, "carry-only", "1111", "0001"],
    [4, "negative-overflow", "1000", "1111"],
    [8, "signed-boundary", "01111111", "00000001"],
    [8, "carry-only", "11111111", "00000001"],
    [8, "negative-overflow", "10000000", "11111111"],
  ] as const)(
    "applies the %s-bit %s guided contract words exactly",
    (width, example, left, right) => {
      let state = createTwosComplementLessonState(
        parseTwosComplementScenario(`width=${width}&a=00000000&b=00000000&reading=signed`),
      );
      state = transitionTwosComplementLesson(state, { type: "apply-example", example });

      expect(state).toMatchObject({ width, left, right });
      expect("submit" in state).toBe(false);
      expect("status" in state).toBe(false);
    },
  );

  it("keeps every catalogued example aligned with independent ripple-carry evidence", () => {
    const expectedByWidth = {
      4: {
        "signed-boundary": {
          label: "7 + 1",
          description: "signed overflow at +7; no carry-out",
          result: "1000",
          carryOut: 0,
          carryIntoSign: 1,
          signCarriesDiffer: true,
          signedOverflow: true,
          unsignedOverflow: false,
        },
        "carry-only": {
          label: "15 + 1",
          description: "unsigned carry-out; signed −1 + 1 does not overflow",
          result: "0000",
          carryOut: 1,
          carryIntoSign: 1,
          signCarriesDiffer: false,
          signedOverflow: false,
          unsignedOverflow: true,
        },
        "negative-overflow": {
          label: "−8 + −1",
          description: "negative signed overflow below −8",
          result: "0111",
          carryOut: 1,
          carryIntoSign: 0,
          signCarriesDiffer: true,
          signedOverflow: true,
          unsignedOverflow: true,
        },
      },
      8: {
        "signed-boundary": {
          label: "127 + 1",
          description: "signed overflow at +127; no carry-out",
          result: "10000000",
          carryOut: 0,
          carryIntoSign: 1,
          signCarriesDiffer: true,
          signedOverflow: true,
          unsignedOverflow: false,
        },
        "carry-only": {
          label: "255 + 1",
          description: "unsigned carry-out; signed −1 + 1 does not overflow",
          result: "00000000",
          carryOut: 1,
          carryIntoSign: 1,
          signCarriesDiffer: false,
          signedOverflow: false,
          unsignedOverflow: true,
        },
        "negative-overflow": {
          label: "−128 + −1",
          description: "negative signed overflow below −128",
          result: "01111111",
          carryOut: 1,
          carryIntoSign: 0,
          signCarriesDiffer: true,
          signedOverflow: true,
          unsignedOverflow: true,
        },
      },
    } as const;

    for (const width of [4, 8] as const) {
      const examples = getTwosComplementExamples(width);
      expect(examples.map(({ id }) => id)).toEqual([
        "signed-boundary",
        "carry-only",
        "negative-overflow",
      ]);

      for (const metadata of examples) {
        const model = deriveIntegerModel({
          width,
          left: metadata.words.left,
          right: metadata.words.right,
        });
        const expected = expectedByWidth[width][metadata.id];

        expect(metadata).toMatchObject({
          label: expected.label,
          description: expected.description,
        });
        expect(model).toMatchObject({
          result: expected.result,
          carryOut: expected.carryOut,
          carryIntoSign: expected.carryIntoSign,
          signCarriesDiffer: expected.signCarriesDiffer,
          signed: { overflow: expected.signedOverflow },
          unsigned: { overflow: expected.unsignedOverflow },
        });
      }
    }
  });

  it("resets to the original URL scenario rather than an example", () => {
    const scenario = parseTwosComplementScenario("width=4&a=0011&b=0010&reading=unsigned");
    let state = createTwosComplementLessonState(scenario);
    state = transitionTwosComplementLesson(state, { type: "apply-example", example: "carry-only" });
    state = transitionTwosComplementLesson(state, { type: "set-width", width: 8 });
    state = transitionTwosComplementLesson(state, { type: "reset" });
    expect(state).toMatchObject({ ...scenario, initialScenario: scenario });
  });
});
