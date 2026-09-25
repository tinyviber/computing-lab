# CPU Lab (von Neumann teaching redesign, issue #70)

## Stage model

- Stages live in `src/features/cpu/domain/stages.ts` (`CPU_STAGES`, indices 1–11).
- Core stages 1–6 are guided and contiguous: `cpuStageUnlocked` still gates
  them linearly (index 1, or `index-1` passed). Challenges 7–11 must set
  explicit `unlockAfter` (prerequisite stage indices).
- `nextCpuStage` returns the first unpassed index across the whole list, so
  it walks core → challenges in index order.
- Stage indices were renumbered vs the pre-#70 lab and `passed_stages` rows
  are NOT migrated — deploy applies a CPU progress reset
  (`UPDATE student_projects SET passed_stages='[]' WHERE lab='cpu'`).

## Guided stages

- `CpuStageDef.guided` declares `prefillRows`, `editableRows`, `blankRows`,
  `rowOps`, `prompts`, and optional `bytePlayground`.
- `guidedProgram(stage, rows)` rebuilds the effective program: locked rows
  come from `prefillRows`, editable rows from the draft. Apply it anywhere a
  guided draft is executed or judged — `draftOf` in `lesson/state.ts` and
  `judgeCpuSubmission` in `server/judge/cpu/judge.ts` both call it. Locked
  rows must stay unreachable even via crafted drafts (tested).
- Pass gating: a guided submission carries `guidedAnswers` (promptId →
  option index, from `state.guidedAnswers`) in `CpuSubmission`; the judge
  400s `guided-incomplete` unless every prompt's picked option is correct.
  It is a learning gate, not security.
- Prompt flow in `lesson/state.ts`: `answer-prompt` records the option index
  in `guidedAnswers[stage][promptId]`; a wrong pick sets `wrongPick`
  ({promptId, option}) and the UI shows only that option's `note` —
  un-picked options must stay indistinguishable (no pre-click hints).
- Prompt step-blocking: a prompt with `at <= cursor` unanswered pauses the
  clock until answered.
- `prompt.caseIndex` pins the demo-case picker: while that prompt is the
  next unanswered, `CpuLabPage` force-selects the case, resets the run, and
  disables the picker. Prompts quote demo data only with a matching pin.
- `prompt.requiresByte` (C4) disables its options until
  `state.playgroundByte` equals it. `playgroundByte` is lesson state (reset
  via `initialPlaygroundByte` = `encodeInstr(prefillRows[0])`, i.e. the
  program's own first byte 0b00001110 — deliberately not the HALT byte).
- Auto-run in guided mode walks beat-by-beat fetch → decode → exec → commit
  (~350 ms/beat) — never skips whole instructions; challenge stages keep the
  per-cycle 500 ms run.
- In guided stages the editor never inserts/removes/moves rows; jump
  retargeting applies to free stages and only to operands with
  `opOperandMeaning === "addr"` below the row count. Removing a row that is
  a jump target (`operand === index`) remaps it to the next row and emits a
  notice (no silent re-point).

## Hidden cases

- `server/judge/cpu/hiddenSet.ts` builds per-seed cases; `seededInt` is a
  local helper (rng.ts exports only fnv1a/seedFor/makeRng). `decorateCases`
  from `domain/fixtures.ts` sprinkles decoys identically for public + hidden.
- `machine.test.ts` `REFERENCES` must hold the _effective_ program
  (`guidedProgram` output) for guided stages.
- `server/routes/cpu.test.ts` `guidedAnswersFor(index)` builds a correct
  answer map from the stage def — reuse it; add a wrong-pick variant to test
  the 400 path.

## UI contract

- `pending = run.trace[cursor]` is the about-to-commit row; `phase`
  (fetch/decode/exec) is a UI lens on it — no second engine.
- Synchronized highlighting keys off the same trace row: editor `is-active`,
  memory `is-read`/`is-pending-write`, register ghost "→ n", diagram wires
  (`EXEC_WIRES` per op, `PHASE_PARTS` per phase).
- `GuidedPanel` is controlled on `state.playgroundByte` (`currentByte` prop)
  for byte-gated prompts; `BytePlayground` is a controlled component
  (`byte`/`onByte`) over the same state.
