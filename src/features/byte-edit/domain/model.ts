export type ByteEditScenarioId = "ascii" | "accent" | "cjk" | "emoji" | "mixed";

export type ByteEditScenario = {
  id: ByteEditScenarioId;
  title: string;
  text: string;
  bytes: readonly number[];
};

export type DecodeResult =
  | { valid: true; characters: string; codePoints: readonly number[] }
  | { valid: false; reason: string; at: number };

export type ByteEditPresetId =
  "original" | "truncated" | "overlong" | "surrogate" | "out-of-range" | "corrupt-continuation";

export type ByteEditPreset = {
  id: ByteEditPresetId;
  label: string;
  bytes: readonly number[];
  note: string;
};

export type ByteEditEdit =
  { kind: "byte"; byteIndex: number; value: number } | { kind: "preset"; preset: ByteEditPresetId };

export type ByteEditMachine = {
  bytes: readonly number[];
};

export type ByteEditSnapshot = ByteEditMachine;

export type ByteEditFrame = {
  index: number;
  before: ByteEditSnapshot;
  after: ByteEditSnapshot;
  edit: ByteEditEdit;
  predictedValid?: boolean;
  decode: DecodeResult;
};

export type ByteEditStepResult = {
  machine: ByteEditMachine;
  frame: ByteEditFrame;
};

function cloneBytes(bytes: readonly number[]): number[] {
  return [...bytes];
}

function snapshot(machine: ByteEditMachine): ByteEditSnapshot {
  return { bytes: cloneBytes(machine.bytes) };
}

export function decodeUtf8(bytes: readonly number[]): DecodeResult {
  const result: number[] = [];
  let index = 0;
  const length = bytes.length;
  const continuation = (position: number): number => {
    if (position >= length) return -1;
    const value = bytes[position];
    return value >= 0x80 && value <= 0xbf ? value : -1;
  };
  while (index < length) {
    const lead = bytes[index];
    if (lead < 0x80) {
      result.push(lead);
      index += 1;
      continue;
    }
    if (lead >= 0xc2 && lead <= 0xdf) {
      const c1 = continuation(index + 1);
      if (c1 < 0) return { valid: false, reason: "missing continuation byte", at: index + 1 };
      result.push(((lead & 0x1f) << 6) | (c1 & 0x3f));
      index += 2;
      continue;
    }
    if (lead === 0xc0 || lead === 0xc1) {
      return { valid: false, reason: "overlong encoding", at: index };
    }
    if (lead >= 0xe0 && lead <= 0xef) {
      const c1 = continuation(index + 1);
      const c2 = continuation(index + 2);
      if (c1 < 0) return { valid: false, reason: "missing continuation byte", at: index + 1 };
      if (c2 < 0) return { valid: false, reason: "missing continuation byte", at: index + 2 };
      if (lead === 0xe0 && c1 < 0xa0)
        return { valid: false, reason: "overlong encoding", at: index };
      if (lead === 0xed && c1 >= 0xa0)
        return { valid: false, reason: "surrogate code point", at: index };
      result.push(((lead & 0x0f) << 12) | ((c1 & 0x3f) << 6) | (c2 & 0x3f));
      index += 3;
      continue;
    }
    if (lead >= 0xf0 && lead <= 0xf4) {
      const c1 = continuation(index + 1);
      const c2 = continuation(index + 2);
      const c3 = continuation(index + 3);
      if (c1 < 0) return { valid: false, reason: "missing continuation byte", at: index + 1 };
      if (c2 < 0) return { valid: false, reason: "missing continuation byte", at: index + 2 };
      if (c3 < 0) return { valid: false, reason: "missing continuation byte", at: index + 3 };
      if (lead === 0xf0 && c1 < 0x90)
        return { valid: false, reason: "overlong encoding", at: index };
      if (lead === 0xf4 && c1 > 0x8f)
        return { valid: false, reason: "code point above U+10FFFF", at: index };
      result.push(((lead & 0x07) << 18) | ((c1 & 0x3f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
      index += 4;
      continue;
    }
    return {
      valid: false,
      reason: lead >= 0x80 && lead <= 0xbf ? "unexpected continuation byte" : "invalid lead byte",
      at: index,
    };
  }
  return { valid: true, characters: String.fromCodePoint(...result), codePoints: result };
}

export function assertByteEditScenario(scenario: ByteEditScenario): void {
  if (!scenario.title.trim() || scenario.text.length === 0) {
    throw new Error("Byte edit scenarios need a title and non-empty text.");
  }
  const encoded = [...scenario.text].flatMap((character) => [
    ...new TextEncoder().encode(character),
  ]);
  if (
    scenario.bytes.length !== encoded.length ||
    scenario.bytes.some((value, index) => value !== encoded[index])
  ) {
    throw new Error("Scenario bytes must be the UTF-8 encoding of its text.");
  }
}

export function assertByteEditEdit(
  machine: ByteEditMachine,
  edit: ByteEditEdit,
  presets: Readonly<Record<ByteEditPresetId, ByteEditPreset>>,
): void {
  if (edit.kind === "byte") {
    if (
      !Number.isSafeInteger(edit.byteIndex) ||
      edit.byteIndex < 0 ||
      edit.byteIndex >= machine.bytes.length
    ) {
      throw new Error(`Byte index out of range: ${edit.byteIndex}.`);
    }
    if (!Number.isSafeInteger(edit.value) || edit.value < 0 || edit.value > 255) {
      throw new Error(`Byte value out of range: ${edit.value}.`);
    }
  } else if (!presets[edit.preset]) {
    throw new Error(`Unknown byte edit preset: ${edit.preset}.`);
  }
}

export function createByteEditMachine(scenario: ByteEditScenario): ByteEditMachine {
  assertByteEditScenario(scenario);
  return { bytes: cloneBytes(scenario.bytes) };
}

export function stepByteEdit(
  machine: ByteEditMachine,
  scenario: ByteEditScenario,
  edit: ByteEditEdit,
  presets: Readonly<Record<ByteEditPresetId, ByteEditPreset>>,
  predictedValid?: boolean,
): ByteEditStepResult {
  assertByteEditScenario(scenario);
  assertByteEditEdit(machine, edit, presets);
  const before = snapshot(machine);
  const nextBytes =
    edit.kind === "byte"
      ? machine.bytes.map((value, index) => (index === edit.byteIndex ? edit.value : value))
      : cloneBytes(edit.preset === "original" ? scenario.bytes : presets[edit.preset].bytes);
  const after = snapshot({ bytes: nextBytes });
  return {
    machine: { bytes: nextBytes },
    frame: {
      index: 0,
      before,
      after,
      edit,
      predictedValid,
      decode: decodeUtf8(nextBytes),
    },
  };
}
