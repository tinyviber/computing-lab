# UTF-8 course design

**Status:** implementation-ready design; feature-local, no shared representation primitive extraction.

## Research question

> How does one Unicode code point become one, two, three, or four UTF-8 bytes, and why can byte length differ from visible character count?

This course is not a general text editor, Unicode encyclopedia, or generic bit-grid lesson. It uses instructor-authored text fixtures and exposes the transformation from scalar value to byte sequence.

## Fixtures

| ID       | Text     | Code points                    | Expected byte lengths |
| -------- | -------- | ------------------------------ | --------------------- |
| `ascii`  | `A`      | `U+0041`                       | `1`                   |
| `accent` | `é`      | `U+00E9`                       | `2`                   |
| `cjk`    | `猫`     | `U+732B`                       | `3`                   |
| `emoji`  | `🙂`     | `U+1F642`                      | `4`                   |
| `mixed`  | `Aé猫🙂` | `U+0041 U+00E9 U+732B U+1F642` | `1 + 2 + 3 + 4 = 10`  |

The mixed fixture is the default because it makes visible-character count (`4`) and byte count (`10`) diverge.

The domain oracle also tests exact branch boundaries `U+007F/U+0080`, `U+07FF/U+0800`, and `U+FFFF/U+10000`, plus surrogate-adjacent rejection (`U+D7FF`, `U+D800`, `U+DFFF`, `U+E000`). These boundary cases are not additional learner fixtures; they protect the representation rule.

## Learner trajectory

1. Read the mixed text and optionally predict the byte length of the next code point and the final byte count.
2. Choose a fixed fixture.
3. Step through one code point at a time.
4. Inspect the scalar value, Unicode code point, encoding branch, template bits, resulting bytes, and cumulative output.
5. Run to completion and compare visible code-point count with byte count.
6. Switch to ASCII, accent, CJK, and emoji to identify the four UTF-8 ranges.

Prediction is optional and non-blocking. There is no arbitrary text input, submit/check gate, score, or hidden validation workflow.

## Domain contract

The feature owns a pure scalar encoder and a feature-local finite transformation machine:

```ts
export type Utf8ScenarioId = "ascii" | "accent" | "cjk" | "emoji" | "mixed";

export type Utf8Machine = {
  nextIndex: number;
  status: "running" | "complete";
  bytes: readonly number[];
};

export type Utf8Snapshot = Utf8Machine;

export type Utf8Frame = {
  index: number;
  before: Utf8Snapshot;
  after: Utf8Snapshot;
  codePoint: number;
  character: string;
  branch: "1-byte" | "2-byte" | "3-byte" | "4-byte";
  codePointBinary: string;
  template: string;
  bytes: readonly number[];
  explanation: string;
};
```

The lesson reducer stores `frames: Utf8Frame[]` and `selectedFrameIndex` separately from the domain machine. Step appends the returned frame, Run folds the same step, and selecting a prior frame reads the immutable stored snapshot; no replay or random-access derivation is implied. Complete stepping is identity-preserving and does not append a frame.

`encodeCodePoint` validates safe integer scalar values, rejects negative values, values above `0x10FFFF`, and UTF-16 surrogate code points (`0xD800–0xDFFF`). It returns independently owned byte evidence. The four branch rules are explicit:

- `U+0000–U+007F`: `0xxxxxxx`;
- `U+0080–U+07FF`: `110xxxxx 10xxxxxx`;
- `U+0800–U+FFFF` excluding surrogates: `1110xxxx 10xxxxxx 10xxxxxx`;
- `U+10000–U+10FFFF`: `11110xxx 10xxxxxx 10xxxxxx 10xxxxxx`.

`stepUtf8(machine, scenario)` processes exactly one code point, appends its bytes, and returns fresh before/after snapshots. `runUtf8` folds the same step. A complete machine is an identity-preserving no-op.

## Evidence requirements

The selected frame must make the transformation path inspectable without replay:

- visible character and scalar value;
- Unicode code point in hexadecimal and binary;
- selected byte-length branch;
- template bits with code-point payload placement;
- resulting decimal and binary bytes;
- cumulative byte count and visible code-point count;
- before/after output bytes.

The UI renders semantic source text, a real byte table, labeled output, and textual branch/explanation evidence. Each stored frame is a native keyboard-focusable trace button; exactly the selected frame has `aria-current="true"`, Enter/Space select it, and Step/Run become disabled only at completion. The selected-frame region is labeled separately from the final byte output. It does not use a generic `BitGrid` or shared binary visualizer.

## Independent test oracle and review gate

Tests hand-author exact bytes, branch, binary byte strings, frame boundaries, and cumulative output for all five learner fixtures, plus the exact branch boundaries and surrogate-adjacent invalid values. They separately test invalid scalar values, output snapshot independence, scenario fallback, prediction handling, keyboard frame selection, completion idempotence, and narrow viewport evidence.

The design must explicitly answer:

- Is one UTF-8 step a code point, a byte, or a template expansion?
- Are byte rows a representation transformation or a generic table/bit-grid primitive?
- This course deliberately does not test editable finite representation: fixed fixtures isolate the scalar-to-byte transformation path, so that hypothesis remains unchanged for a later narrowly scoped byte-edit experiment.
- Does a code-point transformation path align with Image/Audio/Two's Complement, or require feature-specific provenance?
