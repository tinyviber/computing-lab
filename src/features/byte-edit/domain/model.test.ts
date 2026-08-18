import { describe, expect, it } from "vitest";
import {
  BYTE_EDIT_PRESETS,
  createByteEditMachine,
  decodeUtf8,
  getByteEditScenario,
  stepByteEdit,
} from "./index";

describe("Byte Edit domain", () => {
  it("decodes the valid mixed sequence and each invalid rule exactly", () => {
    const scenario = getByteEditScenario("mixed");
    expect(decodeUtf8(scenario.bytes)).toEqual({
      valid: true,
      characters: "Aé猫🙂",
      codePoints: [0x41, 0xe9, 0x732b, 0x1f642],
    });

    expect(decodeUtf8(BYTE_EDIT_PRESETS.truncated.bytes)).toMatchObject({
      valid: false,
      reason: "missing continuation byte",
      at: 9,
    });
    expect(decodeUtf8(BYTE_EDIT_PRESETS.overlong.bytes)).toMatchObject({
      valid: false,
      reason: "overlong encoding",
      at: 0,
    });
    expect(decodeUtf8(BYTE_EDIT_PRESETS.surrogate.bytes)).toMatchObject({
      valid: false,
      reason: "surrogate code point",
      at: 1,
    });
    expect(decodeUtf8(BYTE_EDIT_PRESETS["out-of-range"].bytes)).toMatchObject({
      valid: false,
      reason: "code point above U+10FFFF",
      at: 6,
    });
    expect(decodeUtf8(BYTE_EDIT_PRESETS["corrupt-continuation"].bytes)).toMatchObject({
      valid: false,
      reason: "missing continuation byte",
      at: 2,
    });
    expect(decodeUtf8([0x80])).toMatchObject({
      valid: false,
      reason: "unexpected continuation byte",
    });
    expect(decodeUtf8([0xff])).toMatchObject({ valid: false, reason: "invalid lead byte" });
    expect(decodeUtf8([0xc2])).toMatchObject({ valid: false, reason: "missing continuation byte" });
    expect(decodeUtf8([0xe0, 0x80, 0x80])).toMatchObject({
      valid: false,
      reason: "overlong encoding",
    });
    expect(decodeUtf8([0xf0, 0x80, 0x80, 0x80])).toMatchObject({
      valid: false,
      reason: "overlong encoding",
    });
  });

  it("applies one byte edit per step with bounds and value validation", () => {
    const scenario = getByteEditScenario("mixed");
    const machine = createByteEditMachine(scenario);
    const result = stepByteEdit(
      machine,
      scenario,
      { kind: "byte", byteIndex: 2, value: 0x41 },
      BYTE_EDIT_PRESETS,
    );

    expect(result.frame.before.bytes).toEqual(scenario.bytes);
    expect(result.frame.after.bytes[2]).toBe(0x41);
    expect(result.frame.decode).toMatchObject({
      valid: false,
      reason: "missing continuation byte",
      at: 2,
    });

    expect(() =>
      stepByteEdit(machine, scenario, { kind: "byte", byteIndex: 10, value: 1 }, BYTE_EDIT_PRESETS),
    ).toThrow(/index/i);
    expect(() =>
      stepByteEdit(
        machine,
        scenario,
        { kind: "byte", byteIndex: 0, value: 256 },
        BYTE_EDIT_PRESETS,
      ),
    ).toThrow(/value/i);
    expect(() =>
      stepByteEdit(
        machine,
        scenario,
        { kind: "preset", preset: "mystery" as never },
        BYTE_EDIT_PRESETS,
      ),
    ).toThrow(/preset/i);
  });

  it("loads presets and restores the fixture bytes for original", () => {
    const scenario = getByteEditScenario("accent");
    const machine = createByteEditMachine(scenario);

    const surrogate = stepByteEdit(
      machine,
      scenario,
      { kind: "preset", preset: "surrogate" },
      BYTE_EDIT_PRESETS,
    );
    expect(surrogate.machine.bytes).toEqual([
      0x41, 0xed, 0xa0, 0x80, 0xe7, 0x8c, 0xab, 0xf0, 0x9f, 0x99, 0x82,
    ]);

    const restored = stepByteEdit(
      surrogate.machine,
      scenario,
      { kind: "preset", preset: "original" },
      BYTE_EDIT_PRESETS,
    );
    expect(restored.machine.bytes).toEqual(scenario.bytes);
    expect(restored.frame.decode).toEqual({
      valid: true,
      characters: "é",
      codePoints: [0xe9],
    });
  });

  it("rejects malformed scenarios", () => {
    expect(decodeUtf8([])).toEqual({ valid: true, characters: "", codePoints: [] });
    const scenario = getByteEditScenario("mixed");
    expect(() => createByteEditMachine({ ...scenario, bytes: [0x41, 0xc3] })).toThrow(/encoding/i);
    expect(() => createByteEditMachine({ ...scenario, title: "" })).toThrow(/title/i);
  });
});
