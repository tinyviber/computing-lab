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
        codePoints: [0x41],
        branches: ["1-byte"],
        binaries: ["000000000000001000001"],
        templates: ["0xxxxxxx"],
        bytes: [[{ decimal: 65, binary: "01000001" }]],
        after: [[65]],
      },
      accent: {
        codePoints: [0xe9],
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
        codePoints: [0x732b],
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
        codePoints: [0x1f642],
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
        codePoints: [0x41, 0xe9, 0x732b, 0x1f642],
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
      "boundary-1-2": {
        codePoints: [0x7f, 0x80],
        branches: ["1-byte", "2-byte"],
        binaries: ["000000000000001111111", "000000000000010000000"],
        templates: ["0xxxxxxx", "110xxxxx 10xxxxxx"],
        bytes: [
          [{ decimal: 127, binary: "01111111" }],
          [
            { decimal: 194, binary: "11000010" },
            { decimal: 128, binary: "10000000" },
          ],
        ],
        after: [[127], [127, 194, 128]],
      },
      "boundary-2-3": {
        codePoints: [0x7ff, 0x800],
        branches: ["2-byte", "3-byte"],
        binaries: ["000000000011111111111", "000000000100000000000"],
        templates: ["110xxxxx 10xxxxxx", "1110xxxx 10xxxxxx 10xxxxxx"],
        bytes: [
          [
            { decimal: 223, binary: "11011111" },
            { decimal: 191, binary: "10111111" },
          ],
          [
            { decimal: 224, binary: "11100000" },
            { decimal: 160, binary: "10100000" },
            { decimal: 128, binary: "10000000" },
          ],
        ],
        after: [
          [223, 191],
          [223, 191, 224, 160, 128],
        ],
      },
      "boundary-3-4": {
        codePoints: [0xffff, 0x10000],
        branches: ["3-byte", "4-byte"],
        binaries: ["000001111111111111111", "000010000000000000000"],
        templates: ["1110xxxx 10xxxxxx 10xxxxxx", "11110xxx 10xxxxxx 10xxxxxx 10xxxxxx"],
        bytes: [
          [
            { decimal: 239, binary: "11101111" },
            { decimal: 191, binary: "10111111" },
            { decimal: 191, binary: "10111111" },
          ],
          [
            { decimal: 240, binary: "11110000" },
            { decimal: 144, binary: "10010000" },
            { decimal: 128, binary: "10000000" },
            { decimal: 128, binary: "10000000" },
          ],
        ],
        after: [
          [239, 191, 191],
          [239, 191, 191, 240, 144, 128, 128],
        ],
      },
    } as const;

    for (const id of Object.keys(expected) as Array<keyof typeof expected>) {
      const result = runUtf8(getUtf8Scenario(id));
      expect(result.frames.map((frame) => frame.evidence.codePoint)).toEqual(
        expected[id].codePoints,
      );
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
    const expected = [
      {
        codePoint: 0x7f,
        branch: "1-byte",
        codePointBinary: "000000000000001111111",
        template: "0xxxxxxx",
        bytes: [0x7f],
      },
      {
        codePoint: 0x80,
        branch: "2-byte",
        codePointBinary: "000000000000010000000",
        template: "110xxxxx 10xxxxxx",
        bytes: [0xc2, 0x80],
      },
      {
        codePoint: 0x7ff,
        branch: "2-byte",
        codePointBinary: "000000000011111111111",
        template: "110xxxxx 10xxxxxx",
        bytes: [0xdf, 0xbf],
      },
      {
        codePoint: 0x800,
        branch: "3-byte",
        codePointBinary: "000000000100000000000",
        template: "1110xxxx 10xxxxxx 10xxxxxx",
        bytes: [0xe0, 0xa0, 0x80],
      },
      {
        codePoint: 0xffff,
        branch: "3-byte",
        codePointBinary: "000001111111111111111",
        template: "1110xxxx 10xxxxxx 10xxxxxx",
        bytes: [0xef, 0xbf, 0xbf],
      },
      {
        codePoint: 0x10000,
        branch: "4-byte",
        codePointBinary: "000010000000000000000",
        template: "11110xxx 10xxxxxx 10xxxxxx 10xxxxxx",
        bytes: [0xf0, 0x90, 0x80, 0x80],
      },
    ] as const;

    for (const boundary of expected) {
      const evidence = encodeCodePoint(boundary.codePoint);
      expect(evidence).toMatchObject({
        codePoint: boundary.codePoint,
        branch: boundary.branch,
        codePointBinary: boundary.codePointBinary,
        template: boundary.template,
      });
      expect(evidence.bytes.map((byte) => byte.decimal)).toEqual(boundary.bytes);
      expect(evidence.bytes.map((byte) => byte.binary)).toEqual(
        boundary.bytes.map((byte) => byte.toString(2).padStart(8, "0")),
      );
    }
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
