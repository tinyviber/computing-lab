# Relational Data course design

**Status:** implementation-ready design; feature-local, no shared table/query/constraint primitive extraction.

## Research question

> How does a fixed set of rows answer a query, what do constraints protect, and why do derived cells and joins need provenance?

This course is not a SQL engine, a generic table component, or a generic validator. It uses one small instructor-authored library catalog (books, borrowers, loans) with one intentionally broken foreign key, and a fixed sequence of four queries.

## Fixtures

One scenario `catalog` with three tables and a fixed reference date `2026-01-15`:

- `books` (`id`, `title`, `author`, `year`, `available`): four rows — two available, two borrowed;
- `borrowers` (`id`, `name`): three rows;
- `loans` (`borrower_id`, `book_id`, `due`): three rows, one of which references a non-existent book (`book_id 99`), so validation has a real failure to expose.

## Query sequence

| Step | Query                                                                     | Result rows (fixed data)        |
| ---- | ------------------------------------------------------------------------- | ------------------------------- |
| 1    | `all-books` — project the full books table                                | 4                               |
| 2    | `available-books` — filter `available = true`                             | 2                               |
| 3    | `overdue-loans` — join loans × borrowers × books where `due < 2026-01-15` | 1                               |
| 4    | `borrower-counts` — aggregate loans per borrower over the full join       | 2 (Kai's broken loan is absent) |

Step 4 is the derived-cell lesson: the count is computed, and the missing book row explains why Kai's loan cannot appear in the joined aggregate.

## Learner trajectory

1. Read the fixture (three tables, row counts, one broken loan).
2. Optionally predict how many rows the next query will return.
3. Step one query at a time.
4. Inspect the result table plus provenance: which source rows matched a filter, which pairs joined, and which group keys produced derived counts.
5. Run to completion and compare predicted vs actual row counts.
6. Inspect the constraint panel: unique id, year range, not-null name, and both foreign keys, with the broken loan reported as the single failure.

Prediction is optional and non-blocking. There is no arbitrary SQL input, submit/check gate, score, or hidden validation workflow.

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

export type RelationalMachine = {
  nextQueryIndex: number;
  status: "running" | "complete";
  results: readonly RelationalQueryResult[];
};
```

`runRelationalQuery(id, scenario)` is a pure function returning an independently owned result with:

- column names and typed values;
- one provenance row per result row naming the exact source row ids that produced it (matched rows for filters, matched pair ids for joins, source loan ids for aggregate groups);
- a textual explanation of the operation (project / filter / join / aggregate).

`stepRelational(machine, scenario)` runs the next query in the fixed sequence and returns fresh before/after snapshots plus the result. `runRelational` folds the same step. A complete machine is an identity-preserving no-op.

`validateRelational(scenario)` is a pure constraint check returning one result per constraint (unique `books.id`, `books.year >= 1900`, not-null `borrowers.name`, `loans.borrower_id` FK, `loans.book_id` FK) with a pass/fail flag and, on failure, the offending row id. Scenario validation rejects malformed tables, unknown column types, duplicate row ids, and query ids outside the fixed sequence.

## Evidence requirements

The selected frame must make query results explainable without replay:

- query title, description, and predicted/actual row count;
- result table with columns and typed values;
- provenance rows naming source row ids;
- derived cells (aggregate counts) flagged as computed;
- before/after result lists.

The UI renders a semantic query trace, selected-query evidence, a constraint panel, and a predicted-vs-actual comparison table. It does not use a generic table, validator, or query component.

## Independent test oracle and review gate

Tests hand-author the exact result rows and provenance for all four queries and the exact five constraint outcomes, without deriving expected values from the production runner. They separately test query-sequence boundaries, projection/filter/join/aggregate formulas, scenario validation, prediction handling, keyboard frame selection, completion idempotence, and narrow viewport evidence.

The design must explicitly answer:

- Is one relational step a query result, a row, or a constraint check?
- Are derived cells and provenance feature-local evidence or a generic table primitive?
- Is constraint validation a generic Validator or a table-specific check?
- Does prediction → intervention → observation → evidence hold for fixed data without a shared workflow?
