import {
  DEFAULT_BYTE_EDIT_SCENARIO,
  BYTE_EDIT_SCENARIOS,
  type ByteEditScenarioId,
} from "../domain";

export type ByteEditScenarioSearch = URLSearchParams | string | Record<string, unknown>;
export type ByteEditScenarioState = { scenario: ByteEditScenarioId };

const IDS = new Set<ByteEditScenarioId>(Object.keys(BYTE_EDIT_SCENARIOS) as ByteEditScenarioId[]);

function params(input: ByteEditScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));
  const result = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined && first !== null) result.append(key, String(first));
  }
  return result;
}

export function parseByteEditScenario(input: ByteEditScenarioSearch): ByteEditScenarioState {
  const requested = params(input).get("scenario");
  return {
    scenario:
      requested && IDS.has(requested as ByteEditScenarioId)
        ? (requested as ByteEditScenarioId)
        : DEFAULT_BYTE_EDIT_SCENARIO,
  };
}

export function serializeByteEditScenario(state: Pick<ByteEditScenarioState, "scenario">): string {
  const scenario = IDS.has(state.scenario) ? state.scenario : DEFAULT_BYTE_EDIT_SCENARIO;
  return scenario === DEFAULT_BYTE_EDIT_SCENARIO ? "" : `scenario=${scenario}`;
}
