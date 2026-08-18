import { describe, expect, it } from "vitest";
import { encodeCodePoint, getUtf8Scenario, runUtf8, stepUtf8, createUtf8Machine } from "./index";

describe("UTF-8 domain", () => {
  it("matches hand-authored bytes and branches for all learner fixtures", () => {
    expect(runUtf8(getUtf8Scenario("ascii")).machine.bytes).toEqual([0x41]);
    expect(runUtf8(getUtf8Scenario("accent")).machine.bytes).toEqual([0xc3, 0xa9]);
    expect(runUtf8(getUtf8Scenario("cjk")).machine.bytes).toEqual([0xe7, 0x8c, 0xab]);
    expect(runUtf8(getUtf8Scenario("emoji")).machine.bytes).toEqual([0xf0, 0x9f, 0x99, 0x82]);
    expect(runUtf8(getUtf8Scenario("mixed")).machine.bytes).toEqual([
      0x41, 0xc3, 0xa9, 0xe7, 0x8c, 0xab, 0xf0, 0x9f, 0x99, 0x82,
    ]);

    expect(encodeCodePoint(0x41)).toMatchObject({ branch: "1-byte", template: "0xxxxxxx" });
    expect(encodeCodePoint(0xe9)).toMatchObject({
      branch: "2-byte",
      template: "110xxxxx 10xxxxxx",
    });
    expect(encodeCodePoint(0x732b)).toMatchObject({ branch: "3-byte" });
    expect(encodeCodePoint(0x1f642)).toMatchObject({ branch: "4-byte" });
  });

  it("hand-checks scalar evidence, byte binaries, and frame boundaries for every fixture", () => {
    const expected = {
      ascii: {
        branches: ["1-byte"],
        binaries: ["000000000000001000001"],
        templates: ["0xxxxxxx"],
        bytes: [[{ decimal: 65, binary: "01000001" }]],
        after: [[65]],
      },
      accent: {
        branches: ["2-byte"],
        binaries: ["000000000000011101001"],
        templates: ["110xxxxx 10xxxxxx"],
        bytes: [
          [
            { decimal: 195, binary: "11000011" },
            { decimal: 169, binary: "10101001" },
          ],
        ],
        after: [[195, 169]],
      },
      cjk: {
        branches: ["3-byte"],
        binaries: ["000000111001100101011"],
        templates: ["1110xxxx 10xxxxxx 10xxxxxx"],
        bytes: [
          [
            { decimal: 231, binary: "11100111" },
            { decimal: 140, binary: "10001100" },
            { decimal: 171, binary: "10101011" },
          ],
        ],
        after: [[231, 140, 171]],
      },
      emoji: {
        branches: ["4-byte"],
        binaries: ["000011111011001000010"],
        templates: ["11110xxx 10xxxxxx 10xxxxxx 10xxxxxx"],
        bytes: [
          [
            { decimal: 240, binary: "11110000" },
            { decimal: 159, binary: "10011111" },
            { decimal: 153, binary: "10011001" },
            { decimal: 130, binary: "10000010" },
          ],
        ],
        after: [[240, 159, 153, 130]],
      },
      mixed: {
        branches: ["1-byte", "2-byte", "3-byte", "4-byte"],
        binaries: [
          "000000000000001000001",
          "000000000000011101001",
          "000000111001100101011",
          "000011111011001000010",
        ],
        templates: [
          "0xxxxxxx",
          "110xxxxx 10xxxxxx",
          "1110xxxx 10xxxxxx 10xxxxxx",
          "11110xxx 10xxxxxx 10xxxxxx 10xxxxxx",
        ],
        bytes: [
          [{ decimal: 65, binary: "01000001" }],
          [
            { decimal: 195, binary: "11000011" },
            { decimal: 169, binary: "10101001" },
          ],
          [
            { decimal: 231, binary: "11100111" },
            { decimal: 140, binary: "10001100" },
            { decimal: 171, binary: "10101011" },
          ],
          [
            { decimal: 240, binary: "11110000" },
            { decimal: 159, binary: "10011111" },
            { decimal: 153, binary: "10011001" },
            { decimal: 130, binary: "10000010" },
          ],
        ],
        after: [
          [65],
          [65, 195, 169],
          [65, 195, 169, 231, 140, 171],
          [65, 195, 169, 231, 140, 171, 240, 159, 153, 130],
        ],
      },
    } as const;

    for (const id of Object.keys(expected) as Array<keyof typeof expected>) {
      const result = runUtf8(getUtf8Scenario(id));
      expect(result.frames.map((frame) => frame.evidence.branch)).toEqual(expected[id].branches);
      expect(result.frames.map((frame) => frame.evidence.codePointBinary)).toEqual(
        expected[id].binaries,
      );
      expect(result.frames.map((frame) => frame.evidence.template)).toEqual(expected[id].templates);
      expect(result.frames.map((frame) => frame.evidence.bytes)).toEqual(expected[id].bytes);
      expect(result.frames.map((frame) => frame.before.bytes)).toEqual(
        expected[id].after.map((bytes, index) =>
          index === 0 ? [] : expected[id].after[index - 1],
        ),
      );
      expect(result.frames.map((frame) => frame.after.bytes)).toEqual(expected[id].after);
      expect(result.machine.bytes).toEqual(expected[id].after.at(-1));
    }
  });

  it("checks exact UTF-8 branch boundaries", () => {
    expect(encodeCodePoint(0x7f).bytes.map((byte) => byte.decimal)).toEqual([0x7f]);
    expect(encodeCodePoint(0x80).bytes.map((byte) => byte.decimal)).toEqual([0xc2, 0x80]);
    expect(encodeCodePoint(0x7ff).bytes.map((byte) => byte.decimal)).toEqual([0xdf, 0xbf]);
    expect(encodeCodePoint(0x800).bytes.map((byte) => byte.decimal)).toEqual([0xe0, 0xa0, 0x80]);
    expect(encodeCodePoint(0xffff).bytes.map((byte) => byte.decimal)).toEqual([0xef, 0xbf, 0xbf]);
    expect(encodeCodePoint(0x10000).bytes.map((byte) => byte.decimal)).toEqual([
      0xf0, 0x90, 0x80, 0x80,
    ]);
  });

  it("rejects invalid scalar values and malformed scenarios", () => {
    expect(() => encodeCodePoint(-1)).toThrow(/invalid/i);
    expect(() => encodeCodePoint(1.5)).toThrow(/invalid/i);
    expect(() => encodeCodePoint(Number.MAX_SAFE_INTEGER + 1)).toThrow(/invalid/i);
    expect(() => encodeCodePoint(Number.POSITIVE_INFINITY)).toThrow(/invalid/i);
    expect(() => encodeCodePoint(0x110000)).toThrow(/invalid/i);
    expect(() => encodeCodePoint(0xd800)).toThrow(/surrogate/i);
    expect(() => encodeCodePoint(0xdfff)).toThrow(/surrogate/i);
    expect(() => runUtf8({ ...getUtf8Scenario("ascii"), title: "" })).toThrow(/title/i);
  });

  it("uses one code point per pure step and preserves terminal identity", () => {
    const scenario = getUtf8Scenario("mixed");
    const first = stepUtf8(createUtf8Machine(scenario), scenario);
    const complete = runUtf8(scenario);
    const after = stepUtf8(complete.machine, scenario);

    expect(first.frame?.evidence.character).toBe("A");
    expect(first.machine.nextIndex).toBe(1);
    expect(first.frame?.after.bytes).toEqual([0x41]);
    expect(after.machine).toBe(complete.machine);
    expect(after.frame).toBeUndefined();
    expect(after.done).toBe(true);
  });

  it("keeps snapshots and byte evidence independent", () => {
    const result = runUtf8(getUtf8Scenario("mixed"));
    const firstBytes = result.frames[0].after.bytes as number[];
    const firstEvidenceBytes = result.frames[0].evidence.bytes as Array<{ decimal: number }>;
    firstBytes.push(255);
    firstEvidenceBytes[0].decimal = 255;

    expect(result.frames[1].before.bytes).toEqual([0x41]);
    expect(result.frames[0].evidence.bytes[0].decimal).toBe(255);
    expect(result.machine.bytes).toEqual([
      0x41, 0xc3, 0xa9, 0xe7, 0x8c, 0xab, 0xf0, 0x9f, 0x99, 0x82,
    ]);
  });
});
