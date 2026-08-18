# Protocol Process: architecture evidence

**Scope:** sixth heterogeneous reference course and highest-information follow-up to Program Execution.

**Branch:** `feat/protocol-process-reference-course`

**Review status:** design gate initially REWORK; revised design/implementation passed independent final review after queue validation, receiver-silent teaching evidence, stale-timeout handling, and complete per-fixture attempt/sequence assertions were added.

**Implementation status:** feature-local course complete. No shared runtime, trace, queue, clock, or fault-injection primitive extracted.

## 1. Course question and boundary

> If a sender cannot tell whether a receiver got a message, how can timeout, retry, acknowledgment, and message identity produce reliable delivery?

Protocol Process does not repeat Home Network's IP configuration, routing, ARP, NAT, or path diagnosis. It also does not repeat Program Execution's language control flow. It uses one fixed message (`M42 · MEET AT 3`), one abstract channel, deterministic simulated time, a priority queue, explicit delay, and a bounded fault policy.

The course trajectory is:

```text
predict status + attempt count + timeout meaning
→ choose a fixed loss/availability scenario
→ Step scheduled queue events
→ inspect queue/time/before-after evidence
→ locate first fault and retry
→ compare ACK loss against receiver unavailability
→ Run to terminal status and reconcile counters
```

The lesson now includes four fixed scenarios:

- `no-loss`: one request, one ACK, delivered at tick 5;
- `ack-loss`: receiver accepts once, first ACK is dropped, retry is duplicate-suppressed, delivered at tick 10;
- `request-loss`: first request is dropped, retry is accepted, delivered at tick 10;
- `receiver-silent`: both requests reach an unavailable receiver, no ACK is sent, attempt limit fails at tick 10.

The comparison table exposes status, request attempts, accepted count, duplicate count, ACKs sent, and final tick. This turns fixture comparison into an explicit learner observation rather than a memory task.

## 2. Domain evidence

The feature owns all protocol semantics under `src/features/protocol-process/domain/**`:

- pure `stepProtocol` and `runProtocol`;
- machine-owned simulated time and monotonically increasing queue insertion sequence;
- deterministic delivery-before-timeout-before-local-send ordering for equal ticks;
- delayed request and ACK events;
- first-request loss, first-ACK loss, and silent receiver policies;
- duplicate suppression and ACK-on-duplicate behavior;
- attempt-tagged timeout events and explicit `stale-timeout` evidence;
- terminal queue clearing and identity-preserving terminal no-op;
- complete before/after snapshots including queue, time, counters, sequence, and terminal state.

A Protocol step is one scheduled event, not a clock tick. Time may jump from tick 2 to tick 5 without hidden frames. A queue event carries due tick, event kind, insertion sequence, and attempt number.

Author/runtime validation rejects:

- unknown scenario IDs, empty titles, mismatched scenario/fault pairs;
- invalid positive delays and max attempts;
- timeout values that cannot cover one request plus ACK round trip;
- unknown event kinds, invalid due times, invalid attempts, duplicate/out-of-range sequences, unsorted queues;
- unknown statuses, invalid fault flags, terminal evidence with the wrong reason/tick/status, or non-empty terminal queues.

The validation boundary prevents malformed author data from silently becoming a different protocol event.

## 3. Independent test evidence

The domain test oracle hand-authors all four event kind/time/attempt/outcome sequences, after-frame queue insertion sequences, final counters, terminal state, and queue clearing. It does not derive expected results from the production runner.

Coverage includes:

- exact baseline, ACK-loss, request-loss, and receiver-silent traces;
- equal-time delivery-before-timeout ordering;
- no hidden clock frames;
- insertion/removal/terminal queue boundaries;
- duplicate suppression and ACK counts;
- attempt-limit failure;
- malformed scenarios, event kinds, due times, queue order, sequence bounds, terminal reasons, and too-short timeout configs;
- explicit stale-timeout protection;
- deterministic replay and nested queue/terminal snapshot independence;
- identity-preserving post-terminal stepping.

Lesson tests verify projection boundaries rather than duplicating the entire event oracle: optional prediction fields, one feature step per frame, guided selection/no-op behavior, scenario switch/reset baseline, and terminal idempotence.

## 4. Accessibility and UI evidence

The page exposes:

- semantic native trace buttons with frame, tick, event kind, attempt, and outcome in their names;
- `aria-current` selection and Enter/Space keyboard behavior;
- selected-event evidence with separate queue-before and queue-after tables;
- queue due time, event kind, attempt, and monotonic sequence columns;
- current status/time/event counts and final status/counter evidence as text;
- explicit status/attempt/timeout-meaning prediction controls with optional non-blocking feedback;
- a fixed four-scenario comparison table including ACK counts;
- first-fault and retry guided controls with direct descriptions and no-op behavior when unavailable;
- selected evidence separated from final protocol result;
- a real Playwright `520×900` responsive test specification.

The UI does not run the protocol, sort the queue, compute retries, or reconstruct a second oracle. It dispatches lesson actions and projects feature-local domain evidence.

## 5. What Protocol does to primitive hypotheses

| Hypothesis | Result | Evidence | Decision |
| --- | --- | --- | --- |
| immutable causal evidence | STRONGER, but still local | Queue/time/counter snapshots make a selected event explainable without replay | Keep feature-local; no generic Trace export |
| pure discrete step | SPLIT / narrowed | Pure stepping remains valuable, but Protocol step means scheduled event with queue/time semantics, not Program statement semantics | Reject universal Stepper |
| linear trace/history | FALSIFIED as universal | Queue scheduling, equal-time priority, delayed messages, retries, stale timers, and terminal queue clearing are not a linear statement trace | No shared trace runtime |
| deterministic simulation time | STRONGER | Time jumps are explicit and testable; no wall-clock APIs | Keep protocol clock local |
| event queue | STRONGER, not extraction-ready | Queue snapshots and monotonic insertion order are central to this protocol | No shared queue primitive |
| fault injection | STRONGER, not extraction-ready | First request/ACK loss and silent receiver are causal scenario policies | Keep domain-owned |
| before/after comparison | STRONGER | Selected queue and counter tables explain one event's effect | Do not create generic comparator |
| prediction → intervention → observation → evidence | STRONGER | Status, attempts, and timeout-meaning predictions lead to fixed scenario intervention and observed counters | Keep authoring convention local |
| seeded random stream | UNCHANGED | All outcomes remain deterministic and authored | Monte Carlo remains the direct test |
| representation transformation path | UNCHANGED | Protocol carries a fixed message but does not encode it | UTF-8 remains the direct test |
| editable finite representation | UNCHANGED | No user-edited bytes/fields | UTF-8 remains the direct test |
| tables/derived cells | STRONGER locally | Queue/counter/comparison tables are useful but have protocol-specific provenance and lifecycle | No generic table lesson primitive |
| provenance/lineage | STRONGER locally | Event attempt → queue delivery → ACK/retry causal chain is explicit | Compare later with Relational Data; no extraction |
| deterministic simulation clock | STRONGER | Protocol directly requires an authored clock and scheduler | Reject shared global clock |
| graph/node-edge | UNCHANGED | No topology graph; Home Network remains its own model | Keep local |

## 6. Trace comparison after Protocol

### Protocol vs Program Execution

Both use pure transitions, independent before/after snapshots, and terminal no-ops, but their step semantics now visibly diverge:

- Program step: one language-specific assignment, condition, or print event;
- Protocol step: one scheduled queue event at a due tick;
- Program control is a source-location cursor;
- Protocol control is queue ordering plus simulated time;
- Program has no hidden scheduler or delayed work;
- Protocol must show queued future work, equal-time priority, retry attempts, and stale timeout policy.

The shared structural shape is not an extraction trigger. The semantic contract, event vocabulary, lifecycle, and evidence fields diverge immediately.

### Protocol vs Home Network

Protocol and Home Network both have causal event evidence, but:

- Network is a probe history over a topology/configuration and identifies first path failure;
- Protocol is one evolving endpoint exchange with a scheduler, timeout, retry, and ACK state;
- Network's event history is an intervention result collection;
- Protocol's frames are queue transitions within one exchange.

The resemblance strengthens a narrow authoring principle—inspectable causal evidence—not a shared history model.

### Protocol vs Two's Complement

Two's Complement ripple columns are static derivation evidence. Protocol frames are temporal queue events. A universal trace renderer would misrepresent columns as scheduled events or erase queue/time semantics.

## 7. Extraction decision

**No production primitive is extraction-ready.**

Program and Protocol together provide strong evidence for independent pure feature models and accessible evidence projections, while falsifying:

- universal `Stepper`;
- shared event queue/clock;
- generic fault injector;
- generic trace/history runtime;
- global terminal/status workflow;
- lesson DSL that would encode both source execution and scheduled message semantics.

A tiny immutable evidence-item data shape remains a research hypothesis only. It has no compatible lifecycle or vocabulary across Program, Protocol, Network, and Two's Complement without adapters that would increase rather than reduce complexity.

## 8. Replanning

Protocol delivered the intended high-information scheduler/clock/fault experiment. The next experiment is **UTF-8**, because it now tests the still-unchanged representation-path and editable-finite-representation hypotheses against Audio/Image/Two's Complement. Monte Carlo π follows to test seeded randomness, reproducible streams, sweeps, and convergence evidence. Relational Data follows to pressure provenance, constraints, derived cells, and query result evidence.

## 9. Validation record

Passing local checks:

- `bun run format:check`;
- `bun run lint`;
- `bun run typecheck`;
- constrained `bun run test:run -- --maxWorkers=1 --minWorkers=1` — **36 test files, 252 tests passed**;
- `bun run build`.

`bun run test:e2e` remains environment-blocked: all browser tests fail at Playwright launch because Chromium is missing at the configured cache path. This affects the existing repository E2E suite as well as Protocol and is not a product correctness result.
