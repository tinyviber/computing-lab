# Monte Carlo — learner study

Evidence: 4 independent blinded persona passes. Rendered route: `/labs/monte-carlo`.

## Intended objective

Estimate π from random points in a square and quarter-circle: `4 × inside / total`. A seeded stream makes a run reproducible; larger N usually reduces fluctuation but is not guaranteed to be closer on every run. Learners should distinguish accuracy from precision and reject “first time inside a target band” as proof.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Stepped batches, compared small/medium/large and seeds. | Estimate is a noisy ratio; seed controls repeatability. | Seed/fixture/batch/frame labels. |
| Impatient explorer | Ran small and large fixtures; used final estimate. | Larger N looks steadier, not monotonically better. | Optional prediction often skipped. |
| Careful low-prior | Inspected count, error, and batch trace. | A path can move away from π before improving. | Accuracy versus precision vocabulary. |
| Strong computing | Changed seeds and tested stopping heuristics. | Need preselected N, independent seeds, spread/error; fixed seed alone is not proof. | None blocking. |

## Observed interaction and transfer

All four solved: 7856/10000 gives 3.1424; 500 versus 50000 usually fluctuates less at larger N but is not guaranteed closer; fixed seed is reproducible but “first entering target band” is not convergence evidence. Step/Run, seed, batch trace, and comparison were the useful surfaces.

## Alignment

**Strong.** The honest convergence objective survived transfer. Page/concept self-scores were about 4–5/5. Optional prediction and accuracy/precision wording are P1/P2 teaching opportunities.

## 5–15 minute teacher flow

Hook: ask whether the estimate must move closer every batch. Commit. Step several batches; compare same N/different seed and small/large N. Inspect inside/total/error and batch path. Name estimator, seed, fluctuation, accuracy, and precision. Transfer: evaluate a fixed N across independent seeds; reject first-band stopping. Teacher silence target: 4/5.

