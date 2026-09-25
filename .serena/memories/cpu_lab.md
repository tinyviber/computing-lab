# CPU Lab (von Neumann teaching redesign, issue #70)

## Stage model

- Stages live in `src/features/cpu/domain/stages.ts` (`CPU_STAGES`, indices 1–11).
- Core stages 1–6 are guided and contiguous: `cpuStageUnlocked` still gates
  them linearly (index 1, or `index-1` passed). Challenges 7–11 must set
  explicit `unlockAfter` (prerequisite stage indices).
- `nextCpuStage` returns the first unpassed index across the whole list, so
  it walks core → challenges in index order.

## Guided stages

- `CpuStageDef.guided` declares `prefillRows`, `editableRows`, `blankRows`,
  `rowOps`, `prompts`, and optional `bytePlayground`.
- `guidedProgram(stage, rows)` rebuilds the effective program: locked rows
  come from `prefillRows`, editable rows from the draft. Apply it anywhere a
  guided draft is executed or judged — `draftOf` in `lesson/state.ts` and
  `judgeCpuSubmission` in `server/judge/cpu/judge.ts` both call it. Locked
  rows must stay unreachable even via crafted drafts (tested).
- Pass gating: a guided submission needs `guidedComplete: true` on the
  request body (added to `CpuSubmission`); the judge 400s with
  `guided-incomplete` otherwise. `guidedComplete` means every prompt in
  `guided.prompts` was answered, not program correctness.
- Prompts block stepping mid-run: a prompt with `at <= cursor` that is
  unanswered pauses the clock UI until answered.
- In guided stages the editor never inserts/removes/moves rows; jump
  retargeting (`set-row` notices "目标指令移动…") only applies to free stages
  and only to operands with `opOperandMeaning === "addr"` below the row count.

## Hidden cases

- `server/judge/cpu/hiddenSet.ts` builds per-seed cases; `seededInt` is a
  local helper (rng.ts exports only fnv1a/seedFor/makeRng). `decorateCases`
  from `domain/fixtures.ts` sprinkles decoys identically for public + hidden.
- `machine.test.ts` `REFERENCES` must hold the _effective_ program
  (`guidedProgram` output) for guided stages.

## UI contract

- `pending = run.trace[cursor]` is the about-to-commit row; `phase`
  (fetch/decode/exec) is a UI lens on it — no second engine.
- Synchronized highlighting keys off the same trace row: editor `is-active`,
  memory `is-read`/`is-pending-write`, register ghost "→ n", diagram wires
  (`EXEC_WIRES` per op, `PHASE_PARTS` per phase).
