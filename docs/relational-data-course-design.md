# Relational Data course design

**Status:** implementation-ready design; feature-local, no shared table/query/constraint primitive extraction.

## Research question

> How does a fixed set of rows answer a query, what do constraints protect, and why do derived cells and joins need provenance?

This course is not a SQL engine, a generic table component, or a generic validator. It uses one small instructor-authored library catalog (books, borrowers, loans) with one intentionally broken foreign key, and a fixed sequence of four queries.

## Fixtures

One scenario `catalog` with three tables and a fixed reference date `2026-01-15`:

- `books` (`id`, `title`, `author`, `year`, `available`): four rows — two available, two borrowed;
- `borrowers` (`id`, `name`): four rows, including one actual `NULL` and one empty string `""`;
- `loans` (`borrower_id`, `book_id`, `due`): four rows, one of which references a non-existent book (`book_id 99`), so validation has a real failure to expose.

## Query sequence

| Step | Query                                                                     | Result rows (fixed data)                                         |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | `all-books` — project the full books table                                | 4                                                                |
| 2    | `available-books` — filter `available = true`                             | 2                                                                |
| 3    | `overdue-loans` — join loans × borrowers × books where `due < 2026-01-15` | 1                                                                |
| 4    | `borrower-counts` — aggregate loans per borrower over the full join       | 3 (Kai's broken loan is absent; valid Kai loan preserves `NULL`) |

Step 4 is the derived-cell lesson: the count is computed, the missing book row explains why one Kai loan cannot appear, and the valid Kai loan keeps `NULL` as `NULL` rather than the string `"null"`.

## Learner trajectory

1. Read the fixture (three tables, row counts, one `NULL` name, one empty string, and one broken loan).
2. Optionally predict how many rows the next query will return.
3. Step one query at a time.
4. Select a result row and inspect the result table plus provenance: the referenced source rows and fields are highlighted for filters, joins, and aggregate groups.
5. Run to completion and compare predicted vs actual row counts.
6. Inspect the constraint panel: unique id, year range, `name IS NOT NULL`, and both foreign keys. `NULL` fails the not-null check; `""` passes because it is present text; the broken loan fails the book foreign key.

Prediction is optional and non-blocking. There is no arbitrary SQL input, editable database, submit/check gate, score, or hidden validation workflow. Before running, the page exposes a clear no-result state; an empty oracle result renders an empty result row and empty provenance state without creating a selectable row. Reset restores the canonical URL scenario baseline.

## Domain contract

The feature owns pure relational semantics under `src/features/relational-data/domain/**`:

```ts
export type RelationalQueryId =
  "all-books" | "available-books" | "overdue-loans" | "borrower-counts";

export type RelationalQueryResult = {
  id: RelationalQueryId;
  title: string;
  description: string;
  columns: readonly string[];
  rows: readonly RelationalQueryRow[];
  provenance: readonly RelationalProvenanceRow[];
};

export type RelationalSourceReference = {
  table: string;
  rowId: string;
  columns: readonly string[];
};

export type RelationalProvenanceRow = {
  resultRowId: string;
  sourceIds: readonly string[];
  sourceRefs: readonly RelationalSourceReference[];
  note: string;
};

export type RelationalMachine = {
  nextQueryIndex: number;
  status: "running" | "complete";
  results: readonly RelationalQueryResult[];
};
```

`runRelationalQuery(id, scenario)` is a pure function returning an independently owned result with:

- column names and typed values;
- one provenance row per result row naming the exact source row ids that produced it (matched rows for filters, matched pair ids for joins, and a stable union of every participating loan, borrower, and book row for aggregate groups);
- `sourceRefs` alongside the ids, naming source table, row, and contributing fields; the UI uses these references—not positional or text matching—to highlight source evidence;
- a textual explanation of the operation (project / filter / join / aggregate).

`stepRelational(machine, scenario)` runs the next query in the fixed sequence and returns fresh before/after snapshots plus the result. `runRelational` folds the same step. A complete machine is an identity-preserving no-op.

`validateRelational(scenario)` is a pure constraint check returning one result per constraint (unique `books.id`, `books.year >= 1900`, not-null `borrowers.name`, `loans.borrower_id` FK, `loans.book_id` FK) with a pass/fail flag and, on failure, the offending row id. Scenario validation requires every declared column, rejects unknown columns and wrong non-null types, permits actual `NULL`, validates dates, and rejects duplicate row ids. Nullable foreign keys pass the FK check but never join; a separate NOT NULL constraint would be needed to forbid them.

## Evidence requirements

The selected frame must make query results explainable without replay:

- query title, description, and predicted/actual row count;
- result table with columns and typed values;
- provenance rows naming source row ids;
- selectable result rows tracked as `selectedResultRowId`; selecting one highlights its provenance source rows and fields across the three fixture tables;
- derived cells (aggregate counts) flagged as computed;
- before/after result lists.

The empty result path is deliberate: result and provenance tables show “no rows” and the selection action is unavailable. Aggregate results preserve NULL as a typed value, missing foreign-key links are absent from join output but remain visible in the constraint/source evidence, and a selected aggregate row highlights every participating source reference.

The UI renders a semantic query trace, selected-query evidence, a fixed borrower source table that labels `NULL` and `""`, a constraint panel, and a predicted-vs-actual comparison table. It does not use a generic table, validator, or query component.

## Independent test oracle and review gate

Tests hand-author the exact result rows and provenance for all four queries and the exact five constraint outcomes, without deriving expected values from the production runner. They separately test `NULL` versus `""`, typed/null join behavior, row type/column validation, query-sequence boundaries, projection/filter/join/aggregate formulas, scenario validation, prediction handling, keyboard frame selection, completion idempotence, and narrow viewport evidence.

The design must explicitly answer:

- Is one relational step a query result, a row, or a constraint check?
- Are derived cells and provenance feature-local evidence or a generic table primitive?
- Is constraint validation a generic Validator or a table-specific check?
- Does prediction → intervention → observation → evidence hold for fixed data without a shared workflow?
