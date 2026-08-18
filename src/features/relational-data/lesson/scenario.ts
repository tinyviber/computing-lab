import {
  DEFAULT_RELATIONAL_SCENARIO,
  RELATIONAL_SCENARIOS,
  type RelationalScenarioId,
} from "../domain";

export type RelationalScenarioSearch = URLSearchParams | string | Record<string, unknown>;
export type RelationalScenarioState = { scenario: RelationalScenarioId };

const IDS = new Set<RelationalScenarioId>(
  Object.keys(RELATIONAL_SCENARIOS) as RelationalScenarioId[],
);

function params(input: RelationalScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== null) result.append(key, String(first));
  }
  return result;
}

export function parseRelationalScenario(input: RelationalScenarioSearch): RelationalScenarioState {
  const requested = params(input).get("scenario");
  return {
    scenario:
      requested && IDS.has(requested as RelationalScenarioId)
        ? (requested as RelationalScenarioId)
        : DEFAULT_RELATIONAL_SCENARIO,
  };
}

export function serializeRelationalScenario(
  state: Pick<RelationalScenarioState, "scenario">,
): string {
  const scenario = IDS.has(state.scenario) ? state.scenario : DEFAULT_RELATIONAL_SCENARIO;
  return scenario === DEFAULT_RELATIONAL_SCENARIO ? "" : `scenario=${scenario}`;
}
