# Relational Data — learner study

Evidence: 4 independent blinded persona passes. Rendered route: `/labs/relational-data`.

## Intended objective

Use fixed books/borrowers/loans data to observe filters, joins, aggregates, NULL versus empty string, broken foreign keys, derived cells, constraints, and provenance. The query sequence is designed so learners ask why rows disappear or zero-fill.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Ran all-books, available, overdue, borrower-count queries; opened provenance. | Filters/joins/aggregates explain result counts; provenance points back to inputs. | Derived/projection/aggregate terms. |
| Impatient explorer | Ran all queries first, then inspected surprising counts. | Broken FK can remove a row; NULL is not an empty string. | Inner versus left-preserving join. |
| Careful low-prior | Stepped query stages and constraints. | Missing values need explicit policy; zero rows can be preserved intentionally. | COUNT/SUM with NULL. |
| Strong computing | Tested typed import and driver/tip analogy. | Conversion and FK validation are separate; orphan tip excluded. | Exact import behavior not directly visible. |

## Observed interaction and transfer

All four found the fixed tables and query controls. Observed counts included all-books 4, available 2, overdue 1, borrower counts 3; learners used provenance/constraints to explain the surprising rows. Transfer model: empty string and NULL differ; use `IS NULL`; convert integer FK input explicitly, reject blank unless policy maps it to NULL, and require nullable schema for NULL. Drivers/tips: D1=7, D2=0, D3=0; D1 provenance deliveries 101/102 and tips 5/2/NULL; orphan tip 105 excluded.

## Alignment

**Strong core; partial type-import boundary.** The query/provenance/NULL objective transferred. The exact import rule needs either a visible evidence fixture or an explicit teacher note.

## 5–15 minute teacher flow

Hook: predict overdue and borrower counts. Step one query; inspect the row that disappears and its provenance/constraint reason. Contrast NULL with empty string and inner with left-preserving join. Name filter, join, aggregate, NULL, FK, and provenance. Transfer the driver/tip case and typed import policy. Teacher silence target: 3/5.

