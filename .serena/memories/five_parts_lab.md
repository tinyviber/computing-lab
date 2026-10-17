# Five-Parts Lab (计算机是怎么工作的？, issue #115)

Replaced the retired `cpu` assembly lab (supersedes #58/#70/#100). Lab id
`five-parts`; routes `/labs/five-parts` and `/classes/$classId/labs/five-parts`;
dev preview `/__dev/labs/five-parts` (DEV only).

## Layout

`domain/` (`demo.ts` — five part defs + 4-step captions + `clampDigit`/`sum`;
`stages.ts` — four stage defs, each question page carries `question`
{prompt, options} with NO correct flag; `storage.ts` — memory-vs-storage
essay model `applyStorageOp`/`sanitizeStorage`; `phone.ts` — 5-step photo
walkthrough + `phoneTags`; `protocol.ts` — `FivePartsDraft
{a,b,step,answer,storage}` + judge result carrying `stageIndex`/`feedback`),
`lesson/state.ts` (reducer: set-input clamps + restarts step, set-step
bounded per page via `stepCountFor`, set-answer clears that page's verdict,
storage-op, autosave flags, save-conflict actions; verdicts are stored
per page in `verdicts[stageIndex]`; `sanitizeDraft(raw, stageIndex)` is the
server-side boundary),
`controller/` (`useFivePartsLabController`, `createViewModel`, `viewModel`),
`ui/` (thin `FivePartsLabPage` + `FivePartsWorkspace` + `fiveParts.css`,
`fp-` namespace), `preview/` fixtures + `FivePartsPreviewPage`.
Same pilot ESLint boundary as decoding's `ui/` (no value imports of
controller/lesson/`domain/stages`; shared hooks/api/auth banned; page file
exempt). StageRail items come from the view model (`rail.items` carries
id/title/unlocked) so the workspace never imports `domain/stages`.

## Teaching model

- Four stages (`FIVE_PARTS_STAGES`). Pages 1–2 are the #115 acceptance spec
  and must stay as-is: 1 "observe" walks a fixed 4-step caption script over
  five part cards (inputs A/B 0–9, default 3/5, changing one restarts the
  run); 2 "think" asks「是谁指挥运算器进行加法的？」. Added for 通识 (not
  assembly): 3 "storage" — open/write/save/cpu-read/power-off/power-on on one
  essay so students SEE memory clear on power-off while storage keeps the
  saved file, and the CPU only reading what is in memory; 4 "phone" — one
  photo mapped onto the parts, the touch screen tagged input then output.
- Unlock: stage 1 always; stages 2–4 once stage 1 passed — questions never
  gate each other (#115: no blocking flow). Page 2's continue is the only
  forced action (it records the observation).
- Correct ids AND per-option feedback copy exist ONLY in
  `server/judge/five-parts/judge.ts` (`ANSWER_KEYS` by stage id); wrong-pick
  copy points back to the experiment, never names the answer. Unknown
  option ids → 400 (not a recorded attempt). The client renders
  `outcome.feedback`; previews use synthetic copy.
- Wording guardrails (textbook 口径): 存储器 = 内存 + 外存; "CPU 要处理的数据
  先放进内存" (not "only"); memory volatile / storage not (no ROM); touch
  screen = input AND output; speed only relative (no numbers); use 命令,
  never 指令; uppercase acronyms only CPU/GB — FORBIDDEN is a case-sensitive
  substring regex (PC, IR, LOAD, STORE...).
- Stage 1's submission is the observation itself: `continueToThink` posts
  `{stageIndex:1, a, b}` (judge validates digits 0–9, 400s otherwise, then
  passes + advances). Later-page gating = `gateStage` on the pipeline.
- Banned student-visible vocabulary (issue #115): PC, IR, LOAD, STORE, HALT,
  M[xx], 寄存器, 操作码, 指令, 汇编 — no register tables, instruction
  encodings, program editors or step-through debuggers. The
  `FivePartsLabPage.test.tsx` FORBIDDEN regex asserts this on every render.
- Page 1 must keep the「概念演示」disclaimer (not real timing/wiring); page 2
  shares inputs/result with page 1 via the stage-1 draft.

## Persistence / data safety

- Judge pipeline is the shared one: `gateStage` → `insertSubmission` →
  `advanceStage` inside `withTransaction`; drafts via `saveStageDraft` OCC.
- Old `lab_id='cpu'` rows stay in the DB unread — `UNIQUE(user_id, lab_id)`
  keeps them disjoint from five-parts progress; nothing was deleted
  (issue #115 explicitly forbids unreviewed wipes of production student data).
- `/labs/cpu` now falls to the not-found page (asserted in
  `tests/e2e/routes.e2e.ts`) — old URLs must not reopen the old lab.
