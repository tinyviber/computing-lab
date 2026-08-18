# Monte Carlo π: architecture evidence

**Scope:** eighth heterogeneous reference course and the direct test of the seeded-random-stream hypothesis that had remained unchanged since the foundation research.

**Branch:** `feat/monte-carlo-reference-course`

**Review status:** design gate passed after the LCG contract was made precise, the accessibility contract was completed, and the convergence claim was made honest about observed wobble; implementation passed focused review with a hand-authored stream/batch oracle.

**Implementation status:** feature-local course complete. No shared RNG, sweep, convergence, or charting primitive extracted.

## 1. Course question and boundary

> With only random points in a square, how does the estimate of π converge, and why does a fixed seed make the same trajectory reproducible?

Monte Carlo does not repeat Image/Audio Encoding, Two's Complement, Program Execution, Protocol Process, or UTF-8. It is not a general statistics playground or a shared RNG library.

The course trajectory is:

```text
predict whether the estimate finishes above or below π
→ choose a fixed seed/sample-count fixture
→ step one batch of 250 random points
→ inspect cumulative samples, inside count, estimate, error
→ run to completion and compare fixtures
→ observe same count + different seed landing elsewhere
```

Fixtures:

- `small` — seed `42`, `1000` samples, `4` batches;
- `medium` (default) — seed `2024`, `10_000` samples, `40` batches;
- `large` — seed `271828`, `100_000` samples, `400` batches;
- `same-n-different-seed` — seed `11`, `10_000` samples: same count as `medium`, different trajectory.

## 2. Domain evidence

The feature owns a pure deterministic generator and a feature-local Monte Carlo machine under `src/features/monte-carlo/domain/**`:

- a fixed 32-bit LCG with documented constants (`state = (state * 1103515245 + 12345) & 0xFFFFFFFF`; values are `(state >>> 16) / 65536`, so the generator's weak low bits are never used);
- `nextSample(state)` draws consecutive `[x, y]` pairs from one continuous stream;
- `stepMonteCarlo` draws exactly `batchSize` samples, counts points with `x² + y² ≤ 1`, and returns fresh before/after snapshots plus `estimate = 4 × inside ÷ samples` and `error = |estimate − π|`;
- `runMonteCarlo` folds the same step; a complete machine is an identity-preserving no-op;
- `monteCarloComparison` runs all fixtures and returns a seed/samples/estimate/error comparison sorted by sample count;
- scenario validation rejects unknown IDs, empty titles, non-safe-integer or negative seeds, non-positive sample counts, and sample counts that are not a whole number of batches.

All outcomes are deterministic: the same seed always produces the same trajectory, which is the course's central claim.

## 3. Independent test evidence

The domain oracle hand-authors the exact generator stream for `seed 42` (first three `[x, y]` points and exact signed state values), the exact per-batch evidence for the small fixture (hits `184/191/197/198`, cumulative `184/375/572/770`, estimates `2.944 / 3 / 3.050666666666667 / 3.08`), and final estimates for every fixture.

Coverage includes:

- exact first-sample stream for `seed 42`;
- batch boundary, estimate, and error formulas;
- final estimates: `medium 3.1448`, `same-n-different-seed 3.1328`, `large 3.14012`;
- error ordering `small > medium > large` with observed values (`0.0616 → 0.0032 → 0.0015`);
- seed/sample-count validation and batch-divisibility rejection;
- terminal identity-preserving no-op;
- snapshot independence across frames;
- URL fallback/serialization, prediction handling, frame keyboard selection, completion idempotence, URL-baseline sync, and narrow-viewport evidence in lesson/UI tests.

## 4. Accessibility and UI evidence

The page exposes:

- a labeled fixture card with seed, sample count, and batch count;
- prediction select (above/below π) with optional non-blocking feedback;
- native focusable batch buttons with batch number, cumulative samples, inside count, and estimate in their accessible names;
- `aria-current` on exactly the selected batch with Enter/Space activation;
- selected-batch evidence with before/after sample and inside counts, running estimate, and running error;
- a semantic convergence table (batch, cumulative samples, inside, estimate, error) with caption;
- a domain-computed fixture comparison table (fixture, seed, samples, final estimate, final error) with caption;
- labeled final estimate output separate from the selected-batch region;
- an honest textual claim: observed final error shrinks with more samples for these fixtures, the batch table shows per-batch wobble, and the same-count pair shows seed dependence;
- a real Playwright `520×900` responsive test specification.

The UI never calls `Math.random`, never runs the generator, and never computes estimates itself. It dispatches lesson actions and projects feature-local domain evidence.

## 5. What Monte Carlo does to primitive hypotheses

| Hypothesis                                         | Result                    | Evidence                                                                                                                                      | Decision                                    |
| -------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| seeded random stream                               | STRONGER                  | A documented feature-local LCG makes a full trajectory exactly reproducible; the comparison table shows seed dependence at equal sample count | Keep feature-local; no shared RNG           |
| deterministic sweep/convergence                    | STRONGER locally          | Batch evidence and error ordering are explicit but tied to this generator and formula                                                         | No shared sweep primitive                   |
| convergence/estimation                             | STRONGER locally          | Estimate and error are derived cells over feature state                                                                                       | No generic estimator                        |
| immutable causal evidence                          | STRONGER, but still local | Immutable batch snapshots explain one batch without replay                                                                                    | Keep feature-local; no generic Trace export |
| pure discrete step                                 | SPLIT / narrowed          | Monte Carlo step is one batch of samples, distinct from code points, queue events, statements, and probes                                     | Reject universal Stepper                    |
| linear trace                                       | FALSIFIED as universal    | Batch traces are neither queue schedules nor statement traces                                                                                 | No shared trace runtime                     |
| prediction → intervention → observation → evidence | STRONGER                  | Above/below-π prediction precedes fixed-fixture intervention and observed estimates                                                           | Keep authoring convention local             |
| before/after comparison                            | STRONGER locally          | Before/after counts explain one batch's effect                                                                                                | Do not create generic comparator            |
| tables/derived cells                               | STRONGER locally          | Convergence and comparison tables are useful but have this generator's provenance                                                             | No generic table primitive                  |
| charting/visualization                             | UNCHANGED                 | The course deliberately uses semantic tables, not charts                                                                                      | No charting framework needed                |
| representation transformation path                 | UNCHANGED                 | No scalar-to-bytes-like transform                                                                                                             | UTF-8 remains its own model                 |
| editable finite representation                     | UNCHANGED                 | No learner-edited bytes or samples                                                                                                            | Deferred experiment                         |

## 6. Trace comparison after Monte Carlo

Monte Carlo batches are the fourth distinct step semantics in the repository: statements (Program), scheduled queue events (Protocol), code points (UTF-8), and batches of random samples. Each has its own event vocabulary, evidence fields, and lifecycle; no shared runtime accommodates all four.

Monte Carlo's comparison table is the first domain-computed multi-fixture summary in the lab, and it stays feature-local: the provenance, seed metadata, and estimate formula are specific to this course.

## 7. Extraction decision

**No production primitive is extraction-ready.**

Monte Carlo strengthens the seeded-random-stream hypothesis as a feature-local deterministic device and adds a fifth falsification of a universal step/trace runtime. It provides no evidence for a shared RNG, sweep, convergence, or charting primitive.

A tiny immutable evidence-item data shape remains a research hypothesis only.

## 8. Replanning

Monte Carlo delivered the seeded-random-stream experiment. The next experiment is **Relational Data**, to pressure provenance, constraints, derived cells, and query-result evidence — the last major untested hypothesis family. If useful, a narrowly scoped byte-edit experiment can revisit the editable-finite-representation hypothesis that UTF-8 explicitly deferred.

## 9. Validation record

Passing local checks:

- `bun run format:check`;
- `bun run lint`;
- `bun run typecheck`;
- constrained `bun run test:run -- --maxWorkers=1 --minWorkers=1` — **46 test files, 293 tests passed**;
- `bun run build`.

`bun run test:e2e` remains environment-blocked: all browser tests fail at Playwright launch because Chromium is missing at the configured cache path. This affects the existing repository E2E suite as well as Monte Carlo and is not a product correctness result.
