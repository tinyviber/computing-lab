import {
  DEFAULT_MONTE_CARLO_SCENARIO,
  MONTE_CARLO_SCENARIOS,
  type MonteCarloScenarioId,
} from "../domain";

export type MonteCarloScenarioSearch = URLSearchParams | string | Record<string, unknown>;
export type MonteCarloScenarioState = { scenario: MonteCarloScenarioId };

const IDS = new Set<MonteCarloScenarioId>(
  Object.keys(MONTE_CARLO_SCENARIOS) as MonteCarloScenarioId[],
);

function params(input: MonteCarloScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== null) result.append(key, String(first));
  }
  return result;
}

export function parseMonteCarloScenario(input: MonteCarloScenarioSearch): MonteCarloScenarioState {
  const requested = params(input).get("scenario");
  return {
    scenario:
      requested && IDS.has(requested as MonteCarloScenarioId)
        ? (requested as MonteCarloScenarioId)
        : DEFAULT_MONTE_CARLO_SCENARIO,
  };
}

export function serializeMonteCarloScenario(
  state: Pick<MonteCarloScenarioState, "scenario">,
): string {
  const scenario = IDS.has(state.scenario) ? state.scenario : DEFAULT_MONTE_CARLO_SCENARIO;
  return scenario === DEFAULT_MONTE_CARLO_SCENARIO ? "" : `scenario=${scenario}`;
}
