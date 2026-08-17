import {
  DEFAULT_NETWORK_CONFIG,
  FIXED_SOURCE,
  cloneNetworkConfig,
  createNetworkConfig,
  type HostDeviceId,
  type NetworkConfig,
  type ProbeTarget,
} from "../domain/model";

export type HomeNetworkScenario =
  | "first-home-setup"
  | "static-printer"
  | "remote-internet"
  | "wrong-gateway"
  | "duplicate-ip"
  | "invalid-config";

export type HomeNetworkScenarioState = {
  scenario: HomeNetworkScenario;
  source: HostDeviceId;
  target: ProbeTarget;
  config: NetworkConfig;
};

export type HomeNetworkScenarioSearch = URLSearchParams | string | Record<string, unknown>;

export const DEFAULT_HOME_NETWORK_SCENARIO: HomeNetworkScenario = "static-printer";
export const DEFAULT_HOME_NETWORK_TARGET: ProbeTarget = "printer";

export type HomeNetworkPreset = {
  scenario: HomeNetworkScenario;
  target: ProbeTarget;
  config: NetworkConfig;
};

export const HOME_NETWORK_PRESETS: Record<HomeNetworkScenario, HomeNetworkPreset> = {
  "first-home-setup": {
    scenario: "first-home-setup",
    target: "printer",
    config: createNetworkConfig(),
  },
  "static-printer": {
    scenario: "static-printer",
    target: "printer",
    config: createNetworkConfig({ printer: { ip: "192.168.2.30", prefix: "24" } }),
  },
  "remote-internet": {
    scenario: "remote-internet",
    target: "internet",
    config: createNetworkConfig(),
  },
  "wrong-gateway": {
    scenario: "wrong-gateway",
    target: "internet",
    config: createNetworkConfig({ laptop: { gateway: "192.168.1.254" } }),
  },
  "duplicate-ip": {
    scenario: "duplicate-ip",
    target: "printer",
    config: createNetworkConfig({ printer: { ip: "192.168.1.10" } }),
  },
  "invalid-config": {
    scenario: "invalid-config",
    target: "printer",
    config: createNetworkConfig({ printer: { ip: "not-an-ip" } }),
  },
};

export const HOME_NETWORK_SCENARIO_PRESETS = HOME_NETWORK_PRESETS;
export const DEFAULT_HOME_NETWORK_CONFIG = DEFAULT_NETWORK_CONFIG;

const SCENARIOS = new Set<HomeNetworkScenario>(
  Object.keys(HOME_NETWORK_PRESETS) as HomeNetworkScenario[],
);

function toParams(input: HomeNetworkScenarioSearch): URLSearchParams {
  if (input instanceof URLSearchParams) return new URLSearchParams(input);
  if (typeof input === "string") return new URLSearchParams(input.replace(/^\?/, ""));

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    const firstValue = Array.isArray(value) ? value[0] : value;
    if (firstValue !== undefined && firstValue !== null) params.append(key, String(firstValue));
  }
  return params;
}

function firstValue(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value === null ? undefined : value;
}

function presetFor(scenario: HomeNetworkScenario): HomeNetworkPreset {
  return HOME_NETWORK_PRESETS[scenario];
}

export function parseHomeNetworkScenario(
  input: HomeNetworkScenarioSearch,
): HomeNetworkScenarioState {
  const params = toParams(input);
  const requestedScenario = firstValue(params, "scenario");
  const scenario =
    requestedScenario && SCENARIOS.has(requestedScenario as HomeNetworkScenario)
      ? (requestedScenario as HomeNetworkScenario)
      : DEFAULT_HOME_NETWORK_SCENARIO;
  const preset = presetFor(scenario);
  const requestedTarget = firstValue(params, "target");
  const target =
    requestedTarget === "printer" || requestedTarget === "internet"
      ? requestedTarget
      : preset.target;

  return {
    scenario,
    source: FIXED_SOURCE,
    target,
    config: cloneNetworkConfig(preset.config),
  };
}

export const parseNetworkScenario = parseHomeNetworkScenario;

export function serializeHomeNetworkScenario(
  scenario: Pick<HomeNetworkScenarioState, "scenario" | "target">,
): string {
  const normalizedScenario = SCENARIOS.has(scenario.scenario)
    ? scenario.scenario
    : DEFAULT_HOME_NETWORK_SCENARIO;
  const defaultTarget = presetFor(normalizedScenario).target;
  const normalizedTarget =
    scenario.target === "printer" || scenario.target === "internet"
      ? scenario.target
      : defaultTarget;
  const params = new URLSearchParams();
  if (normalizedScenario !== DEFAULT_HOME_NETWORK_SCENARIO)
    params.set("scenario", normalizedScenario);
  if (normalizedTarget !== defaultTarget) params.set("target", normalizedTarget);
  return params.toString();
}

export const serializeNetworkScenario = serializeHomeNetworkScenario;
export const serializeHomeNetworkScenarioSearch = serializeHomeNetworkScenario;
