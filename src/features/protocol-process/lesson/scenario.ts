import { DEFAULT_PROTOCOL_SCENARIO, PROTOCOL_SCENARIOS, type ProtocolScenarioId } from "../domain";

export type ProtocolScenarioSearch = URLSearchParams | string | Record<string, unknown>;

export type ProtocolScenarioState = {
  scenario: ProtocolScenarioId;
};

const SCENARIO_IDS = new Set<ProtocolScenarioId>(
  Object.keys(PROTOCOL_SCENARIOS) as ProtocolScenarioId[],
);

function toParams(input: ProtocolScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.append(key, String(firstValue));
  }
  return params;
}

export function parseProtocolScenario(input: ProtocolScenarioSearch): ProtocolScenarioState {
  const requested = toParams(input).get("scenario");
  return {
    scenario:
      requested && SCENARIO_IDS.has(requested as ProtocolScenarioId)
        ? (requested as ProtocolScenarioId)
        : DEFAULT_PROTOCOL_SCENARIO,
  };
}

export function serializeProtocolScenario(state: Pick<ProtocolScenarioState, "scenario">): string {
  const scenario = SCENARIO_IDS.has(state.scenario) ? state.scenario : DEFAULT_PROTOCOL_SCENARIO;
  if (scenario === DEFAULT_PROTOCOL_SCENARIO) return "";
  const params = new URLSearchParams();
  params.set("scenario", scenario);
  return params.toString();
}
