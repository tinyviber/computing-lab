# Monte Carlo π course design

**Status:** implementation-ready design; feature-local, no shared random-stream, sweep, or convergence primitive extraction.

## Research question

> With only random points in a square, how does the estimate of π converge, and why does a fixed seed make the same trajectory reproducible?

This course is not a general statistics playground or a shared RNG library. It uses a feature-local deterministic generator and instructor-authored seed/sample-count fixtures.

## Fixtures

| ID                      | Seed     | Samples   | Notes                                               |
| ----------------------- | -------- | --------- | --------------------------------------------------- |
| `small`                 | `42`     | `1000`    | coarse estimate, visible wobble                     |
| `medium`                | `2024`   | `10_000`  | tighter convergence                                 |
| `large`                 | `271828` | `100_000` | tightest of the three, still deterministic          |
| `same-n-different-seed` | `11`     | `10_000`  | same sample count as `medium`, different trajectory |

The default fixture is `medium` (`seed 2024`, `10_000` samples). The batch size is fixed at `250` samples per step so the course has `40` steps for `medium`; `small` has `4` steps, `large` has `400` steps.

## Learner trajectory

1. Read the fixture (seed + sample count) and optionally predict whether the estimate will finish above or below π and how far off it will be.
2. Step one batch at a time.
3. Inspect the batch index, cumulative samples, inside-count, running estimate, and running error.
4. Run to completion and inspect final estimate, error, and convergence claim.
5. Switch to `same-n-different-seed` to observe that a different seed gives a different but converging trajectory at the same sample count.

Prediction is optional and non-blocking. There is no arbitrary sample-count input, submit/check gate, score, or hidden validation workflow.

## Domain contract

The feature owns a pure deterministic generator and a feature-local Monte Carlo machine:

```ts
export type MonteCarloScenarioId = "small" | "medium" | "large" | "same-n-different-seed";

export type MonteCarloScenario = {
  id: MonteCarloScenarioId;
  title: string;
  seed: number;
  samples: number;
  batchSize: number;
};

export type MonteCarloFrame = {
  index: number;
  before: MonteCarloSnapshot;
  after: MonteCarloSnapshot;
  batch: number;
  sampleCount: number;
  insideCount: number;
  estimate: number;
  error: number;
};

export type MonteCarloMachine = {
  state: number;
  samplesDrawn: number;
  inside: number;
  status: "running" | "complete";
};
```

`nextSample(state)` advances the feature-local generator and returns the next `[x, y]` pair in `[0, 1)`:

- state is an unsigned 32-bit integer;
- one advance is `state = (state * 1103515245 + 12345) & 0xFFFFFFFF`;
- a random value is `(state >>> 16) / 65536` after advancing (so the low-bit weakness of LCG output is never used);
- the first advance after seeding produces the first `x`; the second advance produces the first `y`; samples are drawn as consecutive `x, y` pairs from one continuous stream.

The constants are documented so the test oracle can hand-author the first points and final estimate for `seed 42` without calling the production runner.

`stepMonteCarlo(machine, scenario)` draws exactly `batchSize` samples, counts points with `x² + y² ≤ 1`, updates the machine, and returns fresh before/after snapshots plus estimate and error. `runMonteCarlo` folds the same step. A complete machine is an identity-preserving no-op.

Scenario validation rejects unknown IDs, empty titles, non-integer seeds, non-positive sample counts, and batch sizes that do not evenly divide the sample count.

## Evidence requirements

The selected frame must make convergence inspectable without replay:

- batch index, cumulative samples drawn, and inside count;
- running estimate (`4 × inside / samples`) and running error (`|estimate − π|`);
- before/after cumulative counts;
- final estimate, final error, and a textual convergence claim.

The convergence claim is honest about observed evidence: comparing the three seed fixtures at their final steps, the observed final error shrinks as samples grow (`1000 → 0.0616`, `10_000 → 0.0032`, `100_000 → 0.0015` with the chosen seeds). The design explicitly does not claim error decreases monotonically per batch: the frame table shows the per-batch wobble, and `same-n-different-seed` shows that a different seed at the same sample count lands elsewhere (`3.1328` vs `3.1448`).

The UI renders a semantic convergence table (batch, cumulative samples, inside, estimate, error), a running status line, and textual evidence. Each stored frame is a native keyboard-focusable trace button; exactly the selected frame has `aria-current="true"`, Enter/Space select it, and Step/Run become disabled only at completion. The selected-frame region is labeled separately from the final result. It does not use a generic charting or visualization framework.

## Independent test oracle and review gate

Tests hand-author the exact sample stream for `seed 42`, including the first few `[x, y]` points, a mid-stream batch boundary, and the final estimate and inside count, without deriving expected values from the production runner. They separately test estimate/error formulas, scenario validation, scenario fallback, prediction handling, keyboard frame selection, completion idempotence, and narrow viewport evidence.

The design must explicitly answer:

- Is one Monte Carlo step a sample, a batch, or a full run?
- Is a seeded random stream a shared primitive or a feature-local deterministic device?
- Does convergence evidence become a charting primitive or remain a semantic table?
- Does prediction → intervention → observation → evidence apply to a random experiment without becoming a shared workflow?
