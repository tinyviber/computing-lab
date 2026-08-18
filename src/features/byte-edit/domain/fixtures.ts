import type {
  ByteEditPreset,
  ByteEditPresetId,
  ByteEditScenario,
  ByteEditScenarioId,
} from "./model";

const MIXED_BYTES = [0x41, 0xc3, 0xa9, 0xe7, 0x8c, 0xab, 0xf0, 0x9f, 0x99, 0x82];

export const BYTE_EDIT_SCENARIOS: Readonly<Record<ByteEditScenarioId, ByteEditScenario>> = {
  ascii: { id: "ascii", title: "ASCII", text: "A", bytes: [0x41] },
  accent: { id: "accent", title: "Accented Latin", text: "é", bytes: [0xc3, 0xa9] },
  cjk: { id: "cjk", title: "CJK character", text: "猫", bytes: [0xe7, 0x8c, 0xab] },
  emoji: { id: "emoji", title: "Emoji", text: "🙂", bytes: [0xf0, 0x9f, 0x99, 0x82] },
  mixed: {
    id: "mixed",
    title: "Mixed text",
    text: "Aé猫🙂",
    bytes: MIXED_BYTES,
  },
};

export const DEFAULT_BYTE_EDIT_SCENARIO: ByteEditScenarioId = "mixed";

export const BYTE_EDIT_PRESETS: Readonly<Record<ByteEditPresetId, ByteEditPreset>> = {
  original: {
    id: "original",
    label: "Original",
    bytes: MIXED_BYTES,
    note: "Restore the fixture's own bytes.",
  },
  truncated: {
    id: "truncated",
    label: "Truncated",
    bytes: MIXED_BYTES.slice(0, -1),
    note: "Drop the last byte of the emoji sequence.",
  },
  overlong: {
    id: "overlong",
    label: "Overlong A",
    bytes: [0xc1, 0x81, ...MIXED_BYTES.slice(2)],
    note: "Encode A in two bytes: C1 81 is an overlong form.",
  },
  surrogate: {
    id: "surrogate",
    label: "Surrogate",
    bytes: [0x41, 0xed, 0xa0, 0x80, ...MIXED_BYTES.slice(3)],
    note: "ED A0 80 encodes a UTF-16 surrogate code point.",
  },
  "out-of-range": {
    id: "out-of-range",
    label: "Out of range",
    bytes: [...MIXED_BYTES.slice(0, 6), 0xf4, 0x90, 0x80, 0x80],
    note: "F4 90 80 80 encodes U+110000, above the Unicode maximum.",
  },
  "corrupt-continuation": {
    id: "corrupt-continuation",
    label: "Corrupt continuation",
    bytes: [...MIXED_BYTES.slice(0, 2), 0x41, ...MIXED_BYTES.slice(3)],
    note: "Replace the second byte A9 with ASCII 41, breaking the two-byte sequence.",
  },
};

export function getByteEditScenario(id: ByteEditScenarioId): ByteEditScenario {
  return BYTE_EDIT_SCENARIOS[id];
}
