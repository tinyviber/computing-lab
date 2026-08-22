export type ByteEditScenarioId = "ascii" | "accent" | "cjk" | "emoji" | "mixed";

export type ByteEditScenario = {
  id: ByteEditScenarioId;
  title: string;
  text: string;
  bytes: readonly number[];
};

export type DecodeResult =
  | { valid: true; characters: string; codePoints: readonly number[] }
  | { valid: false; reason: string; at: number; offendingByte?: number };

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
  originalComparison: {
    exact: boolean;
    differingByteIndices: readonly number[];
    lengthMatches: boolean;
  };
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
  const invalidInput = (position: number, value: unknown): DecodeResult => ({
    valid: false,
    reason: "byte value out of range",
    at: position,
    ...(typeof value === "number" && Number.isFinite(value) ? { offendingByte: value } : {}),
  });
  const continuation = (
    position: number,
  ):
    { kind: "missing" } | { kind: "valid"; value: number } | { kind: "invalid"; value: number } => {
    if (position >= length) return { kind: "missing" };
    const value = bytes[position];
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return { kind: "invalid", value };
    }
    return value >= 0x80 && value <= 0xbf ? { kind: "valid", value } : { kind: "invalid", value };
  };
  const continuationError = (
    position: number,
    read: ReturnType<typeof continuation>,
  ): DecodeResult | undefined => {
    if (read.kind === "missing")
      return { valid: false, reason: "missing continuation byte", at: position };
    if (read.kind === "invalid") {
      return {
        valid: false,
        reason: "invalid continuation byte",
        at: position,
        offendingByte: read.value,
      };
    }
    return undefined;
  };

  for (const [position, value] of bytes.entries()) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      return invalidInput(position, value);
    }
  }

  while (index < length) {
    const lead = bytes[index];
    if (!Number.isInteger(lead) || lead < 0 || lead > 255) return invalidInput(index, lead);
    if (lead < 0x80) {
      result.push(lead);
      index += 1;
      continue;
    }
    if (lead >= 0xc2 && lead <= 0xdf) {
      const read = continuation(index + 1);
      const error = continuationError(index + 1, read);
      if (error) return error;
      const c1 = read.value;
      result.push(((lead & 0x1f) << 6) | (c1 & 0x3f));
      index += 2;
      continue;
    }
    if (lead === 0xc0 || lead === 0xc1) {
      return { valid: false, reason: "overlong encoding", at: index, offendingByte: lead };
    }
    if (lead >= 0xe0 && lead <= 0xef) {
      const first = continuation(index + 1);
      const firstError = continuationError(index + 1, first);
      if (firstError) return firstError;
      const second = continuation(index + 2);
      const secondError = continuationError(index + 2, second);
      if (secondError) return secondError;
      const c1 = first.value;
      const c2 = second.value;
      if (lead === 0xe0 && c1 < 0xa0)
        return { valid: false, reason: "overlong encoding", at: index + 1, offendingByte: c1 };
      if (lead === 0xed && c1 >= 0xa0)
        return {
          valid: false,
          reason: "surrogate code point",
          at: index + 1,
          offendingByte: c1,
        };
      result.push(((lead & 0x0f) << 12) | ((c1 & 0x3f) << 6) | (c2 & 0x3f));
      index += 3;
      continue;
    }
    if (lead >= 0xf0 && lead <= 0xf4) {
      const first = continuation(index + 1);
      const firstError = continuationError(index + 1, first);
      if (firstError) return firstError;
      const second = continuation(index + 2);
      const secondError = continuationError(index + 2, second);
      if (secondError) return secondError;
      const third = continuation(index + 3);
      const thirdError = continuationError(index + 3, third);
      if (thirdError) return thirdError;
      const c1 = first.value;
      const c2 = second.value;
      const c3 = third.value;
      if (lead === 0xf0 && c1 < 0x90)
        return { valid: false, reason: "overlong encoding", at: index + 1, offendingByte: c1 };
      if (lead === 0xf4 && c1 > 0x8f)
        return {
          valid: false,
          reason: "code point above U+10FFFF",
          at: index + 1,
          offendingByte: c1,
        };
      result.push(((lead & 0x07) << 18) | ((c1 & 0x3f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
      index += 4;
      continue;
    }
    return {
      valid: false,
      reason: lead >= 0x80 && lead <= 0xbf ? "unexpected continuation byte" : "invalid lead byte",
      at: index,
      offendingByte: lead,
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
  const differingByteIndices = Array.from(
    { length: Math.max(nextBytes.length, scenario.bytes.length) },
    (_, index) => index,
  ).filter((index) => nextBytes[index] !== scenario.bytes[index]);
  return {
    machine: { bytes: nextBytes },
    frame: {
      index: 0,
      before,
      after,
      edit,
      predictedValid,
      decode: decodeUtf8(nextBytes),
      originalComparison: {
        exact: differingByteIndices.length === 0,
        differingByteIndices,
        lengthMatches: nextBytes.length === scenario.bytes.length,
      },
    },
  };
}
