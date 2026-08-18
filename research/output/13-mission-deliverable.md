# Mission deliverable: heterogeneous course experiments and primitive extraction decision

**Branch:** `feat/byte-edit-reference-course` (final); six feature branches, one commit each.

**Objective restated:** use heterogeneous courses as architectural experiments; extract shared primitives only when at least two compatible feature-local consumers remain and the design/skeptic/prototype/evaluation gates pass; every implemented course must strengthen, shrink, falsify, or leave unchanged one or more primitive hypotheses with explicit evidence.

## 1. Implemented courses and status

| #   | Course                 | Branch                                    | Commit     | Status            |
| --- | ---------------------- | ----------------------------------------- | ---------- | ----------------- |
| 1   | Audio Encoding (Sound) | pre-existing `main` history               | `0053478`+ | implemented, PASS |
| 2   | Image Encoding         | pre-existing `main` history (PR #11)      | `58cbba5`  | implemented, PASS |
| 3   | Home Network           | pre-existing `main` history (PR #10)      | `8ae2aa2`  | implemented, PASS |
| 4   | Two's Complement       | `feat/twos-complement-reference-course`   | `1b8e8c3`  | implemented, PASS |
| 5   | Program Execution      | `feat/program-execution-reference-course` | `ac7cfd2`  | implemented, PASS |
| 6   | Protocol Process       | `feat/protocol-process-reference-course`  | `1f622ef`  | implemented, PASS |
| 7   | UTF-8                  | `feat/utf8-reference-course`              | `f8a5d57`  | implemented, PASS |
| 8   | Monte Carlo π          | `feat/monte-carlo-reference-course`       | `21ee54e`  | implemented, PASS |
| 9   | Relational Data        | `feat/relational-data-reference-course`   | `b360c29`  | implemented, PASS |
| 10  | Byte Edit              | `feat/byte-edit-reference-course`         | `21b406c`  | implemented, PASS |

Deferred courses: broad SQL/relational DBMS, general text editor, general-purpose simulation toolkit, full networking simulator, audio production tools, and any course that would require a shared lesson runtime. These remain out of scope by design, not by failure.

No PRs were opened this session: the four pre-existing courses shipped via PRs #9–#11 on `main`; the six new courses are committed on local feature branches. The next step is to open PRs per branch or push and merge each feature branch (see §9).

## 2. Architecture under test

- `src/app` owns routing and catalog only.
- `src/features/<lab>/{domain,lesson,ui}` owns each course's semantics: pure domain, URL-scenario parsing, and a reducer-driven UI.
- `src/shared/lab` owns app chrome (LabShell) and interaction primitives only; it has no lesson semantics.
- Intended dependency direction `ui → lesson → domain` is enforced by `src/app/architecture-boundaries.test.ts` and per-feature UI architecture tests (no `BitGrid`, `ExperimentStatus`, `ParameterControl`, `FormulaPanel`, `VisualizationPanel`, `submit`/`check answer`/`score` surface).
- Domains are pure and free of React/router/browser APIs; `Math.random`, `setTimeout`, and `TextEncoder` appear only where a feature genuinely needs them, and are never in the step semantics.

## 3. Dependency graph

```text
src/app
  └─ router.tsx ──────────────┐  (routes /labs/*)
  └─ catalog/labs.ts ─────────┤  (registry, categories)
src/shared/lab
  └─ LabShell (app chrome, no semantics)
src/features
  ├─ audio-encoding   {domain → lesson → ui}
  ├─ image-encoding   {domain → lesson → ui}
  ├─ home-network     {domain → lesson → ui}
  ├─ twos-complement  {domain → lesson → ui}
  ├─ program-execution{domain → lesson → ui}
  ├─ protocol-process {domain → lesson → ui}
  ├─ utf8             {domain → lesson → ui}
  ├─ monte-carlo      {domain → lesson → ui}
  ├─ relational-data  {domain → lesson → ui}
  └─ byte-edit        {domain → lesson → ui}
```

There are no edges between features. Every feature imports only `src/shared/lab` (chrome), React, and TanStack Router. `src/shared/lab` imports no feature. This graph is the observable architecture: 10 isolated course models under one shell.

## 4. Pedagogy, domain, and review results per course

| Course            | Pedagogy                              | Domain contract                                                       | Review result                                                                          |
| ----------------- | ------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Program Execution | predict → trace variables/loop/print  | pure statement machine, before/after snapshots                        | PASS (reworked once: stopping-cause semantics added)                                   |
| Protocol Process  | predict → step scheduled queue events | queue/time machine, fault fixtures, timeout round-trip, stale-timeout | PASS (reworked twice: receiver-silent, validation, stale-timeout, per-fixture oracles) |
| UTF-8             | predict → step one code point         | scalar encoder, branch/template evidence                              | PASS (reworked once: boundary tests, frame contract, narrowed editability claim)       |
| Monte Carlo π     | predict above/below π → step batches  | feature-local LCG, estimate/error, comparison rows                    | PASS (reworked once: precise LCG, honest convergence claim)                            |
| Relational Data   | predict row count → step queries      | projection/filter/join/aggregate with provenance, 5 constraints       | PASS (one deliberate FK failure)                                                       |
| Byte Edit         | predict valid/invalid → apply edit    | full-sequence decoder, presets, edit machine                          | PASS (no run-all by design)                                                            |

Every course has: hand-authored domain oracles that never derive expected values from the production runner; scenario/authoring validation; URL-scenario hydration with fallback; semantic keyboard/ARIA evidence with `aria-current`; a narrow-viewport evidence test; and a Playwright trajectory spec.

## 5. Primitive evidence matrix (final)

| Hypothesis                                                                                                   | Evidence across courses                                                                                          | Decision                                                                                  |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| app-shell composition                                                                                        | LabShell hosts 10 independent workspaces                                                                         | STRENGTHENED — keep `src/shared/lab` chrome-only                                          |
| opaque scenario transport                                                                                    | all 10 courses hydrate a canonical URL                                                                           | STRENGTHENED — keep as authoring convention                                               |
| feature-owned deterministic model boundaries                                                                 | 10 pure domains with enforced `ui → lesson → domain`                                                             | STRENGTHENED — proven                                                                     |
| immutable causal evidence                                                                                    | Program frames, Protocol queue snapshots, UTF-8 frames, Monte Carlo batches, Relational results, Byte Edit edits | STRENGTHENED but local — no extraction                                                    |
| pure deterministic transitions                                                                               | step functions in 6 new courses                                                                                  | SPLIT/narrowed — step semantics differ (statement, event, code point, batch, query, edit) |
| linear trace / shared history                                                                                | 6 distinct trace shapes; none compatible                                                                         | FALSIFIED as universal                                                                    |
| universal `Stepper`/`LessonRuntime`                                                                          | 6 distinct step meanings, 4 more distinct models                                                                 | FALSIFIED                                                                                 |
| shared event bus / global clock                                                                              | Protocol owns queue/time; no other course needs it                                                               | REJECTED                                                                                  |
| `ExperimentEngine` / `VisualizationFramework` / `ScenarioCodec` / `ParameterPanel` / `BitGrid` / `LessonDSL` | no two compatible consumers                                                                                      | REJECTED                                                                                  |
| generic `Validator` / `Comparator` / `DataTable`                                                             | Relational constraints, Byte Edit decoder, result/comparison tables are all feature-specific                     | REJECTED                                                                                  |
| seeded random stream                                                                                         | Monte Carlo LCG is deterministic and feature-local                                                               | STRENGTHENED, not extraction-ready                                                        |
| representation transformation path                                                                           | UTF-8 scalar→bytes; Image/Audio reconstruction                                                                   | STRENGTHENED, not extraction-ready                                                        |
| editable finite representation                                                                               | Byte Edit edits one byte with explicit validity rules                                                            | STRENGTHENED, not extraction-ready                                                        |
| provenance/lineage                                                                                           | Relational provenance rows name source ids                                                                       | STRENGTHENED, not extraction-ready                                                        |
| before/after snapshots                                                                                       | useful everywhere, never universal                                                                               | KEEP feature-local                                                                        |
| prediction → intervention → observation → evidence                                                           | present in 6 new courses as a local convention                                                                   | STRENGTHENED as convention, not a workflow primitive                                      |

## 6. Extraction decision

**No production primitive is extraction-ready.** No two features share a compatible vocabulary, lifecycle, or evidence schema for any candidate primitive. The six new courses each falsified at least one earlier primitive hypothesis (universal step/trace/runtime, generic validator/table/comparator, shared RNG/clock/queue) while strengthening narrow feature-local hypotheses. A tiny immutable evidence-item data shape remains a research hypothesis only.

## 7. Cleanup recommendation

`docs/legacy-shared-cleanup-recommendation.md` already lists the unused legacy shared lesson components (`ExperimentStatus`, `ParameterControl`, `FormulaPanel`, `VisualizationPanel`) in `src/shared/lab`. Recommendation: remove them in one dedicated cleanup PR that touches no feature code; the feature architecture tests already prove no feature references them. Do not remove `LabShell` or other in-use chrome.

## 8. CI / local validation

On each feature branch, with constrained Vitest workers (`--maxWorkers=1 --minWorkers=1`) to respect the low-process-fan-out constraint:

- `bun run format:check` — PASS
- `bun run lint` — PASS
- `bun run typecheck` — PASS
- `bun run test:run -- --maxWorkers=1 --minWorkers=1` — final run **56 test files, 329 tests passed**
- `bun run build` — PASS

Final repo-wide suite on the last branch: 329 tests across 56 files, all green.

## 9. Next courses and next engineering steps

Course experiment series is complete. Next courses (from the research candidate pool) would extend breadth without new hypotheses: Recursion/Stack, Sorting, Boolean Logic, Relational SQL extensions, and a Markov chain course reusing the Monte Carlo generator pattern. Before those, the immediate engineering steps are:

1. Push the six feature branches and open one PR each (or merge sequentially) — no PRs exist yet.
2. Perform the §7 cleanup PR.
3. Install Playwright Chromium (`npx playwright install chromium`) in a CI environment and run `bun run test:e2e` — blocked locally (see below).
4. Re-run the final approval gate with the independent reviewer tooling once it is available, to convert the self-review gate results on UTF-8/Byte Edit (and the mid-session Monte Carlo/Relational reviews) into tooled PASS records.

## 10. Blockers

- **Playwright E2E cannot run locally**: Chromium is missing at the configured cache path. Every E2E test (existing and new) fails at `browserType.launch` with `Executable doesn't exist`. Environment-only; the E2E specs are written and the pre-existing suite fails identically, so this is not a product regression.
- **Independent reviewer subagent infrastructure failed repeatedly** during Monte Carlo, Relational Data, and Byte Edit gates; those gates used the same strict checklist as self-review. Re-run with tooling once available (§9.4).

## 11. Final architecture assessment

The course-first, primitives-later strategy succeeded: 10 heterogeneous courses now coexist under one shell with zero shared lesson semantics, and the primitive hypotheses that motivated the experiment have been tested against real, diverging step models rather than speculation. The architecture that survived is deliberately thin: `src/app` routing/registry, `src/shared/lab` chrome, and per-feature `{domain, lesson, ui}` ownership with an enforced dependency direction. Every extraction candidate that was rejected was rejected because the evidence showed incompatible vocabularies and lifecycles — not because extraction was too hard. The final state is a catalog of 10 independent reference courses, six of them added in this mission, each with design docs, evidence reports, oracles, accessibility, and validation records.
