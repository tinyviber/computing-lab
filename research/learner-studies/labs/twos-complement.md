# Two's Complement — learner study

Evidence: 4 independent blinded persona passes. Rendered route: `/labs/twos-complement`.

## Intended objective

At fixed width, the same bit pattern has signed and unsigned readings. Learners should compute ripple addition, keep low N bits, distinguish carry-out from signed overflow, and use the sign-bit/range rule. The design target is the 4-bit `0111 + 0001 = 1000` question and its 8-bit interpretation; no full ALU or general converter is required.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Used 7+1, 15+1, and -8+-1 presets; toggled signed/unsigned. | Width preserves low bits; signed and unsigned read the same pattern differently. | “Primary reading” unclear. |
| Impatient explorer | Clicked overflow/carry examples and bit toggles. | Carry-out and signed overflow are separate evidence. | Dense ripple table. |
| Careful low-prior | Followed each bit and changed width from 4 to 8. | Same-sign inputs flipping sign signals signed overflow; carry alone does not. | Carry-in/out vocabulary. |
| Strong computing | Tested 127+1, 255+1, -128+-1, and FE+02. | `FE + 02 = 00` with carry 1 and no signed overflow. | Mixed-language labels; no free-response prediction gate. |

## Observed interaction

The headline result, fixed-width bit controls, signed/unsigned toggle, and ripple table drew attention. All four solved transfer: `11100101` is -27 in 8-bit signed; `11100010 + 00100110` stores `00001000`, carry-out 1, signed-valid; `10011100 + 10100111` stores `01000011`, carry 1, mathematical sum -189 needing 9 bits.

## Alignment

**Strong.** The core causal distinctions were teachable and transferred. Remaining issues are terminology and table density, not objective mismatch.

## 5–15 minute teacher flow

Hook: commit to `0111 + 0001` before showing the result. Change width and signedness. Inspect each ripple carry. Contrast carry-only (`FE+02`) with signed overflow (`127+1`). Name fixed width, sign bit, carry-out, and signed overflow. Transfer: -27 and the 9-bit sum. Teacher silence target: 4/5; only define “same pattern, two readings.”

