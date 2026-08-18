# Program Execution — learner study

Evidence: 4 independent blinded persona passes. Rendered route: `/labs/program-execution`.

## Intended objective

Answer: what changes after each statement and loop-condition check, and why does the program eventually produce its result? The fixtures cover sum, zero iterations, and off-by-one behavior. The event trace must show before/after environment, output, counters, body entry, final false condition, and completion.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Stepped sum, selected earlier frames, inspected variables. | Conditions happen before body; final false check is part of completion. | Frame/fixture wording. |
| Impatient explorer | Ran default, then zero-iteration and off-by-one fixtures. | A loop may execute zero times; later print still runs. | Historical frame shown near final output. |
| Careful low-prior | Recorded variable changes and loop-stop event. | Named boxes and event order explain the output. | “Intervene” language. |
| Strong computing | Compared condition checks, body entries, and final output. | Selecting a frame inspects history; it does not rewind execution. | Check versus body counts. |

## Observed interaction

The code panel, Step/Run controls, variables, and trace formed a clear causal path. All four solved transfer: `x=2; for i=1..3 x+=i` ends at 8; conditional count states 2,1,4,3 ends at 3; while fixture states `(2,1,"B"),(1,3,"BA"),(0,4,"BAB")`, ending `0 4 BAB` when printed.

## Alignment

**Strong.** High transfer and teach-back quality. Only the presentation of historical selection versus final state needs tightening.

## 5–15 minute teacher flow

Hook: predict output before first Step. Step one condition, one body, and the final false check. Ask “what changed first?” and “which frame is history, not rewind?” Contrast zero-iteration and off-by-one fixtures. Name environment, condition, body, and completion. Transfer: a new branch/loop trace. Teacher silence target: 5/5.

