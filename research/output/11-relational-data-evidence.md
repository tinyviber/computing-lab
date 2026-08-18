# Relational Data: architecture evidence

**Scope:** ninth heterogeneous reference course and the direct test of the provenance, constraint, derived-cell, and query-result hypotheses that had remained unchanged.

**Branch:** `feat/relational-data-reference-course`

**Review status:** design gate and implementation reviewed; hand-authored result/provenance oracles, the single FK failure, and the derived-cell flag scoping were verified. Independent reviewer infra was unavailable for the final gate, so strict self-review with the same checklist was used.

**Implementation status:** feature-local course complete. No shared table, query, or validator primitive extracted.

## 1. Course question and boundary

> How does a fixed set of rows answer a query, what do constraints protect, and why do derived cells and joins need provenance?

Relational Data does not repeat Image/Audio Encoding, Two's Complement, Program Execution, Protocol Process, UTF-8, or Monte Carlo. It is not a SQL engine, a generic table component, or a generic validator.

The course uses one fixed scenario `catalog` with three tables and reference date `2026-01-15`:

- `books` (`id`, `title`, `author`, `year`, `available`) — four rows, two available;
- `borrowers` (`id`, `name`) — three rows;
- `loans` (`borrower_id`, `book_id`, `due`) — three rows, one referencing the non-existent book `99`.

The course trajectory is:

```text
predict how many rows the next query returns
→ step one fixed query at a time
→ inspect result rows, provenance, and derived cells
→ run to completion and compare predicted vs actual
→ inspect the constraint panel with one deliberate FK failure
```

Queries and fixed results:

| Step | Query                                    | Rows                            |
| ---- | ---------------------------------------- | ------------------------------- |
| 1    | all books (project)                      | 4                               |
| 2    | available books (filter)                 | 2                               |
| 3    | overdue loans (join)                     | 1                               |
| 4    | loans per borrower (aggregate over join) | 2 — Kai's broken loan is absent |

## 2. Domain evidence

The feature owns pure relational semantics under `src/features/relational-data/domain/**`:

- `runRelationalQuery(id, scenario)` is a pure projection/filter/join/aggregate over the fixed tables;
- each result carries column names, typed values, and one provenance row per result row naming the exact source row ids (matched rows for filters, the loan/borrower/book triple for joins, source loan ids for aggregate groups);
- the aggregate result flags `loans` as a derived cell and explains that Kai's loan is absent because its book row is missing;
- `stepRelational(machine, scenario, predictedRows?)` runs the next query in the fixed sequence and returns fresh before/after snapshots plus the result; `runRelational` folds the same step; a complete machine is an identity-preserving no-op;
- `validateRelational(scenario)` checks five constraints — unique `books.id`, `books.year >= 1900`, not-null `borrowers.name`, both foreign keys — and reports exactly one failure (`loan-3` references missing book `99`);
- joins and FK checks key on column values (`books.id`/`borrowers.id`), while provenance names globally unique row ids (`book-3`, `person-1`, `loan-1`);
- scenario validation rejects malformed tables, unknown column types, duplicate row ids, bad dates, and empty titles.

## 3. Independent test evidence

The domain oracle hand-authors, without deriving from the production runner:

- the exact all-books rows and their per-row projection provenance;
- the exact available-books titles and provenance (`book-1`, `book-2`);
- the exact overdue-loans row (`loan-1`, Ada, A Wizard of Earthsea, `2026-01-10`) and its join provenance (`loan-1, person-1, book-3`);
- the exact aggregate rows (Ada 1, Lin 1) and provenance (`loan-1`, `loan-2`);
- all five constraint outcomes with the FK failure detail naming `loan-3` and `99`;
- one-query-per-step boundaries, terminal idempotence, snapshot/result independence, and malformed-scenario rejection.

Lesson tests verify prediction attach-to-frame, run-all completeness, frame selection bounds, URL-baseline sync, and completion idempotence.

## 4. Accessibility and UI evidence

The page exposes:

- a labeled fixture card summarizing tables and row counts;
- a row-count prediction control with optional non-blocking feedback;
- native focusable query buttons with query number, title, and predicted/actual rows in their accessible names;
- `aria-current` on exactly the selected query with Enter/Space activation;
- selected-query evidence: title, pseudo-SQL description, explanation, predicted-vs-observed status, derived-cell note (aggregate only), result table, and provenance table;
- a constraint panel with a captioned table of all five checks and the single FAIL row;
- a predicted-vs-actual comparison table built from stored frames;
- a real Playwright `520×900` responsive test specification.

The UI never executes SQL, runs queries, or checks constraints itself. It dispatches lesson actions and projects feature-local domain evidence.

## 5. What Relational Data does to primitive hypotheses

| Hypothesis                                         | Result                    | Evidence                                                                                                        | Decision                                    |
| -------------------------------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| provenance/lineage                                 | STRONGER                  | Every result row names the exact source row ids; the aggregate's missing source is the lesson                   | Keep feature-local; no shared lineage model |
| constraints/validation                             | STRONGER locally          | Five table-specific checks with one deliberate failure                                                          | Reject generic Validator                    |
| derived cells                                      | STRONGER locally          | Aggregate counts are flagged as computed, not stored                                                            | No generic table/derived-cell primitive     |
| query-result evidence                              | STRONGER locally          | Projection/filter/join/aggregate produce inspectable result and provenance tables                               | No shared query component                   |
| immutable causal evidence                          | STRONGER, but still local | Immutable query frames explain one result without replay                                                        | Keep feature-local; no generic Trace export |
| pure discrete step                                 | SPLIT / narrowed          | One relational step is one fixed query result, distinct from code points, queue events, batches, and statements | Reject universal Stepper                    |
| linear trace                                       | FALSIFIED as universal    | Query traces are neither statement traces nor schedule queues                                                   | No shared trace runtime                     |
| prediction → intervention → observation → evidence | STRONGER                  | Row-count prediction precedes fixed-query intervention and observed results                                     | Keep authoring convention local             |
| before/after comparison                            | STRONGER locally          | Before/after result lists explain one query's effect                                                            | Do not create generic comparator            |
| tables                                             | STRONGER locally          | Result/provenance/constraint/comparison tables are useful but table-specific                                    | No generic table lesson primitive           |
| seeded random stream                               | UNCHANGED                 | Relational data is fixed and non-random                                                                         | Monte Carlo remains its own model           |
| representation transformation path                 | UNCHANGED                 | No scalar-to-bytes transform                                                                                    | UTF-8 remains its own model                 |
| editable finite representation                     | UNCHANGED                 | No learner-edited rows                                                                                          | Deferred experiment                         |

## 6. Trace comparison after Relational Data

Relational frames are the fifth distinct step semantics: statements (Program), scheduled queue events (Protocol), code points (UTF-8), batches of random samples (Monte Carlo), and fixed query results (Relational). Each has its own vocabulary, evidence fields, and lifecycle; no shared runtime accommodates all five.

Relational Data is the strongest evidence yet that a generic Validator and a generic Table are dead ends: the constraint set, provenance schema, and derived-cell semantics are specific to this catalog, and the teaching value comes precisely from the domain-owned failure (`loan-3` → book `99`).

## 7. Extraction decision

**No production primitive is extraction-ready.**

Relational Data strengthens provenance, constraint, derived-cell, and query-result hypotheses as feature-local evidence and adds a sixth falsification of a universal step/trace runtime. A tiny immutable evidence-item data shape remains a research hypothesis only.

## 8. Replanning

With Protocol (scheduler/clock), UTF-8 (representation path), Monte Carlo (seeded random stream), and Relational Data (provenance/constraints/derived cells) implemented, the remaining untested hypothesis is **editable finite representation**. A narrowly scoped byte-edit experiment (e.g., editing payload bits of one UTF-8 code point with explicit validity rules) would close that gap without introducing a text editor or shared BitGrid. After that, the mission's final deliverable — dependency graph, branches/commits, primitive matrix, cleanup recommendation, and architecture assessment — can be assembled.

## 9. Validation record

Passing local checks:

- `bun run format:check`;
- `bun run lint`;
- `bun run typecheck`;
- constrained `bun run test:run -- --maxWorkers=1 --minWorkers=1` — **51 test files, 311 tests passed**;
- `bun run build`.

`bun run test:e2e` remains environment-blocked: all browser tests fail at Playwright launch because Chromium is missing at the configured cache path. This affects the existing repository E2E suite as well as Relational Data and is not a product correctness result.
