import type { ProtocolScenario, ProtocolScenarioId } from "./model";

const BASE = {
  requestDelay: 2,
  acknowledgmentDelay: 3,
  timeout: 5,
  maxAttempts: 2,
} as const;

export const PROTOCOL_SCENARIOS: Readonly<Record<ProtocolScenarioId, ProtocolScenario>> = {
  "no-loss": {
    ...BASE,
    id: "no-loss",
    title: "No loss baseline",
    fault: "none",
  },
  "ack-loss": {
    ...BASE,
    id: "ack-loss",
    title: "First acknowledgment lost",
    fault: "drop-first-ack",
  },
  "request-loss": {
    ...BASE,
    id: "request-loss",
    title: "First request lost",
    fault: "drop-first-request",
  },
  "receiver-silent": {
    ...BASE,
    id: "receiver-silent",
    title: "Receiver unavailable",
    fault: "silent-receiver",
  },
};

export type ProtocolScenarioSummary = {
  status: "delivered" | "failed";
  attempts: number;
  accepted: number;
  duplicates: number;
  acknowledgments: number;
  finalTime: number;
};

export const PROTOCOL_SCENARIO_SUMMARIES: Readonly<
  Record<ProtocolScenarioId, ProtocolScenarioSummary>
> = {
  "no-loss": {
    status: "delivered",
    attempts: 1,
    accepted: 1,
    duplicates: 0,
    acknowledgments: 1,
    finalTime: 5,
  },
  "ack-loss": {
    status: "delivered",
    attempts: 2,
    accepted: 1,
    duplicates: 1,
    acknowledgments: 2,
    finalTime: 10,
  },
  "request-loss": {
    status: "delivered",
    attempts: 2,
    accepted: 1,
    duplicates: 0,
    acknowledgments: 1,
    finalTime: 10,
  },
  "receiver-silent": {
    status: "failed",
    attempts: 2,
    accepted: 0,
    duplicates: 0,
    acknowledgments: 0,
    finalTime: 10,
  },
};

export const DEFAULT_PROTOCOL_SCENARIO: ProtocolScenarioId = "ack-loss";

export function getProtocolScenario(id: ProtocolScenarioId): ProtocolScenario {
  return PROTOCOL_SCENARIOS[id];
}
