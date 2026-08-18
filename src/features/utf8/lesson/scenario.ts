import { DEFAULT_UTF8_SCENARIO, UTF8_SCENARIOS, type Utf8ScenarioId } from "../domain";

export type Utf8ScenarioSearch = URLSearchParams | string | Record<string, unknown>;
export type Utf8ScenarioState = { scenario: Utf8ScenarioId };

const IDS = new Set<Utf8ScenarioId>(Object.keys(UTF8_SCENARIOS) as Utf8ScenarioId[]);

function params(input: Utf8ScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== null) result.append(key, String(first));
  }
  return result;
}

export function parseUtf8Scenario(input: Utf8ScenarioSearch): Utf8ScenarioState {
  const requested = params(input).get("scenario");
  return {
    scenario:
      requested && IDS.has(requested as Utf8ScenarioId)
        ? (requested as Utf8ScenarioId)
        : DEFAULT_UTF8_SCENARIO,
  };
}

export function serializeUtf8Scenario(state: Pick<Utf8ScenarioState, "scenario">): string {
  const scenario = IDS.has(state.scenario) ? state.scenario : DEFAULT_UTF8_SCENARIO;
  return scenario === DEFAULT_UTF8_SCENARIO ? "" : `scenario=${scenario}`;
}
