# Byte Edit course design

**Status:** implementation-ready design; feature-local, no shared byte-editor, validator, or BitGrid primitive extraction.

## Research question

> When a learner edits one byte of a fixed UTF-8 sequence, which rules keep the sequence valid, and what does an invalid sequence decode to?

This course is the narrow editable-finite-representation experiment that UTF-8 explicitly deferred. It is not a text editor and not a general hex editor: the learner edits one byte at a time over the known byte sequences from the UTF-8 course, and the domain validates the whole sequence and decodes it.

## Fixtures

The same five text fixtures as UTF-8, so the encoded bytes are already known:

| ID                | Text     | Encoded bytes                   |
| ----------------- | -------- | ------------------------------- |
| `ascii`           | `A`      | `41`                            |
| `accent`          | `é`      | `C3 A9`                         |
| `cjk`             | `猫`     | `E7 8C AB`                      |
| `emoji`           | `🙂`     | `F0 9F 99 82`                   |
| `mixed` (default) | `Aé猫🙂` | `41 C3 A9 E7 8C AB F0 9F 99 82` |

Six fixed edit presets over the mixed bytes demonstrate the validity rules:

| Preset                 | Bytes                                  | Decode result                                         |
| ---------------------- | -------------------------------------- | ----------------------------------------------------- |
| `original`             | `41 C3 A9 E7 8C AB F0 9F 99 82`        | valid, `Aé猫🙂`                                       |
| `truncated`            | last byte removed                      | invalid, missing continuation at the end              |
| `overlong`             | `41` replaced by `C1 81`               | invalid, overlong encoding                            |
| `surrogate`            | first `é` bytes replaced by `ED A0 80` | invalid, surrogate code point at byte 2 (`A0`)        |
| `out-of-range`         | emoji bytes replaced by `F4 90 80 80`  | invalid, code point above `U+10FFFF` at byte 7 (`90`) |
| `corrupt-continuation` | second byte `A9` changed to `41`       | invalid continuation at byte 2; offending byte `41`   |

## Learner trajectory

1. Read the fixture text and its encoded bytes.
2. Predict whether the next edit keeps the sequence valid UTF-8.
3. Apply a byte edit (choose byte index and new value), or load a fixed preset.
4. Inspect the before/after bytes and the validation evidence: valid decode characters, or the exact rule violated and at which byte.
5. Reset to the original bytes and try another edit or preset.

Prediction is optional and non-blocking. There is no submit/check gate, score, or hidden validation workflow.

The UI renders every current byte as an indexed byte tile (hex plus decimal value). After each intervention it compares the complete resulting sequence with the exact original fixture bytes. This exact-original repair comparison is feedback only: it reports equality, length mismatch, and differing indices without blocking another edit. Truncated and overlong sequences remain diagnostics; they are not repair tasks with a completion gate.

## Domain contract

The feature owns a pure UTF-8 decoder and edit machine under `src/features/byte-edit/domain/**`:

```ts
export type ByteEditScenario = {
  id: ByteEditScenarioId;
  title: string;
  text: string;
  bytes: readonly number[];
};

export type DecodeResult =
  | { valid: true; characters: string; codePoints: readonly number[] }
  | { valid: false; reason: string; at: number; offendingByte?: number };

export type ByteEditMachine = { bytes: readonly number[] };

export type ByteEditFrame = {
  index: number;
  before: ByteEditSnapshot;
  after: ByteEditSnapshot;
  edit: { byteIndex: number; value: number } | { preset: ByteEditPresetId };
  predictedValid?: boolean;
  decode: DecodeResult;
};
```

`decodeUtf8(bytes)` is a deterministic, feature-local full-sequence validator covering: ASCII bytes, two/three/four-byte leads, continuation-byte positions, overlong rejection (`C0/C1`, `E0` with low continuation, `F0` with low continuation), surrogate rejection (`ED A0..BF`), range rejection (`F4` above `U+10FFFF`, leads above `F4`), unexpected continuation bytes, missing continuation bytes, and truncated sequences. It returns either decoded characters plus code points, or the exact rule name, offending byte index, and offending byte whenever a byte exists. Raw non-integer or out-of-range input is rejected deterministically before decoding. The domain uses `TextEncoder` only when validating author-provided scenario text against its fixture bytes; the decoder itself uses no `TextDecoder`.

`stepByteEdit(machine, scenario, edit)` applies one byte change (validating bounds and value range) or loads one preset, then validates and decodes the resulting sequence and returns fresh before/after snapshots plus a frame. There is deliberately no run-all: every edit is an intervention, so one step is exactly one applied edit. Preset load is validated against the known preset table.

Scenario validation rejects unknown IDs, titles, empty text, and byte sequences that do not match the UTF-8 encoding of the text. Edit validation rejects out-of-range byte indices and non-integer byte values outside `0..255`.

## Evidence requirements

The selected frame must make the edit's effect explainable without replay:

- edit detail (byte index, old value, new value) or preset name;
- before/after full byte sequences;
- decode evidence: characters and code points when valid, or rule name, offending byte index, and exact offending byte when invalid;
- predicted-valid flag when recorded.

The UI renders a semantic edit trace, selected-edit evidence, a live current-decoding status, preset buttons, and textual rule evidence. It does not use a shared BitGrid or hex-editor component.

## Independent test oracle and review gate

Tests hand-author the exact decode results for the valid mixed sequence and for each invalid rule (`truncated`, `overlong`, `surrogate`, `out-of-range`, `corrupt-continuation`, `unexpected continuation`, `invalid lead byte`), including the distinction between missing and invalid continuation bytes and exact offending-byte evidence. They also cover raw byte preconditions, edit bounds, and scenario validation. They separately test preset loading, prediction handling, keyboard frame selection, and narrow viewport evidence.

The design must explicitly answer:

- Is one byte-edit step an applied edit, and why is there no run-all?
- Is `decodeUtf8` a generic Validator or a feature-local full-sequence rule check?
- Does editable finite representation now get tested without a text editor or shared BitGrid?
- Is the edit trace an immutable causal history that stays feature-local?
