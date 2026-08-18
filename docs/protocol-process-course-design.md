# Protocol Process course design

**Status:** implementation-ready design; feature-local, no shared primitive extraction.

## Research question

> If a sender cannot tell whether a receiver got a message, how can timeout, retry, acknowledgment, and message identity produce reliable delivery?

This course is intentionally not another network-topology course. Home Network asks where a packet travels and why a path fails. Protocol Process asks how endpoints recover when delivery status is uncertain.

## Scope

The experiment uses one instructor-authored message:

- message ID: `M42`;
- message text: `MEET AT 3`;
- sender: `A`;
- receiver: `B`;
- one abstract channel;
- deterministic simulated time;
- request delay: `2` ticks;
- acknowledgment delay: `3` ticks;
- timeout: `5` ticks;
- maximum request attempts: `2`;
- author validation requires timeout to cover one request plus acknowledgment round trip, so every legal timeout is consumed before a retry can become current.

There is no real network, socket, IP address, route, ARP, NAT, arbitrary message editor, randomness, wall-clock timer, or learner-editable protocol language.

## Fixtures

### `no-loss`

The first request and first acknowledgment arrive normally. Expected processed events:

| Frame | Time | Event                             | Outcome                |
| ----: | ---: | --------------------------------- | ---------------------- |
|     0 |    0 | send request, attempt 1           | queued for delivery    |
|     1 |    2 | deliver request, attempt 1        | receiver accepts `M42` |
|     2 |    2 | send acknowledgment, attempt 1    | queued for delivery    |
|     3 |    5 | deliver acknowledgment, attempt 1 | sender completes       |

Final status is `delivered`; attempts sent `1`; receiver accepted count `1`; duplicate count `0`; acknowledgments sent `1`; final simulated time `5`.

### `ack-loss` (default)

The first acknowledgment is dropped at delivery. The receiver has already accepted the message, so the retry creates a duplicate arrival. The receiver suppresses duplicate application delivery but sends another acknowledgment.

Expected processed events:

| Frame | Time | Event                             | Outcome                   |
| ----: | ---: | --------------------------------- | ------------------------- |
|     0 |    0 | send request, attempt 1           | queued for delivery       |
|     1 |    2 | deliver request, attempt 1        | receiver accepts `M42`    |
|     2 |    2 | send acknowledgment, attempt 1    | queued for delivery       |
|     3 |    5 | deliver acknowledgment, attempt 1 | dropped by injected fault |
|     4 |    5 | timeout                           | retry attempt 2 scheduled |
|     5 |    5 | send request, attempt 2           | queued for delivery       |
|     6 |    7 | deliver request, attempt 2        | duplicate suppressed      |
|     7 |    7 | send acknowledgment, attempt 2    | queued for delivery       |
|     8 |   10 | deliver acknowledgment, attempt 2 | sender completes          |

Final status is `delivered`; attempts sent `2`; receiver accepted count `1`; duplicate count `1`; acknowledgments sent `2`; final simulated time `10`.

### `request-loss`

The first request is dropped. The receiver never sees attempt 1. The timeout schedules attempt 2, which is accepted normally.

Expected processed events:

| Frame | Time | Event                             | Outcome                   |
| ----: | ---: | --------------------------------- | ------------------------- |
|     0 |    0 | send request, attempt 1           | dropped by injected fault |
|     1 |    5 | timeout                           | retry attempt 2 scheduled |
|     2 |    5 | send request, attempt 2           | queued for delivery       |
|     3 |    7 | deliver request, attempt 2        | receiver accepts `M42`    |
|     4 |    7 | send acknowledgment, attempt 2    | queued for delivery       |
|     5 |   10 | deliver acknowledgment, attempt 2 | sender completes          |

Final status is `delivered`; attempts sent `2`; receiver accepted count `1`; duplicate count `0`; acknowledgments sent `1`; final simulated time `10`.

### `receiver-silent`

The request reaches an unavailable receiver twice. No acceptance or acknowledgment occurs, so the sender exhausts its two attempts. This fixture makes the contrast with `ack-loss` explicit: a timeout alone is ambiguous, but the final evidence differs when the receiver never accepts the message.

Expected processed events:

| Frame | Time | Event                      | Outcome                   |
| ----: | ---: | -------------------------- | ------------------------- |
|     0 |    0 | send request, attempt 1    | queued for delivery       |
|     1 |    2 | deliver request, attempt 1 | receiver unavailable      |
|     2 |    5 | timeout                    | retry attempt 2 scheduled |
|     3 |    5 | send request, attempt 2    | queued for delivery       |
|     4 |    7 | deliver request, attempt 2 | receiver unavailable      |
|     5 |   10 | timeout                    | attempt limit reached     |

Final status is `failed`; attempts sent `2`; receiver accepted count `0`; duplicate count `0`; acknowledgments sent `0`; final simulated time `10`.

## Event ordering and clock contract

The domain model owns a feature-local priority queue. Each queued event has a due time and a globally monotonic machine-owned insertion sequence. Processing one event is one protocol step. There are no invisible tick frames. Queue snapshots expose the sequence so equal-time ordering is inspectable.

For equal due times, event priority is deterministic:

1. delivery events;
2. timeout events;
3. locally generated send events.

This makes `ack-loss` causal: the first acknowledgment is delivered at time `5` before the timeout, then the explicit fault drops it; the timeout observes that no acknowledgment arrived and schedules retry.

A timeout event is tagged with its request attempt. Under this lesson's legal timing contract, a queued timeout always belongs to the current attempt: delivery wins equal-time ties, and the timeout is consumed before a retry is scheduled. Machine validation rejects fabricated queues with a timeout from another attempt, duplicate timeout events, or a request that is not the next attempt. Scenario validation also rejects a timeout shorter than one request plus acknowledgment round trip and caps attempts at twenty so the fixed experiment has a finite step budget.

A step:

1. removes exactly one eligible queued event;
2. advances simulated time to that event's due time, never by a hidden tick;
3. applies the event and explicit fault policy;
4. schedules any resulting local or delivery events;
5. returns a fresh machine and a frame containing independent before/after snapshots.

The domain validates every scenario and machine boundary: known event kinds, finite non-negative ticks, positive attempts, unique monotonic sequences, sorted queue order, due times at or after the current clock, and terminal/status consistency. Malformed author data is rejected rather than interpreted as a different event.

Successful acknowledgment or exhausted attempts clears the remaining queue. The before/after queue snapshots make that cancellation visible; no separate generic cancellation event is introduced. A terminal step is an identity-preserving no-op.

## Domain contracts

```ts
export type ProtocolScenarioId = "no-loss" | "ack-loss" | "request-loss" | "receiver-silent";

export type ProtocolStatus = "running" | "delivered" | "failed";

export type ScheduledProtocolEvent = {
  kind: "send-request" | "deliver-request" | "send-ack" | "deliver-ack" | "timeout";
  dueAt: number;
  sequence: number;
  attempt: number;
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
};

export type ProtocolFrame = {
  index: number;
  event: ProtocolEventEvidence;
  before: ProtocolSnapshot;
  after: ProtocolSnapshot;
  terminal?: ProtocolTerminalEvidence;
};
```

`ProtocolSnapshot` includes time, status, attempts, accepted/duplicate/ack counters, and the complete sorted queue. Event evidence identifies the event kind, attempt, time, outcome, and causal explanation. The model does not expose a generic `Trace`, `Stepper`, `Clock`, `Queue`, or `FaultInjector` export.

## Lesson trajectory

1. Read the sender/channel/receiver explanation and make three optional predictions: final status, request-attempt count, and what a timeout alone proves.
2. Choose one fixed scenario: no loss, first acknowledgment loss, first request loss, or receiver unavailable.
3. Step through the first request and inspect the queue/time evidence.
4. In `ack-loss`, inspect the first lost acknowledgment and then the timeout. The receiver already accepted the message, so timeout is not proof of receiver failure.
5. Step through retry and duplicate suppression.
6. Run to completion and reconcile final status, attempts, accepted count, duplicate count, acknowledgment count, and simulated time.
7. Compare the fixed result table across all four scenarios, especially `ack-loss` versus `receiver-silent`.

Guided controls are local and non-blocking:

- **Inspect first fault** selects the first dropped or receiver-unavailable event when present;
- **Inspect retry** selects the timeout frame when present;
- an unavailable target is disabled and leaves selection unchanged.

## Accessibility requirements

- use a named workspace region and a named experiment-controls region;
- render the event history as a semantic ordered list of native buttons;
- include frame index, simulated time, event kind, attempt, and outcome in each accessible trace name;
- expose `aria-current="true"` only for the selected frame;
- render captioned/scoped queue tables for the selected before/after snapshots, including due tick, event, attempt, and insertion sequence;
- render counters, terminal status, fault explanation, and time as text rather than color or animation;
- provide a labeled prediction control with optional, non-blocking feedback;
- provide direct accessible descriptions for disabled guided controls;
- keep Step, Run, Reset, scenario selection, and trace selection keyboard-operable;
- test a real narrow viewport in Playwright in addition to semantic jsdom tests.

## Independent test oracle and review gates

Tests must hand-author the exact event kind/time/outcome sequence for all four fixtures, plus final counters and queue boundaries. The lesson tests verify projection boundaries without duplicating the entire domain event oracle. Tests must not derive expected values from `runProtocol` or `stepProtocol`.

Required domain tests:

- exact no-loss, acknowledgment-loss, request-loss, and receiver-silent frame sequences;
- tie ordering at time `5` for delivery before timeout;
- no hidden clock frames when time jumps;
- queue insertion/removal and terminal queue-clearing evidence;
- duplicate suppression and ACK-on-duplicate behavior;
- timeout retry and maximum-attempt failure boundary;
- terminal idempotence;
- fabricated timeout/attempt mismatches and duplicate timeout events are rejected;
- runtime-free deterministic replay and no mutation of input or returned snapshots;
- scenario validation and malformed event/config rejection.

Required lesson/UI tests:

- prediction remains optional;
- Step and Run project the domain trace without a second event oracle;
- first-fault and retry guided selection/no-op behavior;
- selected queue versus final status labels are unambiguous;
- keyboard trace selection and `aria-current`;
- fixture switching/reset-to-URL-baseline;
- narrow semantic evidence.

The UI includes a fixed domain-owned comparison table with status, request attempts, accepted count, duplicate count, acknowledgments sent, and final tick for all four fixtures. It is an explicit learner observation task, not a hidden second run.

The final review must explicitly answer:

- Is a Protocol step an event, delivery, queue operation, or clock tick?
- Does deterministic simulated time require a different transition contract than Program Execution?
- Are queue snapshots essential evidence or an implementation detail?
- Does a fault-injection policy create a reusable primitive or only feature-local protocol semantics?
- Does this course strengthen or falsify any extraction hypothesis without sharing a runtime?

## Architectural experiment conclusion

A Protocol step is one scheduled protocol event, not a statement, expression, iteration, or clock tick. Simulated time can jump from tick `2` to tick `5` without invisible frames, and equal-time delivery/timeout ordering is semantic evidence. Queue snapshots are essential in this course because they explain what is in flight, why a retry exists, and which queued work is cleared at terminal completion.

Protocol therefore **falsifies a universal Stepper and shared semantic trace runtime** while strengthening a narrower hypothesis: independent features can author immutable, inspectable causal items with before/after snapshots. The structural resemblance is not an extraction trigger because Program steps are language control events, Protocol steps are scheduled queue events, Network entries are probe histories, and Two's Complement entries are static ripple columns. Fault policy, simulated time, queue ordering, and duplicate suppression remain feature-local.
