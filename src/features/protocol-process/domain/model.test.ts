import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROTOCOL_SCENARIO,
  assertProtocolMachine,
  assertProtocolScenario,
  createProtocolMachine,
  getProtocolScenario,
  runProtocol,
  stepProtocol,
  type ProtocolScenario,
} from "./index";

describe("protocol process domain", () => {
  it("matches the hand-authored no-loss event sequence", () => {
    const result = runProtocol(getProtocolScenario("no-loss"));

    expect(
      result.frames.map((frame) => [frame.event.kind, frame.event.at, frame.event.outcome]),
    ).toEqual([
      ["send-request", 0, "queued"],
      ["deliver-request", 2, "accepted"],
      ["send-ack", 2, "queued"],
      ["deliver-ack", 5, "completed"],
    ]);
    expect(result.frames.map((frame) => frame.event.attempt)).toEqual([1, 1, 1, 1]);
    expect(result.frames.map((frame) => frame.after.queue.map((event) => event.sequence))).toEqual([
      [1, 2],
      [3, 2],
      [4, 2],
      [],
    ]);
    expect(result.machine).toMatchObject({
      now: 5,
      processedEvents: 4,
      status: "delivered",
      attemptsSent: 1,
      acceptedCount: 1,
      duplicateCount: 0,
      acknowledgmentsSent: 1,
      queue: [],
    });
  });

  it("makes first-ack loss, timeout, retry, and duplicate suppression explicit", () => {
    const result = runProtocol(getProtocolScenario(DEFAULT_PROTOCOL_SCENARIO));

    expect(
      result.frames.map((frame) => [frame.event.kind, frame.event.at, frame.event.outcome]),
    ).toEqual([
      ["send-request", 0, "queued"],
      ["deliver-request", 2, "accepted"],
      ["send-ack", 2, "queued"],
      ["deliver-ack", 5, "dropped"],
      ["timeout", 5, "retry-scheduled"],
      ["send-request", 5, "queued"],
      ["deliver-request", 7, "duplicate-suppressed"],
      ["send-ack", 7, "queued"],
      ["deliver-ack", 10, "completed"],
    ]);
    expect(result.frames.map((frame) => frame.event.attempt)).toEqual([1, 1, 1, 1, 1, 2, 2, 2, 2]);
    expect(result.frames.map((frame) => frame.after.queue.map((event) => event.sequence))).toEqual([
      [1, 2],
      [3, 2],
      [4, 2],
      [2],
      [5],
      [6, 7],
      [8, 7],
      [9, 7],
      [],
    ]);
    expect(result.machine).toMatchObject({
      now: 10,
      processedEvents: 9,
      status: "delivered",
      attemptsSent: 2,
      acceptedCount: 1,
      duplicateCount: 1,
      acknowledgmentsSent: 2,
      queue: [],
      faultConsumed: true,
    });
    expect(result.frames[3].after.queue).toEqual([
      expect.objectContaining({ kind: "timeout", dueAt: 5, attempt: 1 }),
    ]);
    expect(result.frames[4].after.queue[0]).toMatchObject({
      kind: "send-request",
      dueAt: 5,
      attempt: 2,
    });
  });

  it("keeps request loss distinct from acknowledgment loss", () => {
    const result = runProtocol(getProtocolScenario("request-loss"));

    expect(
      result.frames.map((frame) => [frame.event.kind, frame.event.at, frame.event.outcome]),
    ).toEqual([
      ["send-request", 0, "dropped"],
      ["timeout", 5, "retry-scheduled"],
      ["send-request", 5, "queued"],
      ["deliver-request", 7, "accepted"],
      ["send-ack", 7, "queued"],
      ["deliver-ack", 10, "completed"],
    ]);
    expect(result.frames.map((frame) => frame.event.attempt)).toEqual([1, 1, 2, 2, 2, 2]);
    expect(result.frames.map((frame) => frame.after.queue.map((event) => event.sequence))).toEqual([
      [1],
      [2],
      [3, 4],
      [5, 4],
      [6, 4],
      [],
    ]);
    expect(result.machine).toMatchObject({
      now: 10,
      processedEvents: 6,
      nextSequence: 7,
      status: "delivered",
      attemptsSent: 2,
      acceptedCount: 1,
      duplicateCount: 0,
      acknowledgmentsSent: 1,
      queue: [],
      faultConsumed: true,
    });
  });

  it("processes delivery before timeout at an equal simulated time", () => {
    const result = runProtocol(getProtocolScenario("no-loss"));
    const final = result.frames.at(-1)!;

    expect(final.event.kind).toBe("deliver-ack");
    expect(final.event.at).toBe(5);
    expect(final.after.status).toBe("delivered");
    expect(final.after.queue).toEqual([]);
  });

  it("does not create invisible clock frames when time jumps", () => {
    const result = runProtocol(getProtocolScenario("request-loss"));

    expect(result.frames.map((frame) => frame.event.at)).toEqual([0, 5, 5, 7, 7, 10]);
    expect(result.frames.every((frame) => frame.after.now === frame.event.at)).toBe(true);
  });

  it("is deterministic, immutable, and terminal stepping is an identity no-op", () => {
    const scenario = getProtocolScenario("ack-loss");
    const first = runProtocol(scenario);
    const second = runProtocol(scenario);
    const machine = { ...first.machine, queue: [...first.machine.queue] };
    const after = stepProtocol(machine, scenario);

    expect(second).toEqual(first);
    expect(after.machine).toBe(machine);
    expect(after.frame).toBeUndefined();
    expect(after.done).toBe(true);

    const firstFrame = first.frames[0];
    const beforeQueue = firstFrame.before.queue as Array<{ kind: string }>;
    beforeQueue[0].kind = "mutated";
    const machineTerminal = first.machine.terminal as { message: string };
    machineTerminal.message = "mutated machine terminal";
    expect(first.frames[1].before.queue[0]?.kind).toBe("deliver-request");
    expect(first.frames.at(-1)!.terminal?.message).toMatch(/received the acknowledgment/i);
    expect(first.machine.status).toBe("delivered");
  });

  it("contrasts receiver unavailability with an acknowledgment that was merely lost", () => {
    const result = runProtocol(getProtocolScenario("receiver-silent"));

    expect(
      result.frames.map((frame) => [
        frame.event.kind,
        frame.event.at,
        frame.event.attempt,
        frame.event.outcome,
      ]),
    ).toEqual([
      ["send-request", 0, 1, "queued"],
      ["deliver-request", 2, 1, "receiver-unavailable"],
      ["timeout", 5, 1, "retry-scheduled"],
      ["send-request", 5, 2, "queued"],
      ["deliver-request", 7, 2, "receiver-unavailable"],
      ["timeout", 10, 2, "failed"],
    ]);
    expect(result.frames.map((frame) => frame.after.queue.map((event) => event.sequence))).toEqual([
      [1, 2],
      [2],
      [3],
      [4, 5],
      [5],
      [],
    ]);
    expect(result.machine).toMatchObject({
      now: 10,
      processedEvents: 6,
      status: "failed",
      attemptsSent: 2,
      acceptedCount: 0,
      duplicateCount: 0,
      acknowledgmentsSent: 0,
      queue: [],
      faultConsumed: false,
    });
  });

  it("rejects malformed scenarios, event kinds, due times, and queue ordering", () => {
    const scenario = getProtocolScenario("no-loss");
    const unknownEvent = {
      ...createProtocolMachine(scenario),
      queue: [{ ...createProtocolMachine(scenario).queue[0], kind: "mystery" as never }],
    };
    const pastEvent = {
      ...createProtocolMachine(scenario),
      now: 3,
    };
    const unsorted = {
      ...createProtocolMachine(scenario),
      queue: [
        { ...createProtocolMachine(scenario).queue[0], dueAt: 5, sequence: 1 },
        { kind: "timeout" as const, dueAt: 2, sequence: 0, attempt: 1 },
      ],
      nextSequence: 2,
    };
    const malformedScenario = { ...scenario, fault: "mystery" as never };
    const unknownScenario = { ...scenario, id: "bogus" as never };
    const tooShortTimeout = { ...scenario, timeout: 4 };
    const impossibleSequence = {
      ...createProtocolMachine(scenario),
      queue: [{ ...createProtocolMachine(scenario).queue[0], sequence: 99 }],
    };
    const mismatchedTerminal = {
      ...createProtocolMachine(scenario),
      status: "failed" as const,
      queue: [],
      terminal: { reason: "delivered" as const, at: 0, message: "wrong" },
    };
    const mismatchedTimeout = {
      ...createProtocolMachine(scenario),
      attemptsSent: 2,
      queue: [{ kind: "timeout" as const, dueAt: 5, sequence: 1, attempt: 1 }],
      nextSequence: 2,
    };
    const duplicateTimeout = {
      ...createProtocolMachine(scenario),
      attemptsSent: 1,
      queue: [
        { kind: "timeout" as const, dueAt: 5, sequence: 1, attempt: 1 },
        { kind: "timeout" as const, dueAt: 6, sequence: 2, attempt: 1 },
      ],
      nextSequence: 3,
    };
    const tooManyAttempts = { ...scenario, maxAttempts: 21 };

    expect(() => stepProtocol(unknownEvent, scenario)).toThrow(/unknown protocol event/i);
    expect(() => assertProtocolMachine(pastEvent, scenario)).toThrow(/due time/i);
    expect(() => assertProtocolMachine(unsorted, scenario)).toThrow(/sorted/i);
    expect(() => assertProtocolMachine(impossibleSequence, scenario)).toThrow(/sequence/i);
    expect(() => assertProtocolMachine(mismatchedTerminal, scenario)).toThrow(/terminal reason/i);
    expect(() => assertProtocolMachine(mismatchedTimeout, scenario)).toThrow(/current attempt/i);
    expect(() => assertProtocolMachine(duplicateTimeout, scenario)).toThrow(/duplicate timeout/i);
    expect(() =>
      assertProtocolMachine(createProtocolMachine(malformedScenario), malformedScenario),
    ).toThrow(/unknown protocol fault/i);
    expect(() =>
      assertProtocolMachine(createProtocolMachine(unknownScenario), unknownScenario),
    ).toThrow(/unknown protocol scenario/i);
    expect(() => assertProtocolScenario(tooShortTimeout)).toThrow(/round trip/i);
    expect(() => assertProtocolScenario(tooManyAttempts)).toThrow(/cannot exceed/i);
  });

  it("terminates the bounded maximum-attempt scenario without obsolete outcomes", () => {
    const scenario: ProtocolScenario = {
      ...getProtocolScenario("receiver-silent"),
      maxAttempts: 20,
    };
    const result = runProtocol(scenario);

    expect(result.machine.status).toBe("failed");
    expect(result.machine.attemptsSent).toBe(20);
    expect(result.frames).toHaveLength(60);
    expect(result.frames.every((frame) => frame.event.outcome !== undefined)).toBe(true);
  });

  it("supports an explicit attempt-limit failure boundary", () => {
    const scenario: ProtocolScenario = {
      ...getProtocolScenario("request-loss"),
      maxAttempts: 1,
    };
    const result = runProtocol(scenario);

    expect(result.frames.map((frame) => [frame.event.kind, frame.event.outcome])).toEqual([
      ["send-request", "dropped"],
      ["timeout", "failed"],
    ]);
    expect(result.machine).toMatchObject({ status: "failed", attemptsSent: 1, queue: [] });
    expect(result.machine.terminal?.reason).toBe("attempt-limit");
  });
});
