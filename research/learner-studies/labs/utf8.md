# UTF-8 — learner study

Evidence: fresh-browser simulated-persona fallback after subagent-thread exhaustion. Rendered route: `/labs/utf8`.

## Intended objective

Show why Unicode scalar ranges use 1, 2, 3, or 4 UTF-8 bytes. Learners should read the branch decision, template bits, and resulting bytes, then transfer to byte grouping and safe stream boundaries. The mixed fixture is `Aé猫🙂`.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Predicted branch/byte count; stepped mixed fixture. | Four visible code points can produce 10 bytes; each range has a template. | Needed distinction between code point and byte. |
| Impatient explorer | Ran Emoji fixture. | One visible emoji is four bytes. | Mostly skipped explanatory prose. |
| Careful low-prior | Stepped CJK and read U+ hex/binary/template evidence. | Range determines continuation count and byte layout. | Safe split rule needs explicit transfer prompt. |
| Strong computing | Ran ASCII and compared byte counts. | Boundaries are after 1,2,3,4-byte groups; carry trailing bytes across chunks. | None blocking. |

## Observed interaction

Mixed trace: U+0041 → 1 byte; U+00E9 → 2; U+732B → 3; U+1F642 → 4; total 10 bytes. Emoji evidence showed `11110xxx 10xxxxxx 10xxxxxx 10xxxxxx` and bytes `240 159 153 130`. CJK showed the 3-byte template and bytes `231 140 171`.

## Frozen transfer

Expected lengths: U+0041 = 1, U+00E9 = 2, U+4E2D = 3, U+1F600 = 4. In `E2 82 AC 41 C3 A9`, groups are `E2 82 AC | 41 | C3 A9`; safe split points are after bytes 3, 4, and 6. In `F0 9F 92 A9 58 E2 98 83 C3 A9`, safe points are after 4, 5, 8, and 10; carry at most 3 trailing bytes.

## Alignment

**Strong.** The branch/evidence model was easy to teach and transfer. Main improvement: put safe-boundary transfer beside the byte trace, not only in teacher explanation.

## 5–15 minute teacher flow

Hook: four visible characters, ten bytes. Commit to the next branch. Step mixed fixture one code point at a time. Contrast ASCII, CJK, and emoji. Name scalar range, lead byte, continuation byte, and template. Transfer safe chunk split points. Teacher silence target: 4/5.

