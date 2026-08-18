# Byte Edit — learner study

Evidence: 4 independent blinded persona passes. Rendered route: `/labs/byte-edit`.

## Intended objective

Edit one byte in a known UTF-8 sequence. Predict, apply, and inspect before/after decoding. Learners should use lead-byte/follower rules, special boundary rules, and whole-sequence validity; an invalid edit can affect the whole stream, and a repair may not be uniquely recoverable.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Tried Original, CJK, emoji, corrupt continuation; edited A9→AA/41. | Bytes group left-to-right; lead controls followers; validity is whole-stream. | Offending byte versus conceptual cause. |
| Impatient explorer | Used presets, then edited one byte. | One substitution can change a character or invalidate the stream. | “Original” looked like a new history frame. |
| Careful low-prior | Compared truncated, overlong, surrogate, out-of-range cases. | Boundary rules matter; repair can be underdetermined. | UI index base versus transfer’s one-based position. |
| Strong computing | Tested strict continuation and overlong sequences. | Validator rejects illegal lead/range combinations, not just malformed continuation. | None blocking. |

## Observed interaction and transfer

Learners found the byte string, one-byte edit, presets, before/after decode, and validity evidence. All four understood the strict examples: `41 E2 81 AC 21` valid; `41 E2 C2 AC 21` reject; `41 E0 82 AC 21` reject overlong; `41 E2 82 21 21` reject. Stream repair: position 7 `20→AC` is one valid substitution, but JSON bytes at one-based position 14 changed from `28` to any `80–BF` are not uniquely recoverable.

## Alignment

**Strong.** Transfer preserved whole-stream validity and underdetermined repair. Clarify position numbering and reset/history semantics.

## 5–15 minute teacher flow

Hook: predict whether A9→AA keeps the text valid. Apply one edit and inspect grouping. Contrast valid substitution, bad continuation, overlong, and surrogate/out-of-range presets. Name lead byte, continuation byte, boundary, whole-sequence validator, and underdetermined repair. Transfer a repair where several bytes could be plausible. Teacher silence target: 4/5.

