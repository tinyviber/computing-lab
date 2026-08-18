# Program Execution / Loop & Variable Tracing: architecture evidence

**Scope:** fifth heterogeneous reference course; design, implementation, adversarial review, and test evidence.

**Branch:** `feat/program-execution-reference-course`

**Review status:** independent course-design gate PASS; independent post-implementation domain, pedagogy, accessibility, and architecture gate PASS after rework.

**Implementation status:** feature-local course complete. No shared interactive-learning primitive extracted.

## 1. Course model

The course uses three instructor-authored pseudo-code fixtures rather than a parser or source editor:

- `sum-1-to-3`: `total`, `i`, `while i <= 3`, output `6`;
- `zero-iterations`: first condition is false, output `10`, body count `0`;
- `off-by-one`: `count`, `i`, `while i < 3`, output `3`, body count `3`.

The learner trajectory is:

```text
optional output prediction
→ Step through initialization, condition, and two body assignments
→ inspect before/after variable frames
→ Run to end
→ inspect the false loop condition
→ reconcile output and final environment
→ compare zero-iteration / off-by-one fixtures
```

There is no free-form code, parser project, submit/check gate, score, global status, animation scheduler, or mandatory completion workflow.

## 2. Domain correctness evidence

The feature owns a structured program model, pure expression evaluation, machine control locations, frame evidence, and scenario/reducer state under `src/features/program-execution/**`.

The local step contract is deliberately specific:

- one assignment, while-condition, or print event per running step;
- false while checks are selectable loop-exit evidence;
- final output carries `program-complete` evidence;
- runtime errors preserve the valid before environment/output/control and expose structured error evidence;
- a deterministic 64-event safety cutoff is distinct from normal completion;
- terminal stepping is an identity-preserving no-op;
- complete traces are produced by folding the same pure step used by the Step control.

The final implementation validates structured author data:

- safe integer literals and initial values;
- valid operators;
- unique, ordered statement/source mappings;
- display-only `end` lines associated with loop bodies;
- no unmapped source lines or executable statements masquerading as `end`.

Adversarial tests cover:

- independently authored default-fixture reference oracle;
- exact event/source-line sequences for all three fixtures;
- zero iterations and `<` boundary behavior;
- undefined-variable and unsafe-number runtime errors;
- left-to-right error selection;
- condition-counter behavior on failed evaluation;
- exact step-limit count and precedence over the next runtime error;
- nested environment/output/control/terminal snapshot independence;
- invalid operators, duplicate/reversed source mappings, missing/misordered `end` lines;
- post-completion, post-runtime-error, and post-step-limit idempotence;
- scenario hydration, first-value fallback, fixture switching, reset-to-URL-baseline, and invalid prediction handling.

## 3. Accessibility and UI evidence

The UI exposes:

- a named semantic ordered source list with line numbers;
- native keyboard-focusable trace buttons with frame, source line, event kind, and outcome in their accessible names;
- `aria-current="true"` for exactly the selected frame;
- Tab movement plus Enter/Space selection tests;
- real captioned/scoped variable tables;
- textual substituted condition evidence (`4 <= 3 → false`);
- text before/after changes (`total: 0 → 1`, `i: 1 → 2`);
- labeled `<output>` and explicit terminal text;
- disabled guided controls with accessible explanations;
- a separate `FINAL PROGRAM RESULT` card and `Variables after frame N` selected evidence, avoiding mixed selected/final semantics;
- a real Playwright narrow-viewport specification at `520×900`.

The React page contains no evaluator, parser, iteration counter, or second computation oracle. It only formats domain evidence and dispatches feature-owned lesson actions.

## 4. Trace comparison: Network and Two's Complement

### Program vs Home Network

There is a meaningful evidence resemblance:

- both expose ordered causal events;
- both support selecting a historical event/frame;
- both preserve before/after or event-local evidence;
- both benefit from immutable committed evidence snapshots;
- both support a prediction before an intervention and observation afterward.

But their semantics are not identical:

- Network traces are probe histories with a configuration snapshot, packet/path events, first failure, and a committed result per probe;
- Program frames are one evolving machine execution with a control location, environment/output snapshots, and one language-specific event per step;
- Network retains multiple learner interventions as history; Program resets/re-runs one machine and does not retain a probe-history collection;
- Network events have network/path vocabulary and may include transformed packets; Program events have statement/condition/output vocabulary.

**Conclusion:** a small ordered immutable evidence-item contract remains plausible, but a shared execution trace, history model, controller, or renderer is not compatible enough for extraction.

### Program vs Two's Complement ripple evidence

The resemblance is weaker:

- Two's Complement columns are a static decomposition of one ripple computation;
- columns do not form a learner-controlled evolving machine;
- column state is local per bit position, not a complete before/after environment;
- column selection can explain arithmetic evidence but does not imply a program counter or discrete execution step.

**Conclusion:** a common trace UI would erase the distinction between event history and static derivation. Keep ripple evidence feature-local.

### Frames vs deltas

Complete immutable snapshots were useful in Program:

- the selected frame can explain itself without consulting moving machine state;
- the variable table is trivial to derive from the selected frame;
- before/after mutation and loop-entry/exit evidence are testable;
- no event replay is needed to reconstruct the selected state.

This does not prove that every consumer should store full snapshots. Network already has event-specific transformed packet/path evidence, and Two's Complement has column-local evidence. The evidence supports “immutable inspectable causal item” more than “universal frame schema.”

### What does one step mean?

Program execution made the mismatch explicit:

- one step is a language-specific statement/control event;
- a loop condition is a step;
- each body assignment is a separate step;
- a loop back-edge is represented by the next condition location, not by a hidden synthetic event.

A future protocol course with delayed messages, event queues, retries, or simulated time will likely require a different step granularity. A universal Stepper remains rejected.

## 5. Primitive evidence matrix after Program Execution

| Candidate                          | Status    | Evidence from Program                                                                                                       | Extraction trigger / falsification condition                                                    | Next information gain                             |
| ---------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| immutable trace                    | STRONGER  | Local frames are stable, self-contained, snapshot-based, and independently testable; Network shares ordered causal evidence | Need two consumers with compatible item fields without adapters; protocol may falsify linearity | Protocol with delay/retry/event ordering          |
| trace selection                    | STRONGER  | Historical frame selection is useful and keyboard-accessible                                                                | Keep local until two consumers share selection semantics and accessibility contract             | Protocol vs Network event selection               |
| pure discrete step                 | STRONGER  | `stepProgram` is pure, deterministic, testable, and reused by Run                                                           | Reject if future course needs clocks, queues, branches, or incompatible granularity             | Protocol process                                  |
| seeded random stream               | UNCHANGED | No stochastic behavior                                                                                                      | Two independent stochastic courses required                                                     | Monte Carlo π, then randomized algorithm          |
| inquiry cycle                      | STRONGER  | Prediction, Step/Run intervention, observation, and evidence form a natural non-blocking path                               | No shared workflow/runtime; reject if it introduces status/submit semantics                     | Monte Carlo or protocol fault                     |
| representation transformation path | UNCHANGED | Program changes machine state, not representation encoding                                                                  | Need a second compatible transformation chain                                                   | UTF-8                                             |
| editable finite representation     | UNCHANGED | No arbitrary editable representation; fixtures are intentionally fixed                                                      | UTF-8 must demonstrate safe byte editing without becoming a converter                           | UTF-8                                             |
| coordinate/object inspection       | STRONGER  | Source line, control location, frame, and variable object are inspectable                                                   | Coordinate and object semantics may remain feature-local                                        | UTF-8 byte/character coordinates                  |
| table/derived-cell contract        | WEAKER    | Variable table is a snapshot projection, not a derived-cell spreadsheet/table semantic                                      | If table consumers need different provenance/derivation, keep HTML tables local                 | Relational Data                                   |
| graph/node-edge                    | UNCHANGED | No graph model                                                                                                              | Protocol/network topology may provide a second graph consumer, but semantics must align         | Protocol                                          |
| pipeline                           | UNCHANGED | No representation pipeline; control flow is not a pipeline                                                                  | UTF-8 or protocol transformation chain may strengthen                                           | UTF-8                                             |
| provenance/lineage                 | STRONGER  | Every frame links source line → evaluation → environment/output change; this is causal lineage, not data lineage            | Relational Data must show row-level source/result reasons; compare vocabulary                   | Relational Data                                   |
| before/after comparison            | STRONGER  | Full snapshots and text diffs make assignment/condition effects legible                                                     | No generic comparator; extraction only if fields stay tiny                                      | Relational query result or protocol fault         |
| parameter sweep                    | UNCHANGED | Fixture switching is controlled re-run, not a sweep                                                                         | Monte Carlo sample-count/seed comparison may pressure it                                        | Monte Carlo π                                     |
| fault injection                    | UNCHANGED | No injected fault in this course                                                                                            | Protocol loss/retry is the strongest test                                                       | Protocol                                          |
| invariant/range evidence           | STRONGER  | Safe-integer validation, condition outcomes, counters, and terminal distinctions expose local invariants                    | Keep domain-owned until invariant shape converges across consumers                              | Monte Carlo convergence or relational constraints |
| deterministic simulation time      | UNCHANGED | No time or scheduler                                                                                                        | Protocol delay/timeout course is the direct test                                                | Protocol                                          |
| low-level design-system fields     | UNCHANGED | Course uses existing shell and local CSS; no new design primitive                                                           | Extract only repeated visual/accessibility mechanics after multiple consumers                   | UTF-8 / protocol UI comparison                    |

## 6. Extraction decision

**No new production primitive is extraction-ready.**

The course strengthens the evidence for:

- feature-local pure deterministic model boundaries;
- immutable inspectable causal evidence;
- feature-local pure discrete transitions;
- non-blocking prediction → intervention → observation → evidence authoring;
- accessible text/table evidence.

It does not justify:

- `LessonRuntime`;
- `ExperimentEngine`;
- `Stepper`;
- generic `Trace` UI or event bus;
- generic variable table;
- generic validator/comparator;
- shared program interpreter;
- configuration-driven lesson DSL.

The only extraction candidate worth carrying forward is a possible very small immutable data/evidence shape, but it is not extraction-ready because Program, Network, and Two's Complement still disagree on item vocabulary, lifecycle, state granularity, and renderer semantics.

## 7. Replanning

The next highest-information course is **Protocol Process**, moved ahead of UTF-8 for the next experiment. Program Execution strengthened linear immutable frames and pure steps; Protocol can directly try to falsify them with ordered messages, delayed delivery, retry/timeout, controlled loss, and deterministic simulated time. UTF-8 follows as the representation-path and editable-byte experiment. Monte Carlo then tests reproducible randomness, followed by Relational Data for provenance/constraint/table pressure.

This reorder is deliberate and does not skip UTF-8; it prioritizes the architectural question with the highest current information gain.

## 8. Validation record

Passing local checks for this course:

- `bun run format:check`
- `bun run lint`
- `bun run typecheck`
- `bun run test:run` — full suite passed (228 tests at final review)
- `bun run build`

Playwright E2E was specified, including the Program trajectory and a `520×900` responsive case, but browser execution is blocked by the environment's missing Chromium executable. This is documented as an environment blocker, not a product correctness result.
