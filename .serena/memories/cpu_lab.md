# CPU Lab (von Neumann five-part datapath — observation-first, issue #70 + #100)

## Stage model

- Stages live in `src/features/cpu/domain/stages.ts` (`CPU_STAGES`, indices 1–11).
- Issue #100 re-cut the lab into a **zero-programming** three-stage 点餐机
  mainline: students observe the five parts, predict, and step the clock —
  they never author a program. 必修 2 target is parts + data/control flow +
  fetch→decode→execute, NOT assembly.
  - **1 `press-the-clock`** (core): LOAD→STORE→HALT fixed; `io {input:14, output:15}`.
  - **2 `byte-secret`** (core): "一个 byte 两种读法" — same fixed copy
    M[11]→M[15]; `bytePlayground` byte observer shows one 8-bit cell read as
    a number AND decode as an instruction (stored-program insight).
  - **3 `alu-inside`** (core): LOAD→ADD→STORE→HALT fixed; `io {14,15}`; the
    ALU column-add (9+8=0001, 第5位灯) is shown.
  - **4–6** challenges (missing-instruction / branch-is-data JZ / branch-back)
    keep `editableRows` — optional side-branch authoring. **7–11** (X1–X4)
    are free-assembly stages, unchanged, for students who go deeper.
- Core stages unlock linearly (`index===1 || passed(index-1)`); challenges
  need `unlockAfter`. `nextCpuStage` walks core first, then challenges.
- Stage indices were re-cut at v10 (progress/submission reset in
  `server/db/client.ts` migration). **No v11 needed** — this redesign keeps
  the same stage indices and server contract, only reshapes the front end
  and the M2 stage def.

## 点餐机 I/O

- `CpuStageDef.io` declares `{input?, output?}` — fixed cell numbers,
  presentation only; the machine treats them as ordinary memory cells.
- `MemoryGrid` takes `inputCell`/`outputCell` → `.is-input`/`.is-output`
  badges + 拨码开关/数码管 legend. `BlockDiagram` takes them too and lights the
  input/output box only when the pending op's operand equals that cell.

## Guided stages

- `CpuStageDef.guided` declares `prefillRows`, `editableRows`, `blankRows`,
  `rowOps`, `prompts`, and optional `bytePlayground`.
- `guidedProgram(stage, rows)` rebuilds the effective program: locked rows
  come from `prefillRows`, editable rows from the draft. On a core stage
  `editableRows` is `[]`, so the submitted draft is dropped entirely and the
  fixed prefill program is judged — a hostile draft can't reach it (tested).
  Apply it anywhere a guided draft runs: `draftOf` in `lesson/state.ts` and
  `judgeCpuSubmission` in `server/judge/cpu/judge.ts`.
- Pass gating: a guided submission carries `guidedAnswers` (promptId →
  option index); the judge 400s `guided-incomplete` unless every prompt's
  picked option is correct. A learning gate, not security.
- `GuidedPanel` reads `stage.guided.prompts` directly and displays options in
  a stable per-user seeded order but sends original option indices.
  `/guided-answer` stores the first pick in `cpu_guided_first_answers`; the
  judge reads this table for `testSummary.predictions`.
- `prompt.at` blocks the stepper once `cursor >= at` until answered;
  `prompt.caseIndex` pins the demo-case picker; `prompt.requiresByte`
  disables options until `state.playgroundByte` equals it.
- `initialPlaygroundByte` = `encodeInstr(prefillRows[0])` — M2's observer
  starts on the program's own first byte (LOAD A,M[11] = 11) so the learner
  sees a byte that also decodes.
- Auto-run in guided mode walks beat-by-beat fetch → decode → exec → commit
  (~350 ms/beat) — never skips whole instructions; challenge stages keep the
  per-cycle 500 ms run.

## Hidden cases

- `server/judge/cpu/hiddenSet.ts` builds per-seed cases; `seededInt` local;
  `decorateCases` from `domain/fixtures.ts` sprinkles decoys identically for
  public + hidden. M2's cases assert the fixed M[11]→M[15] copy (no seeded
  target — that machinery was removed in the observation redesign).
- `machine.test.ts` `REFERENCES` holds the _effective_ program
  (`guidedProgram` output) per stage.
- `server/routes/cpu.test.ts` `guidedAnswersFor(index)` builds a correct
  answer map from the stage def — reuse it.

## UI contract

- CPU is the Controller/Workspace pilot: `ui/CpuLabPage` wires auth/routing/layout; `controller/useCpuLabController` owns persistence, prompt recording, judge and playback. `controller/createViewModel` derives gates/highlights from the one run; `controller/viewModel` is the presentation contract. `CpuWorkspace`, rail and guide consume model/actions, never lesson dispatch or API.
- Fixed preview scenes under `cpu/preview` reuse the real Workspace without live hooks; route `__dev/labs/cpu` and its lazy import are DEV-only. `App` skips auth refresh on that dev route and resumes on exit. iframe widths trigger real media queries; actions record intents only. See `docs/agent/ui-tasks.md` for visual task scope and standalone Vite Playwright harness.
- CPU presentation runtime imports cannot reach controller/lesson/API/machine/stages; type-only imports and ISA display formatting are allowed. Architecture tests check transitive runtime edges including dynamic imports/re-exports.

- `pending = run.trace[cursor]` is the about-to-commit row; `phase`
  (fetch/decode/exec) is a UI lens on it — no second engine.
- Synchronized highlighting keys off the same trace row: editor `is-active`,
  memory `is-read`/`is-pending-write`, register ghost "→ n", diagram wires
  (`EXEC_WIRES` per op, `PHASE_PARTS` per phase).
- Trace no-spoiler (issue #100): `TraceTable` renders only walked rows;
  the end row and "共 N 个周期 + reason" header appear only once the run
  is fully walked. The judge's `TraceRows` counterexample replay still
  shows the full trace.
- **Playback-keyed machine view** (issue #100 review): `cursor`/`visited`/
  `phase` live in `playbackViews[playbackId]` where `playbackId` =
  `caseIndex-replayFlag-rowsContent`. A case/replay/program switch changes
  the key, so the new run's view defaults to `{0,0,fetch}` on the SAME
  render — no reset effect, no transitional-render race. `visited` only
  grows (scrub-back keeps walked rows); `commitCycle` is the ONLY cursor
  writer that bumps `visited` and marks a finished public case observed.
  Do NOT reintroduce a bare `cursor` useState + reset effects — that's the
  race the reviewer flagged.
- **`TraceRows` full-trace contract** (issue #100 review — the P1): it
  always receives the FULL `trace` plus a `visibleCount`; each row's
  "regs after" reads `trace[row.cycle].regsBefore` (the NEXT row) or
  `finalRegs` on the last. Never derive regs-after from a sliced array —
  a truncated last row would fall back to terminal regs and misreport
  intermediate values (e.g. showing final A=8 on a cycle that committed 3).
- **Observation gate** (issue #100 review): `observedCases` is a Set of
  public-case indices that reached HALT (tracked in the controller, reset per
  stage); `observationComplete` requires every public case on a `core`
  stage. Submit is `disabled` until it holds, with a "已看 N / M 份" note.
- M3's ALU column add lives in `RegistersPanel`'s `ColumnAdd` — only on
  stage index 3 during the exec phase it lays out `augend ± addend` as 5
  columns with the carry-out column lit.
- A guided stage with `editableRows: []` renders `ProgramEditor` as a
  read-only program listing (note text adapts via `readOnly`).
- `GuidedPanel` is controlled on `state.playgroundByte` (`currentByte` prop)
  for byte-gated prompts; `BytePlayground` is a controlled component
  (`byte`/`onByte`) over the same state.
