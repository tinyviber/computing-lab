import { NETWORK_FIXTURE } from "../domain/model";

export type HomeNetworkScenario = "balanced" | "wrong-gateway";
export type HomeNetworkScenarioState = { scenario: HomeNetworkScenario; gateway: string };
export type HomeNetworkScenarioSearch = URLSearchParams | string | Record<string, unknown>;

function toParams(input: HomeNetworkScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return input;
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.set(key, String(firstValue));
  }
  return params;
}

export function parseHomeNetworkScenario(
  input: HomeNetworkScenarioSearch,
): HomeNetworkScenarioState {
  const params = toParams(input);
  const scenario: HomeNetworkScenario =
    params.get("scenario") === "wrong-gateway" ? "wrong-gateway" : "balanced";
  const presetGateway = scenario === "wrong-gateway" ? "192.168.1.254" : NETWORK_FIXTURE.gateway;
  const explicitGateway = params.get("gateway");
  const explicitValue = explicitGateway === "wrong" ? "192.168.1.254" : explicitGateway;
  return {
    scenario,
    gateway: explicitValue !== null && explicitValue.trim() !== "" ? explicitValue : presetGateway,
  };
}
