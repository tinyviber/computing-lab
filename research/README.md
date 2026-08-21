# Research archive policy

This directory keeps durable, decision-level research summaries for Computing Lab. It is not a source dump or an implementation backlog.

## What is versioned

- `output/00-knowledge-inventory.md` — historical curriculum-coverage baseline.
- `output/01-brainstorm-candidates.md` — converged candidate pool from an earlier ideation stage.
- `output/02-candidate-evaluation.md` — historical multi-perspective candidate evaluation.
- `output/03-precedent-research.md` — external precedent index and source links.
- `output/04-interaction-primitives.md` — historical hypothesis registry only.
- `output/05-image-encoding-natural-course-model.md` — feature-specific Image course model.
- `output/06-primitive-foundation-research.md` — long-term primitive hypothesis foundation research.
- `output/07-program-execution-evidence.md` — Program Execution course implementation evidence and primitive matrix update.
- `output/08-protocol-process-evidence.md` — Protocol Process course implementation evidence and scheduler/trace hypothesis update.
- `output/09-utf8-evidence.md` — UTF-8 course implementation evidence and representation-path hypothesis update.
- `output/10-monte-carlo-evidence.md` — Monte Carlo π course implementation evidence and seeded-random-stream hypothesis update.
- `output/11-relational-data-evidence.md` — Relational Data course implementation evidence and provenance/constraint hypothesis update.
- `output/12-byte-edit-evidence.md` — Byte Edit course implementation evidence and editable-finite-representation hypothesis update.
- `output/13-mission-deliverable.md` — final mission deliverable: dependency graph, branches/commits, primitive matrix, extraction decisions, cleanup, and architecture assessment.
- `learner-studies-v1/` — historical direct interaction observations retained from the superseded v1 simulation; not a learning-claim authority.

These are research records, not current architecture authority. Current product and boundary decisions live in `docs/`, especially `docs/architecture.md`, `docs/course-model-reset.md`, and `docs/primitive-extraction-review.md`.

## Research authority and implementation boundary

A research report is not an implementation roadmap. `learner-studies-v2/methodology.md` is the current authority for learner-study methodology. Simulated evidence is mainly evidence about interaction, salience, and copy/terminology hypotheses; human learning claims require human evidence. Historical recommendations are not architecture authority. Build feature-local first; consider a shared abstraction only after at least two real compatible consumers and a stable semantic invariant establish that boundary.

## What is intentionally excluded

- Full textbook transcription, scans, OCR, or reconstructed tables. `source/README.md` retains only a bibliographic locator.
- Intermediate role/subagent reports when their result is represented by a retained synthesis.
- Generated OS metadata such as `.DS_Store`.

## Using historical recommendations

A research recommendation is not an approved implementation task. In particular, `04-interaction-primitives.md` predates the three completed reference courses and is superseded as an extraction recommendation by `docs/primitive-extraction-review.md`. A future course must be designed feature-local first and may reopen a hypothesis only after real compatible consumers establish a stable invariant.

## Adding future research

A retained report must state its scope/date, distinguish observed facts from hypotheses, use lawful source locators instead of copied source material, and link any superseding decision. Preserve independent summaries only when they add decision-relevant evidence beyond an existing synthesis.
