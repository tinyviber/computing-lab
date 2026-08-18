# Mission deliverable: heterogeneous course experiments

**Status:** implementation complete; six-PR stacked chain remains open and draft. No merge was performed.

This mission tested whether heterogeneous courses justify shared lesson primitives. The result is a thin application shell plus feature-owned `{domain, lesson, ui}` modules. No new shared semantic runtime was introduced.

## 1. Live PR chain

The chain was inspected against GitHub after rework. Heads below are the production heads validated before this documentation-only revision of PR #18:

| PR  | Course                     | Base                                              | Head                                                | CI result                       |
| --- | -------------------------- | ------------------------------------------------- | --------------------------------------------------- | ------------------------------- |
| #13 | Program Execution          | `feat/twos-complement-reference-course` `1b8e8c3` | `feat/program-execution-reference-course` `ac7cfd2` | `checks` + `e2e-base-path` pass |
| #14 | Protocol Process           | #13 `ac7cfd2`                                     | `feat/protocol-process-reference-course` `32d1c9c`  | `checks` + `e2e-base-path` pass |
| #15 | UTF-8                      | #14 `32d1c9c`                                     | `feat/utf8-reference-course` `2587490`              | `checks` + `e2e-base-path` pass |
| #16 | Monte Carlo π              | #15 `2587490`                                     | `feat/monte-carlo-reference-course` `d22664e`       | `checks` + `e2e-base-path` pass |
| #17 | Relational Data            | #16 `d22664e`                                     | `feat/relational-data-reference-course` `330984f`   | `checks` + `e2e-base-path` pass |
| #18 | Byte Edit + mission report | #17 `330984f`                                     | `feat/byte-edit-reference-course` `2d66f66`         | `checks` + `e2e-base-path` pass |

All six are open draft PRs. Final validation run IDs for the listed heads: #13 `32131820278`, #14 `32144927977`, #15 `32145097369`, #16 `32146042142`, #17 `32146575204`, and #18 `32147500998`.

The original live failures were repaired at their owning branches: #14 failed Prettier on `research/output/08-protocol-process-evidence.md`; #15 failed Prettier on `research/output/09-utf8-evidence.md`. The descendants were rebased so each PR owns only its feature evidence and later branches do not reintroduce those parent-file failures.

## 2. Required semantic fixes

### Protocol Process (#14)

- Removed the obsolete timeout outcome and its unreachable branch, documentation, tests, and UI references.
- The legal event model now requires a non-empty running queue, exact attempt progression, queued send requests at `attemptsSent + 1`, delivery/ACK events on the current attempt, at most one live timeout per attempt, and `attemptsSent <= maxAttempts`.
- Scenario attempts are bounded at 20. Receiver-silent runs therefore terminate through the bounded budget rather than relying on an unreachable stale-event case.
- Queue order and hand-authored event outcomes remain feature-owned; no shared clock or scheduler was added.

### Monte Carlo π (#16)

- Added a feature-local SVG geometry view derived from the same deterministic LCG stream as the estimate: unit square, quarter-circle boundary, inside/outside marks, axes, and textual counts.
- Each point carries a global zero-based `sampleIndex`, coordinates, and one domain-owned `inside` classification. The frame also carries the full-batch inside count.
- The selected frame displays the first `min(128, batchSize)` points, so the DOM remains bounded while full-batch and cumulative counts stay visible. No `Math.random`, UI RNG, second oracle, or generic chart primitive is used.

### Relational Data (#17)

- `null` is a real relational value distinct from `""`; typed equality rejects coercive matches and null never joins.
- A nullable null foreign key passes the FK check but contributes no join row; a separate NOT NULL constraint governs required values. `NOT NULL` rejects only `null`, so an empty string remains present and valid.
- Fixtures, source-row evidence, aggregate results, UI formatting, docs, and tests now show the null-versus-empty distinction. Malformed rows are rejected for unknown/missing columns and declared-type mismatches.

### Byte Edit (#18)

- The decoder distinguishes missing continuation bytes from present-but-invalid continuation bytes.
- Invalid results include the exact offending byte whenever one exists; examples include `C3 41` → invalid continuation at byte 1, offending `41`, and truncated `C3` → missing continuation at byte 1.
- Raw non-integer and out-of-range byte inputs are rejected deterministically before decoding. No `TextDecoder` is used. `TextEncoder` is used only at the authoring-validation boundary that checks fixture text against its declared bytes.
- The corrupt preset, UI evidence, tests, E2E spec, design doc, and research output all use the corrected taxonomy. Byte Edit has no terminal “done” lifecycle: each step is an applied edit intervention.

## 3. Ownership and architecture audit

The stacked diffs were checked at every boundary:

- #14 owns Protocol Process plus `research/output/08-protocol-process-evidence.md`.
- #15 owns UTF-8 plus `research/output/09-utf8-evidence.md`; its diff does not include the parent Protocol evidence.
- #16 owns Monte Carlo plus `research/output/10-monte-carlo-evidence.md`; its diff does not include parent Protocol or UTF-8 evidence.
- #17 owns Relational Data plus `research/output/11-relational-data-evidence.md`; its diff does not include earlier feature evidence.
- #18 owns Byte Edit plus `research/output/12-byte-edit-evidence.md` and this mission report; its diff does not include earlier feature evidence.

The surviving dependency graph is:

```text
src/app: router + catalog
        ↓
src/shared/lab: LabShell and app chrome
        ↓
src/features/<lab>/{domain,lesson,ui}: feature-owned semantics
```

No feature imports another feature. Domains contain deterministic course rules and authoring validation; UI projects domain results and owns feature-specific visualization. No shared `Stepper`, `TraceRuntime`, `PredictionGate`, `DataTable`, `Validator`, `Comparator`, `ScenarioCodec`, `ParameterPanel`, `BitGrid`, `ExperimentEngine`, or `LessonRuntime` was added.

## 4. Primitive evidence matrix

| Hypothesis                                         | Result                                                                                                  | Decision                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| App shell composition                              | 10 labs use the same chrome while keeping semantic models isolated                                      | Keep `LabShell`; strengthen shell-only ownership    |
| Pure deterministic step                            | Useful locally, but six courses step statements, queue events, code points, batches, queries, and edits | Keep feature-local; reject a universal Stepper      |
| Shared linear trace/history                        | Evidence shapes and lifecycles diverge                                                                  | Falsified as a universal runtime                    |
| Shared clock/event bus                             | Only Protocol needs queue/time semantics                                                                | Reject                                              |
| Generic Validator / Comparator / DataTable         | Constraint, decode, and result-table rules use different vocabularies                                   | Reject                                              |
| Shared RNG/chart engine                            | Monte Carlo uses one feature-local seeded stream and one feature-local SVG evidence view                | Reject                                              |
| Editable finite representation                     | Byte Edit is useful as a feature-local experiment                                                       | Strengthened, not extraction-ready                  |
| Immutable causal evidence                          | Helpful in every course, but fields and lifecycles differ                                               | Keep feature-local                                  |
| Prediction → intervention → observation → evidence | Repeats as an authoring convention                                                                      | Keep convention; do not encode a workflow primitive |

The extraction decision is therefore **no production semantic primitive is extraction-ready**. Shared app chrome is the only demonstrated cross-course reuse. The course series narrowed the hypotheses by implementing divergent consumers first.

## 5. Validation record

Local validation on the final production head before this report revision:

- `bun install --frozen-lockfile` — PASS
- `bun run format:check` — PASS
- `bun run lint` — PASS
- `bun run typecheck` — PASS
- `bun run test:run -- --maxWorkers=1 --minWorkers=1` — PASS, 56 files / 331 tests
- `bun run test:deploy` — PASS
- `bun run build` — PASS
- `bun run test:e2e` — environment-blocked locally: all 26 tests stopped at Playwright launch because Chromium is absent from the configured cache. No E2E assertion ran locally.

GitHub CI downloaded Chromium and passed both `checks` and `e2e-base-path` for all six listed PR heads, including #18 run `32147500998`.

The pre-existing unrelated untracked file `research/output/06-primitive-foundation-research.md` was preserved and is not part of this chain.

## 6. Recommendation

Keep the current thin architecture. A separate cleanup PR may remove unused legacy shared lesson components listed in `docs/legacy-shared-cleanup-recommendation.md`; it should not change feature semantics or remove `LabShell`. Defer broad SQL/DBMS, general text-editor, general simulation, and full networking-toolkit work until a concrete second compatible consumer appears.
