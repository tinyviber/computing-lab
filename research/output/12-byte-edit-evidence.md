# Byte Edit: architecture evidence

**Scope:** tenth heterogeneous reference course and the narrow editable-finite-representation experiment that UTF-8 explicitly deferred.

**Branch:** `feat/byte-edit-reference-course`

**Review status:** design gate and implementation reviewed with strict self-review using the same checklist as the independent reviewers (infra for subagent reviews was unavailable this session). The hand-authored decode oracles cover every validity rule.

**Implementation status:** feature-local course complete. No shared byte-editor, hex-editor, decoder, or BitGrid primitive extracted.

## 1. Course question and boundary

> When a learner edits one byte of a fixed UTF-8 sequence, which rules keep the sequence valid, and what does an invalid sequence decode to?

Byte Edit is not a text editor and not a general hex editor. It reuses the five known UTF-8 fixtures so the encoded bytes are already familiar, and the learner edits one byte at a time or loads one of six presets:

| Preset                 | Bytes                          | Decode result                         |
| ---------------------- | ------------------------------ | ------------------------------------- |
| `original`             | the fixture's own bytes        | valid                                 |
| `truncated`            | last byte removed              | missing continuation at byte 9        |
| `overlong`             | `C1 81` in place of `41`       | overlong encoding at byte 0           |
| `surrogate`            | `ED A0 80` in place of `C3 A9` | surrogate code point at byte 1        |
| `out-of-range`         | `F4 90 80 80` for the emoji    | code point above `U+10FFFF` at byte 6 |
| `corrupt-continuation` | second byte `A9` → `41`        | missing continuation at byte 2        |

The course trajectory is:

```text
predict whether the next edit stays valid
→ apply one byte edit or load a preset
→ inspect before/after bytes and the exact decode rule
→ reset to the fixture's own bytes and try again
```

## 2. Domain evidence

The feature owns a pure full-sequence UTF-8 decoder and a feature-local edit machine under `src/features/byte-edit/domain/**`:

- `decodeUtf8(bytes)` covers ASCII bytes, two/three/four-byte leads, continuation positions, overlong rejection (`C0/C1`, `E0` with low continuation, `F0` with low continuation), surrogate rejection (`ED A0..BF`), range rejection (`F4` above `U+10FFFF`, leads above `F4`), unexpected/missing continuation bytes, and truncated sequences, returning decoded characters and code points when valid or the exact rule name plus offending byte index when invalid;
- `stepByteEdit(machine, scenario, edit, presets, predictedValid?)` applies one byte change (validating index bounds and `0..255` value range) or loads one preset, then validates and decodes the resulting sequence with fresh before/after snapshots;
- there is deliberately no run-all: every edit is an intervention, so one step is exactly one applied edit;
- `original` preset restores the current fixture's own bytes, so resetting after edits is a first-class operation;
- scenario validation rejects unknown IDs, empty titles/text, and byte sequences that do not match the UTF-8 encoding of the text.

## 3. Independent test evidence

The domain oracle hand-authors, without deriving from the production runner:

- the exact valid decode of the mixed sequence (`Aé猫🙂`, code points `41 E9 732B 1F642`);
- the exact invalid decode for every preset, including rule name and offending byte index;
- standalone rule cases: `80` (unexpected continuation), `FF` (invalid lead), `C2` alone (missing continuation), `E0 80 80` and `F0 80 80 80` (overlong), and the empty sequence;
- edit bounds and value-range rejection, unknown-preset rejection, byte-edit frame evidence, preset loading, and original-restore;
- malformed scenario rejection (byte/text mismatch, empty title).

Lesson tests verify prediction attach-to-frame, preset apply, bad-edit messaging, frame selection bounds, and URL-baseline sync.

## 4. Accessibility and UI evidence

The page exposes:

- a labeled fixture card with the encoded bytes;
- a validity prediction select with optional non-blocking feedback;
- byte-index and new-value controls with bounds, plus Apply edit;
- six preset buttons with descriptive labels;
- a live current-sequence region showing the hex bytes and the current decode status as text;
- native focusable edit buttons with edit number, edit detail, and valid/invalid in their accessible names;
- `aria-current` on exactly the selected edit with Enter/Space activation;
- selected-edit evidence with before/after bytes, predicted-vs-observed status, decode rule, and preset note;
- a real Playwright `520×900` responsive test specification.

The UI never decodes bytes itself (it only projects the domain `decodeUtf8` result) and contains no `TextEncoder`/`TextDecoder` usage.

## 5. What Byte Edit does to primitive hypotheses

| Hypothesis                                         | Result                    | Evidence                                                                                                       | Decision                                    |
| -------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| editable finite representation                     | STRENGTHENED              | Learner edits one byte of a fixed sequence and reads the exact validity rule; no text editor or BitGrid needed | Keep feature-local; no shared editor        |
| full-sequence validation                           | STRONGER locally          | `decodeUtf8` is a table-specific rule check, not a generic Validator                                           | Reject generic Validator                    |
| immutable causal evidence                          | STRONGER, but still local | Immutable edit frames explain one intervention without replay                                                  | Keep feature-local; no generic Trace export |
| pure discrete step                                 | SPLIT / narrowed          | One step is one applied edit, distinct from code points, queue events, batches, queries, and statements        | Reject universal Stepper                    |
| linear trace                                       | FALSIFIED as universal    | Edit histories are neither statement traces nor schedule queues                                                | No shared trace runtime                     |
| prediction → intervention → observation → evidence | STRONGER                  | Validity prediction precedes the byte edit and observed decode                                                 | Keep authoring convention local             |
| before/after comparison                            | STRONGER locally          | Before/after byte sequences explain one edit's effect                                                          | Do not create generic comparator            |
| tables                                             | UNCHANGED                 | Byte Edit uses textual evidence rather than tables                                                             | No generic table primitive                  |
| seeded random stream                               | UNCHANGED                 | Byte Edit is deterministic and non-random                                                                      | Monte Carlo remains its own model           |
| provenance/lineage                                 | UNCHANGED                 | No joins or aggregates                                                                                         | Relational Data remains its own model       |

## 6. Trace comparison after Byte Edit

Byte Edit frames are the sixth distinct step semantics: statements, scheduled queue events, code points, batches of random samples, fixed query results, and applied byte edits. Each has its own vocabulary, evidence fields, and lifecycle; no shared runtime accommodates all six.

Byte Edit and UTF-8 are deliberately coupled by fixture (same five texts and byte sequences) but remain separate features: UTF-8 explains the encode path, Byte Edit tests the decode/validity path with learner edits. The shared bytes are author data, not shared code.

## 7. Extraction decision

**No production primitive is extraction-ready.**

Byte Edit closes the last major hypothesis gap — editable finite representation — with a feature-local experiment, and adds a seventh falsification of a universal step/trace runtime. A tiny immutable evidence-item data shape remains a research hypothesis only.

## 8. Replanning

With scheduler/clock (Protocol), representation path (UTF-8), seeded random stream (Monte Carlo), provenance/constraints/derived cells (Relational Data), and editable finite representation (Byte Edit) all tested, the course experiment series is complete. The remaining work is the mission deliverable: dependency graph, branches/commits, final primitive matrix, cleanup recommendation, and architecture assessment.

## 9. Validation record

Passing local checks:

- `bun run format:check`;
- `bun run lint`;
- `bun run typecheck`;
- constrained `bun run test:run -- --maxWorkers=1 --minWorkers=1` — **56 test files, 329 tests passed**;
- `bun run build`.

`bun run test:e2e` remains environment-blocked: all browser tests fail at Playwright launch because Chromium is missing at the configured cache path. This affects the existing repository E2E suite as well as Byte Edit and is not a product correctness result.
