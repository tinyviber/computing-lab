import type { MonteCarloScenario, MonteCarloScenarioId } from "./model";

export const MONTE_CARLO_SCENARIOS: Readonly<Record<MonteCarloScenarioId, MonteCarloScenario>> = {
  small: { id: "small", title: "Small sample", seed: 42, samples: 1000, batchSize: 250 },
  medium: { id: "medium", title: "Medium sample", seed: 2024, samples: 10_000, batchSize: 250 },
  large: { id: "large", title: "Large sample", seed: 271828, samples: 100_000, batchSize: 250 },
  "same-n-different-seed": {
    id: "same-n-different-seed",
    title: "Same count, different seed",
    seed: 11,
    samples: 10_000,
    batchSize: 250,
  },
};

export const DEFAULT_MONTE_CARLO_SCENARIO: MonteCarloScenarioId = "medium";

export function getMonteCarloScenario(id: MonteCarloScenarioId): MonteCarloScenario {
  return MONTE_CARLO_SCENARIOS[id];
}
