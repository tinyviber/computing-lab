import {
  FIXED_SOURCE,
  cloneNetworkConfig,
  cloneProbeEvent,
  cloneProbeResult,
  runHomeNetworkProbe,
  type HostDeviceId,
  type HostConfig,
  type NetworkConfig,
  type NetworkDeviceId,
  type ProbeEvent,
  type ProbeResult,
  type ProbeTarget,
} from "../domain/model";
import { HOME_NETWORK_PRESETS, type HomeNetworkScenarioState } from "./scenario";

export type HomeNetworkPrediction = "local" | "remote";

export type HomeNetworkLessonState = {
  scenario: HomeNetworkScenarioState["scenario"];
  config: NetworkConfig;
  source: HostDeviceId;
  target: ProbeTarget;
  selectedDevice: NetworkDeviceId;
  prediction?: HomeNetworkPrediction;
  probeHistory: ProbeResult[];
  probePredictions: Record<string, HomeNetworkPrediction | undefined>;
  selectedTrace?: ProbeResult;
  selectedEvent?: ProbeEvent;
};

export type ConfigField = keyof Pick<HostConfig, "ip" | "prefix" | "gateway">;

export type HomeNetworkLessonAction =
  | { type: "load-scenario"; scenario: HomeNetworkScenarioState }
  | { type: "edit-config"; device: HostDeviceId; field: ConfigField; value: string }
  | { type: "set-device-field"; device: HostDeviceId; field: ConfigField; value: string }
  | { type: "set-config"; config: NetworkConfig }
  | { type: "select-device"; device: NetworkDeviceId }
  | { type: "set-target"; target: ProbeTarget }
  | { type: "set-prediction"; prediction?: HomeNetworkPrediction }
  | { type: "probe" }
  | { type: "send-probe" }
  | { type: "select-trace"; probeId: string }
  | { type: "select-history"; probeId: string }
  | { type: "select-event"; eventId: string }
  | { type: "reset" };

function initialRuntime(): Pick<
  HomeNetworkLessonState,
  | "selectedDevice"
  | "prediction"
  | "probeHistory"
  | "probePredictions"
  | "selectedTrace"
  | "selectedEvent"
> {
  return {
    selectedDevice: FIXED_SOURCE,
    prediction: undefined,
    probeHistory: [],
    probePredictions: {},
    selectedTrace: undefined,
    selectedEvent: undefined,
  };
}

export function createHomeNetworkLessonState(
  scenario: HomeNetworkScenarioState,
): HomeNetworkLessonState {
  return {
    scenario: scenario.scenario,
    config: cloneNetworkConfig(scenario.config),
    source: FIXED_SOURCE,
    target: scenario.target,
    ...initialRuntime(),
  };
}

function sameNetworkConfig(left: NetworkConfig, right: NetworkConfig): boolean {
  return (
    left.router.lanIp === right.router.lanIp &&
    left.router.lanPrefix === right.router.lanPrefix &&
    left.router.wanIp === right.router.wanIp &&
    left.router.wanPrefix === right.router.wanPrefix &&
    left.router.connectedRoutes.join("|") === right.router.connectedRoutes.join("|") &&
    left.laptop.ip === right.laptop.ip &&
    left.laptop.prefix === right.laptop.prefix &&
    left.laptop.gateway === right.laptop.gateway &&
    left.printer.ip === right.printer.ip &&
    left.printer.prefix === right.printer.prefix &&
    left.printer.gateway === right.printer.gateway
  );
}

/**
 * Mission state belongs to the lesson, not the network probe domain. A repair
 * only counts after the current target was probed successfully with the
 * current editable configuration.
 */
export function homeNetworkConfigMatchesLatestProbe(state: HomeNetworkLessonState): boolean {
  const latestProbe = state.probeHistory[state.probeHistory.length - 1];
  return Boolean(latestProbe && sameNetworkConfig(latestProbe.configSnapshot, state.config));
}

export function homeNetworkMissionSolved(state: HomeNetworkLessonState): boolean {
  const latestProbe = state.probeHistory[state.probeHistory.length - 1];
  return Boolean(
    latestProbe &&
    latestProbe.target === state.target &&
    latestProbe.outcome === "delivered" &&
    homeNetworkConfigMatchesLatestProbe(state),
  );
}

function updateConfig(
  config: NetworkConfig,
  device: HostDeviceId,
  field: ConfigField,
  value: string,
): NetworkConfig {
  const next = cloneNetworkConfig(config);
  next[device] = { ...next[device], [field]: value };
  return next;
}

function selectedEventFor(trace: ProbeResult | undefined): ProbeEvent | undefined {
  if (!trace) return undefined;
  const event = trace.firstFailure
    ? trace.events.find((candidate) => candidate.id === trace.firstFailure?.eventId)
    : trace.events[trace.events.length - 1];
  return event ? cloneProbeEvent(event) : undefined;
}

function selectTrace(state: HomeNetworkLessonState, probeId: string): HomeNetworkLessonState {
  const trace = state.probeHistory.find((probe) => probe.id === probeId);
  if (!trace) return state;
  return {
    ...state,
    selectedTrace: cloneProbeResult(trace),
    selectedEvent: selectedEventFor(trace),
  };
}

export function transitionHomeNetworkLesson(
  state: HomeNetworkLessonState,
  action: HomeNetworkLessonAction,
): HomeNetworkLessonState {
  switch (action.type) {
    case "load-scenario":
      return createHomeNetworkLessonState(action.scenario);
    case "edit-config":
    case "set-device-field":
      return {
        ...state,
        config: updateConfig(state.config, action.device, action.field, action.value),
      };
    case "set-config":
      return { ...state, config: cloneNetworkConfig(action.config) };
    case "select-device":
      return { ...state, selectedDevice: action.device };
    case "set-target":
      return { ...state, target: action.target, prediction: undefined };
    case "set-prediction":
      return { ...state, prediction: action.prediction };
    case "probe":
    case "send-probe": {
      const result = runHomeNetworkProbe(
        state.config,
        state.target,
        state.source,
        state.probeHistory.length + 1,
      );
      const storedResult = cloneProbeResult(result);
      return {
        ...state,
        probeHistory: [...state.probeHistory, storedResult],
        probePredictions: {
          ...state.probePredictions,
          [storedResult.id]: state.prediction,
        },
        selectedTrace: cloneProbeResult(storedResult),
        selectedEvent: selectedEventFor(storedResult),
      };
    }
    case "select-trace":
    case "select-history":
      return selectTrace(state, action.probeId);
    case "select-event": {
      const event = state.selectedTrace?.events.find(
        (candidate) => candidate.id === action.eventId,
      );
      return event ? { ...state, selectedEvent: cloneProbeEvent(event) } : state;
    }
    case "reset":
      return {
        ...state,
        config: cloneNetworkConfig(HOME_NETWORK_PRESETS[state.scenario].config),
        ...initialRuntime(),
      };
  }
}

export const homeNetworkReducer = transitionHomeNetworkLesson;
