export type ProtocolScenarioId = "no-loss" | "ack-loss" | "request-loss" | "receiver-silent";

export type ProtocolFault = "none" | "drop-first-ack" | "drop-first-request" | "silent-receiver";

export type ProtocolScenario = {
  id: ProtocolScenarioId;
  title: string;
  fault: ProtocolFault;
  requestDelay: number;
  acknowledgmentDelay: number;
  timeout: number;
  maxAttempts: number;
};

export type ProtocolStatus = "running" | "delivered" | "failed";

export type ProtocolEventKind =
  "send-request" | "deliver-request" | "send-ack" | "deliver-ack" | "timeout";

export type ScheduledProtocolEvent = {
  kind: ProtocolEventKind;
  dueAt: number;
  sequence: number;
  attempt: number;
};

export type ProtocolTerminalReason = "delivered" | "attempt-limit";

export type ProtocolTerminalEvidence = {
  reason: ProtocolTerminalReason;
  at: number;
  message: string;
};

export type ProtocolMachine = {
  now: number;
  processedEvents: number;
  nextSequence: number;
  status: ProtocolStatus;
  attemptsSent: number;
  acceptedCount: number;
  duplicateCount: number;
  acknowledgmentsSent: number;
  queue: readonly ScheduledProtocolEvent[];
  faultConsumed: boolean;
  terminal?: ProtocolTerminalEvidence;
};

export type ProtocolSnapshot = ProtocolMachine;

export type ProtocolEventOutcome =
  | "queued"
  | "accepted"
  | "duplicate-suppressed"
  | "receiver-unavailable"
  | "dropped"
  | "retry-scheduled"
  | "completed"
  | "failed";

export type ProtocolEventEvidence = {
  kind: ProtocolEventKind;
  at: number;
  attempt: number;
  outcome: ProtocolEventOutcome;
  explanation: string;
};

export type ProtocolFrame = {
  index: number;
  event: ProtocolEventEvidence;
  before: ProtocolSnapshot;
  after: ProtocolSnapshot;
  terminal?: ProtocolTerminalEvidence;
};

export type ProtocolStepResult = {
  machine: ProtocolMachine;
  frame?: ProtocolFrame;
  done: boolean;
};

export const MESSAGE_ID = "M42" as const;
export const MESSAGE_TEXT = "MEET AT 3" as const;
export const MAX_PROTOCOL_ATTEMPTS = 20 as const;

const SCENARIO_FAULTS: Readonly<Record<ProtocolScenarioId, ProtocolFault>> = {
  "no-loss": "none",
  "ack-loss": "drop-first-ack",
  "request-loss": "drop-first-request",
  "receiver-silent": "silent-receiver",
};

function cloneScheduledEvent(event: ScheduledProtocolEvent): ScheduledProtocolEvent {
  return { ...event };
}

function cloneTerminal(
  terminal: ProtocolTerminalEvidence | undefined,
): ProtocolTerminalEvidence | undefined {
  return terminal ? { ...terminal } : undefined;
}

function cloneQueue(queue: readonly ScheduledProtocolEvent[]): ScheduledProtocolEvent[] {
  return queue.map(cloneScheduledEvent);
}

function cloneMachine(machine: ProtocolMachine): ProtocolMachine {
  return {
    ...machine,
    queue: cloneQueue(machine.queue),
    ...(machine.terminal ? { terminal: cloneTerminal(machine.terminal) } : {}),
  };
}

function snapshot(machine: ProtocolMachine): ProtocolSnapshot {
  return cloneMachine(machine);
}

function eventPriority(kind: ProtocolEventKind): number {
  if (kind === "deliver-request" || kind === "deliver-ack") return 0;
  if (kind === "timeout") return 1;
  return 2;
}

function compareEvents(left: ScheduledProtocolEvent, right: ScheduledProtocolEvent): number {
  return (
    left.dueAt - right.dueAt ||
    eventPriority(left.kind) - eventPriority(right.kind) ||
    left.sequence - right.sequence
  );
}

function sortedQueue(queue: readonly ScheduledProtocolEvent[]): ScheduledProtocolEvent[] {
  return [...queue].sort(compareEvents).map(cloneScheduledEvent);
}

function schedule(
  machine: ProtocolMachine,
  event: Omit<ScheduledProtocolEvent, "sequence">,
): ProtocolMachine {
  const sequence = machine.nextSequence;
  return {
    ...machine,
    nextSequence: sequence + 1,
    queue: sortedQueue([...machine.queue, { ...event, sequence }]),
  };
}

function terminalEvidence(
  reason: ProtocolTerminalReason,
  at: number,
  maxAttempts: number,
): ProtocolTerminalEvidence {
  return {
    reason,
    at,
    message:
      reason === "delivered"
        ? `Sender received the acknowledgment at tick ${at}.`
        : `No acknowledgment arrived after ${maxAttempts} attempts.`,
  };
}

function finish(
  machine: ProtocolMachine,
  reason: ProtocolTerminalReason,
  maxAttempts: number,
): ProtocolMachine {
  const terminal = terminalEvidence(reason, machine.now, maxAttempts);
  return {
    ...machine,
    status: reason === "delivered" ? "delivered" : "failed",
    queue: [],
    terminal,
  };
}

export function assertProtocolScenario(scenario: ProtocolScenario): void {
  if (!(scenario.id in SCENARIO_FAULTS))
    throw new Error(`Unknown protocol scenario: ${scenario.id}`);
  if (!scenario.title.trim()) throw new Error("Protocol scenario title cannot be empty.");
  if (!Number.isSafeInteger(scenario.requestDelay) || scenario.requestDelay <= 0) {
    throw new Error("Request delay must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(scenario.acknowledgmentDelay) || scenario.acknowledgmentDelay <= 0) {
    throw new Error("Acknowledgment delay must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(scenario.timeout) || scenario.timeout <= 0) {
    throw new Error("Timeout must be a positive safe integer.");
  }
  if (scenario.timeout < scenario.requestDelay + scenario.acknowledgmentDelay) {
    throw new Error("Timeout must cover one request and acknowledgment round trip.");
  }
  if (!Number.isSafeInteger(scenario.maxAttempts) || scenario.maxAttempts < 1) {
    throw new Error("Maximum attempts must be a positive safe integer.");
  }
  if (scenario.maxAttempts > MAX_PROTOCOL_ATTEMPTS) {
    throw new Error(`Maximum attempts cannot exceed ${MAX_PROTOCOL_ATTEMPTS}.`);
  }
  if (
    !(["none", "drop-first-ack", "drop-first-request", "silent-receiver"] as string[]).includes(
      scenario.fault,
    )
  ) {
    throw new Error(`Unknown protocol fault: ${scenario.fault}`);
  }
  if (SCENARIO_FAULTS[scenario.id] !== scenario.fault) {
    throw new Error(`Protocol scenario ${scenario.id} has a mismatched fault.`);
  }
}

function isProtocolEventKind(value: unknown): value is ProtocolEventKind {
  return (
    value === "send-request" ||
    value === "deliver-request" ||
    value === "send-ack" ||
    value === "deliver-ack" ||
    value === "timeout"
  );
}

export function assertProtocolMachine(machine: ProtocolMachine, scenario: ProtocolScenario): void {
  assertProtocolScenario(scenario);
  for (const [name, value] of [
    ["now", machine.now],
    ["processedEvents", machine.processedEvents],
    ["nextSequence", machine.nextSequence],
    ["attemptsSent", machine.attemptsSent],
    ["acceptedCount", machine.acceptedCount],
    ["duplicateCount", machine.duplicateCount],
    ["acknowledgmentsSent", machine.acknowledgmentsSent],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`Invalid protocol ${name}.`);
  }
  if (machine.nextSequence < 1) throw new Error("Protocol sequence must start at one.");
  if (
    machine.status !== "running" &&
    machine.status !== "delivered" &&
    machine.status !== "failed"
  ) {
    throw new Error(`Unknown protocol status: ${machine.status}`);
  }
  if (typeof machine.faultConsumed !== "boolean")
    throw new Error("Protocol fault state must be boolean.");
  if (!Array.isArray(machine.queue)) throw new Error("Protocol queue must be an array.");
  if (machine.attemptsSent > scenario.maxAttempts) {
    throw new Error("Protocol attempts cannot exceed the scenario maximum.");
  }
  if (machine.status === "running" && machine.queue.length === 0) {
    throw new Error("A running protocol must have queued work.");
  }
  const sequences = new Set<number>();
  const timeoutAttempts = new Set<number>();
  const expectedQueue = sortedQueue(machine.queue);
  machine.queue.forEach((event, index) => {
    if (!isProtocolEventKind(event.kind)) throw new Error(`Unknown protocol event: ${event.kind}`);
    if (!Number.isSafeInteger(event.dueAt) || event.dueAt < machine.now) {
      throw new Error("Protocol event due time must be a safe tick at or after now.");
    }
    if (
      !Number.isSafeInteger(event.sequence) ||
      event.sequence < 0 ||
      event.sequence >= machine.nextSequence ||
      sequences.has(event.sequence)
    ) {
      throw new Error("Protocol queue sequences must be unique non-negative integers.");
    }
    if (!Number.isSafeInteger(event.attempt) || event.attempt < 1) {
      throw new Error("Protocol event attempts must be positive safe integers.");
    }
    if (event.attempt > scenario.maxAttempts) {
      throw new Error("Protocol event attempt exceeds the scenario maximum.");
    }
    if (event.kind === "send-request") {
      if (event.attempt !== machine.attemptsSent + 1) {
        throw new Error("A queued request must be the next protocol attempt.");
      }
    } else if (event.attempt !== machine.attemptsSent) {
      throw new Error("Queued protocol work must use the current attempt.");
    }
    if (event.kind === "timeout") {
      if (timeoutAttempts.has(event.attempt)) {
        throw new Error("A protocol attempt cannot have duplicate timeout events.");
      }
      timeoutAttempts.add(event.attempt);
    }
    sequences.add(event.sequence);
    if (expectedQueue[index].sequence !== event.sequence) {
      throw new Error("Protocol queue must be sorted by due time, priority, and sequence.");
    }
  });
  if (machine.status === "running" && machine.terminal) {
    throw new Error("A running protocol cannot have terminal evidence.");
  }
  if (machine.status !== "running") {
    if (!machine.terminal) throw new Error("A terminal protocol needs terminal evidence.");
    if (machine.queue.length > 0) throw new Error("A terminal protocol must have an empty queue.");
    if (
      !Number.isSafeInteger(machine.terminal.at) ||
      machine.terminal.at < 0 ||
      machine.terminal.at !== machine.now ||
      !machine.terminal.message
    ) {
      throw new Error("Terminal evidence must use the machine's current tick.");
    }
    if (
      (machine.status === "delivered" && machine.terminal.reason !== "delivered") ||
      (machine.status === "failed" && machine.terminal.reason !== "attempt-limit")
    ) {
      throw new Error("Terminal reason must match protocol status.");
    }
  }
}

export function createProtocolMachine(scenario: ProtocolScenario): ProtocolMachine {
  assertProtocolScenario(scenario);
  return {
    now: 0,
    processedEvents: 0,
    nextSequence: 1,
    status: "running",
    attemptsSent: 0,
    acceptedCount: 0,
    duplicateCount: 0,
    acknowledgmentsSent: 0,
    queue: [
      {
        kind: "send-request",
        dueAt: 0,
        sequence: 0,
        attempt: 1,
      },
    ],
    faultConsumed: false,
  };
}

function eventExplanation(event: ScheduledProtocolEvent, outcome: ProtocolEventOutcome): string {
  if (event.kind === "send-request") {
    return outcome === "dropped"
      ? `Request attempt ${event.attempt} was dropped before delivery.`
      : `Sender queued request attempt ${event.attempt} for the channel.`;
  }
  if (event.kind === "deliver-request") {
    if (outcome === "receiver-unavailable") {
      return `Receiver was unavailable for request attempt ${event.attempt}; no acknowledgment was sent.`;
    }
    return outcome === "duplicate-suppressed"
      ? `Receiver already accepted ${MESSAGE_ID}; duplicate attempt ${event.attempt} was not delivered twice.`
      : `Receiver accepted ${MESSAGE_ID} from attempt ${event.attempt}.`;
  }
  if (event.kind === "send-ack") {
    return `Receiver sent acknowledgment ${event.attempt} for ${MESSAGE_ID}.`;
  }
  if (event.kind === "deliver-ack") {
    return outcome === "dropped"
      ? `Acknowledgment ${event.attempt} was dropped before the sender could observe it.`
      : `Sender observed acknowledgment ${event.attempt} for ${MESSAGE_ID}.`;
  }
  return outcome === "retry-scheduled"
    ? `No acknowledgment arrived; retry attempt ${event.attempt + 1} was scheduled.`
    : `No acknowledgment arrived after the maximum attempts.`;
}

export function stepProtocol(
  machine: ProtocolMachine,
  scenario: ProtocolScenario,
): ProtocolStepResult {
  assertProtocolMachine(machine, scenario);
  if (machine.status !== "running") return { machine, done: true };
  const nextEvent = machine.queue[0];
  if (!nextEvent) throw new Error("A running protocol must have a queued event.");

  const before = snapshot(machine);
  const frameIndex = machine.processedEvents;
  let next: ProtocolMachine = {
    ...cloneMachine(machine),
    now: nextEvent.dueAt,
    processedEvents: machine.processedEvents + 1,
    queue: cloneQueue(machine.queue.slice(1)),
  };
  let outcome: ProtocolEventOutcome = "queued";

  if (nextEvent.kind === "send-request") {
    next = { ...next, attemptsSent: next.attemptsSent + 1 };
    const shouldDrop =
      scenario.fault === "drop-first-request" && nextEvent.attempt === 1 && !next.faultConsumed;
    if (shouldDrop) {
      outcome = "dropped";
      next = { ...next, faultConsumed: true };
    } else {
      next = schedule(next, {
        kind: "deliver-request",
        dueAt: next.now + scenario.requestDelay,
        attempt: nextEvent.attempt,
      });
    }
    next = schedule(next, {
      kind: "timeout",
      dueAt: next.now + scenario.timeout,
      attempt: nextEvent.attempt,
    });
  } else if (nextEvent.kind === "deliver-request") {
    if (scenario.fault === "silent-receiver") {
      outcome = "receiver-unavailable";
    } else {
      if (next.acceptedCount === 0) {
        next = { ...next, acceptedCount: 1 };
        outcome = "accepted";
      } else {
        next = { ...next, duplicateCount: next.duplicateCount + 1 };
        outcome = "duplicate-suppressed";
      }
      next = schedule(next, {
        kind: "send-ack",
        dueAt: next.now,
        attempt: nextEvent.attempt,
      });
    }
  } else if (nextEvent.kind === "send-ack") {
    next = { ...next, acknowledgmentsSent: next.acknowledgmentsSent + 1 };
    next = schedule(next, {
      kind: "deliver-ack",
      dueAt: next.now + scenario.acknowledgmentDelay,
      attempt: nextEvent.attempt,
    });
  } else if (nextEvent.kind === "deliver-ack") {
    const shouldDrop =
      scenario.fault === "drop-first-ack" && nextEvent.attempt === 1 && !next.faultConsumed;
    if (shouldDrop) {
      outcome = "dropped";
      next = { ...next, faultConsumed: true };
    } else {
      outcome = "completed";
      next = finish(next, "delivered", scenario.maxAttempts);
    }
  } else {
    if (next.attemptsSent < scenario.maxAttempts) {
      outcome = "retry-scheduled";
      next = schedule(next, {
        kind: "send-request",
        dueAt: next.now,
        attempt: nextEvent.attempt + 1,
      });
    } else {
      outcome = "failed";
      next = finish(next, "attempt-limit", scenario.maxAttempts);
    }
  }

  assertProtocolMachine(next, scenario);
  const after = snapshot(next);
  const event: ProtocolEventEvidence = {
    kind: nextEvent.kind,
    at: nextEvent.dueAt,
    attempt: nextEvent.attempt,
    outcome,
    explanation: eventExplanation(nextEvent, outcome),
  };
  const frame: ProtocolFrame = {
    index: frameIndex,
    event,
    before,
    after,
    ...(next.terminal ? { terminal: cloneTerminal(next.terminal) } : {}),
  };
  return { machine: next, frame, done: next.status !== "running" };
}

export function runProtocol(scenario: ProtocolScenario): {
  machine: ProtocolMachine;
  frames: ProtocolFrame[];
} {
  let machine = createProtocolMachine(scenario);
  const frames: ProtocolFrame[] = [];
  const stepBudget = scenario.maxAttempts * 5;
  for (let index = 0; index < stepBudget && machine.status === "running"; index += 1) {
    const result = stepProtocol(machine, scenario);
    if (!result.frame) throw new Error("A running protocol step must produce a frame.");
    frames.push({ ...result.frame, index });
    machine = result.machine;
  }
  if (machine.status === "running") {
    throw new Error(`Protocol did not terminate within ${stepBudget} steps.`);
  }
  return { machine, frames };
}
