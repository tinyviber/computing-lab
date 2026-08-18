# Protocol Process — learner study

Evidence: fresh-browser simulated-persona fallback after subagent-thread exhaustion, plus 4 independent reports received during the same batch. Independence is lower than the other eight labs. Rendered route: `/labs/protocol-process`.

## Intended objective

Answer: when an acknowledgment is late, what can the sender know? Learners should separate receiver acceptance, ACK sent, ACK observed, timeout knowledge, retry, duplicate suppression, and final application delivery. The event queue and simulated clock are the evidence.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Predicted delivered/2 attempts/unknown at timeout; stepped ACK-loss; inspected queue. | Timeout means missing knowledge, not receiver failure; retry can be suppressed. | Accepted/delivered/ACK-observed distinctions. |
| Impatient explorer | Ran default and all four scenarios. | No-loss completes once; ACK loss retries; unavailable receiver fails. | Guided inspection effect not obvious. |
| Careful low-prior | Stepped first request loss and tracked drop/timeout/retry. | Receiver action and sender knowledge are separate. | Tick units and same-tick ordering. |
| Strong computing | Compared no-loss, ACK-loss, request-loss, unavailable receiver. | Message identity enables at-most-once application action with repeated network traffic. | “Attempt” versus “delivery.” |

## Observed interaction

Default ACK-loss trace: request accepted at tick 2; ACK dropped at tick 5; retry arrives at tick 7 and is duplicate-suppressed; second ACK reaches sender at tick 10. No-loss completes at tick 5; first-request-loss succeeds after retry; unavailable receiver fails after two attempts. The page’s queue, trace, counters, and scenario comparison were stronger than the static prose.

## Frozen transfer and expected result

- One-way delay 30 ms, immediate ACK: sender observes success at 60 ms; ACK is generated at 30 ms.
- First data lost, timeout 100 ms, retry arrives at 140 ms: one application delivery; sender success at 180 ms.
- Data arrives at 60 ms, ACK held until 130 ms, timeout at 100 ms, retry arrives at 160 ms: one application delivery; first sender success at 190 ms; later duplicate ACK at 220 ms.

One learner reported 180 ms for the second case and another initially treated “held until 130” as arrival. The independent assessment key resolves the stated transport as 40 ms each way, so the expected answers above are the analysis baseline.

## Alignment

**Strong causal alignment; partial vocabulary/timing.** The core model changed in the intended direction for all observed personas. Teacher must distinguish “receiver did” from “sender knows.”

## 5–15 minute teacher flow

Hook: “No ACK — did the receiver fail?” Commit. Step ACK-loss until the first drop; ask what the sender knows now. Inspect retry and duplicate evidence. Contrast no-loss with receiver-unavailable. Name uncertainty, message identity, idempotence, and duplicate suppression. Transfer the three timing cases. Teacher silence target: 3/5 until labels explicitly say sent/generated/observed.

