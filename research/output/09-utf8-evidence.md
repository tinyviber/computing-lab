# UTF-8: architecture evidence

**Scope:** seventh heterogeneous reference course and direct follow-up to the representation-path hypotheses left open by Audio/Image/Two's Complement.

**Branch:** `feat/utf8-reference-course`

**Review status:** design gate initially REWORK; revised design and implementation passed independent final review after exact branch-boundary coverage, explicit frame-state contract, narrowed editable-finite scope, per-fixture oracle assertions, and URL-reset baseline handling were added.

**Implementation status:** feature-local course complete. No shared scalar-encoder, byte-table, or bit-visualization primitive extracted.

## 1. Course question and boundary

> How does one Unicode code point become one, two, three, or four UTF-8 bytes, and why can byte length differ from visible character count?

UTF-8 does not repeat Image Encoding's sampling/quantization, Audio Encoding's waveform/bit-depth, or Two's Complement's fixed-width arithmetic. It is not a general text editor and deliberately does not test editable finite representation. The lesson uses instructor-authored text fixtures and exposes the scalar → branch → template → bytes path.

The course trajectory is:

```text
predict branch + final byte count
→ choose a fixed UTF-8 fixture
→ step one code point at a time
→ inspect scalar, branch, template, payload bits, resulting bytes
→ run to completion and compare visible count vs byte count
→ switch fixtures to observe the four UTF-8 ranges
```

The mixed fixture (`Aé猫🙂`) is the default because visible count (`4`) and byte count (`10`) diverge. Prediction is optional and non-blocking.

## 2. Domain evidence

The feature owns the pure scalar encoder under `src/features/utf8/domain/**`:

- `encodeCodePoint` validates safe-integer scalar values, negative values, values above `U+10FFFF`, and UTF-16 surrogate code points (`U+D800–U+DFFF`);
- explicit branch rules:
  - `U+0000–U+007F` → `0xxxxxxx`;
  - `U+0080–U+07FF` → `110xxxxx 10xxxxxx`;
  - `U+0800–U+FFFF` excluding surrogates → `1110xxxx 10xxxxxx 10xxxxxx`;
  - `U+10000–U+10FFFF` → `11110xxx 10xxxxxx 10xxxxxx 10xxxxxx`;
- per-frame evidence: character, scalar hex, 21-bit scalar binary, branch, template with payload placement, decimal and binary bytes, before/after output, cumulative byte count, and code-point count;
- `stepUtf8` processes exactly one code point and returns fresh before/after snapshots; `runUtf8` folds the same step; a complete machine is an identity-preserving no-op;
- the lesson reducer stores immutable frame history plus a selected-frame index, so selected evidence is read from stored snapshots with no replay or random-access derivation.

Author validation rejects malformed scenario text/code-point mismatches, surrogate-containing author data, and invalid scalar values, so bad author data never becomes a different byte sequence.

## 3. Independent test evidence

The domain oracle hand-authors, for all five fixtures, the exact branch, 21-bit scalar binary, template, byte decimal and binary strings, per-frame before/after output, and cumulative bytes — it does not derive expected results from the production encoder.

Coverage includes:

- exact UTF-8 branch boundaries `U+007F/U+0080`, `U+07FF/U+0800`, `U+FFFF/U+10000`;
- surrogate-adjacent rejection (`U+D7FF` accepted, `U+D800`/`U+DFFF` rejected);
- non-integer, unsafe-integer, negative, infinite, and out-of-range scalar rejection;
- mixed text producing `4` code points → `10` bytes;
- snapshot and byte-evidence independence;
- frame boundary and cumulative-output correctness;
- terminal identity-preserving no-op;
- URL fallback/serialization, prediction handling, frame keyboard selection, completion idempotence, URL-baseline sync, and narrow-viewport evidence in lesson/UI tests.

## 4. Accessibility and UI evidence

The page exposes:

- semantic source text with the fixture description;
- native focusable frame buttons with frame number, character, scalar, branch, and byte count in their accessible names;
- `aria-current` on exactly the selected frame with Enter/Space activation;
- selected-frame region with scalar hex, scalar binary, template, before/after output, and a real byte table;
- current encoding status, code points processed, visible code-point count, and bytes produced;
- labeled prediction branch and final-byte-count controls with recorded-prediction status text;
- labeled final byte output separate from the selected-frame region;
- a real Playwright `520×900` responsive test specification.

The UI does not run the encoder, split code points, compute bytes, or reconstruct a second oracle. It dispatches lesson actions and projects feature-local domain evidence.

## 5. What UTF-8 does to primitive hypotheses

| Hypothesis                                         | Result                    | Evidence                                                                                                          | Decision                                          |
| -------------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| representation transformation path                 | STRONGER                  | Scalar → branch → template → payload → bytes is an explicit per-code-point transform with independent evidence    | Keep feature-local; no shared encoder             |
| editable finite representation                     | UNCHANGED                 | Fixed fixtures deliberately isolate the transform; no learner-edited bytes                                        | Defer to a later byte-edit experiment             |
| immutable causal evidence                          | STRONGER, but still local | Immutable frame snapshots make a selected code point explainable without replay                                   | Keep feature-local; no generic Trace export       |
| pure discrete step                                 | SPLIT / narrowed          | UTF-8 step is one code point with template expansion, not a scheduled queue event or a statement execution        | Reject universal Stepper                          |
| byte rows / tables                                 | STRONGER locally          | Byte tables and evidence rows are useful but have fixture/transform-specific provenance                           | No generic table primitive                        |
| before/after comparison                            | STRONGER locally          | Before/after output bytes explain one code point's effect                                                         | Do not create generic comparator                  |
| prediction → intervention → observation → evidence | STRONGER                  | Branch and byte-count predictions lead to fixed fixture intervention and observed bytes                           | Keep authoring convention local                   |
| linear trace                                       | FALSIFIED as universal    | Code-point frames are not a scheduler queue (Protocol), a statement trace (Program), or a probe history (Network) | No shared trace runtime                           |
| seeded random stream                               | UNCHANGED                 | All outcomes remain deterministic                                                                                 | Monte Carlo remains the direct test               |
| provenance/lineage                                 | STRONGER locally          | Scalar identity → branch → template → bytes is a short causal chain                                               | Compare later with Relational Data; no extraction |
| deterministic simulation time                      | UNCHANGED                 | UTF-8 has no clock or scheduling                                                                                  | Protocol remains its own model                    |

## 6. Trace comparison after UTF-8

### UTF-8 vs Two's Complement

Both courses are static representation evidence with columns/rows, but the derivation differs:

- Two's Complement: fixed-width signed arithmetic over ripple columns with overflow flags;
- UTF-8: variable-length scalar encoding over branch/template/payload evidence.

A shared bit-grid or byte-table primitive would either hide the template semantics or force Two's Complement's arithmetic into a template shape. Neither is extractable.

### UTF-8 vs Image/Audio

Image and Audio are reconstruction paths (sampling → quantization → approximate source). UTF-8 is an exact, lossless mapping. The shared pattern is "representation path with per-step evidence," which is an authoring convention, not a runtime or data structure.

### UTF-8 vs Program/Protocol

UTF-8 steps are code-point expansions; Program steps are statement events; Protocol steps are scheduled queue events. The three courses now provide the strongest possible demonstration that "one pure step" is not a universal semantic: its meaning, event vocabulary, and evidence fields differ per feature, and no shared runtime accommodates all three.

## 7. Extraction decision

**No production primitive is extraction-ready.**

UTF-8 strengthens the representation-path hypothesis while leaving editable finite representation explicitly untested. It adds another falsification for a universal Stepper/trace runtime and provides no justification for a shared binary/bit visualizer or byte-table component.

A tiny immutable evidence-item data shape remains a research hypothesis only, with no compatible vocabulary or lifecycle across the seven implemented courses.

## 8. Replanning

UTF-8 delivered the intended representation-path experiment. The next experiment is **Monte Carlo π**, testing the still-unchanged seeded random stream hypothesis: a reproducible seed, a fixed number of samples, and convergence evidence. **Relational Data** follows to pressure provenance, constraints, derived cells, and query-result evidence.

## 9. Validation record

Passing local checks:

- `bun run format:check`;
- `bun run lint`;
- `bun run typecheck`;
- constrained `bun run test:run -- --maxWorkers=1 --minWorkers=1` — **41 test files, 274 tests passed**;
- `bun run build`.

`bun run test:e2e` remains environment-blocked: all browser tests fail at Playwright launch because Chromium is missing at the configured cache path. This affects the existing repository E2E suite as well as UTF-8 and is not a product correctness result.
