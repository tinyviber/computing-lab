# Lunch-shift Lab (设计餐馆系统 — 4 mainline stages + bonus, 45 分钟)

Layout: `domain/` (contracts, priority, scenarios, simulator, stages,
compensate, protocol, runErrors, aiIntake), `lesson/state.ts` (per-stage
drafts + save machinery), `ui/` (panels + `pyodide.worker.ts`/
`pyodideRunner.ts` built on `shared/worker/createWorkerClient` +
`shared/lab/pyodideRuntime`, plus `embed.worker.ts`/`embedRunner.ts` for
the vendored embedding model), `server/judge/lunch-shift/{judge,hiddenSet}.ts`,
`ai/` (dev-only PoC page behind /__dev/labs/lunch-shift-ai).

## Teaching model

- Stages: 1 订单旅程 (guided walkthrough — intro establishes the paid
  「加急」 option customers buy) → 2 智能接单 (AI semantic intake on the
  12 practice orders: the vendored BGE model proposes tickets in-browser;
  the student writes `need_confirm(similarity, margin)` to pick which
  orders the simulated customer restates — expected tickets are public
  here so tuning is debuggable) → 3 修排队 (write
  `priority(urgent, wait, cook)` — 函数复习) → 4 晚餐高峰 (the combined
  challenge: same need_confirm against hidden orders + the stage-3
  priority, judged on accuracy AND confirmation budget AND on-time
  service). Paid express is the hook: 加钱走急单 is the phrasing no
  literal rule lists but the model still catches.
  Stage 5 附加挑战 (compensate) is optional: unlocked by passing stage 3,
  lives as a collapsed "附加挑战（选做）" toggle under stage 3 in the rail,
  autosaves under draft slot 5.
- Server NEVER executes student code — and never runs the model either.
  Browser Pyodide worker turns code into JSON: stage 2 → per-order
  `{id, ticket, confirmed}` rows on the practice set; stage 3 → a
  124-cell table of `priority()` over urgent×wait(0–30)×cook(1|3);
  stage 4 → the same result rows on hidden orders plus the priority
  table; stage 5 → a 3844-cell table of `compensate()`. The server
  re-validates shapes (checkAiResults / checkPriorityTable /
  checkCompensateTable, Chinese errors) and replays fixed parsers in
  `domain/`. Code snapshots (≤8000 chars) are kept for teacher review
  only.
- Queue pick = max table value, ties → FIFO (fifoQueue: arrivalTick then
  id). onTime uses EXPECTED urgency for the deadline (urgent <9, normal
  <18 of 30 ticks) while the priority input uses the PARSED flag.

## Stage 5 scoring (domain/compensate.ts)

- The bill is ONE fixed run everyone pays: the RUSH set replayed
  first-come-first-served (`compensateLateOrders()`), leaving 11 problem
  orders — 5 delivered-late (all urgent, overtime 1–9) + 6 undelivered
  (3 urgent / 3 normal), priced by `MENU_PRICES` (12/16/22 元).
- Grounded model: `REVIEW_RISK` = bad-review percent per (4 tiers:
  mild 1–3 拍 / bad 4–8 / worst 9+ / lost) × (普通/加急) × (0/1/2),
  shown verbatim on the panel as the restaurant's historical data.
  Refund cost is the order's OWN price via `compensateCost` — half for
  delivered (ceil/2), full for undelivered; snacks are 2 元. Expected
  bad reviews = plain sum (badReviewPoints = percent-sum; no RNG).
- Pass = BOTH badReviewPoints ≤ 400 (4.0 单) AND spend ≤ 70 元. The
  readable optimum (cheap lost ≤12 + urgent delivered ot≥4) hits
  379@70 exactly. `bestCompensation()` is an exact spend-DP under the
  cap (379@70) shown as the gap target.

## Order sets (locked by engine.test.ts / judge.test.ts)

- ② INTAKE_FIXTURES: 12 practice orders with paid-intent urgency
  phrasing (要加急/付费加急/加钱加急/走加急通道/付费加快/不用加急) and
  two designed AI traps: P06 「想快一点但不想加钱」→ misjudged 加急
  (margin ~0.001–0.014, true 普通 — the margin signal catches it) and
  P10 「辣子照旧」→ misjudged 少辣 (similarity ~0.57, true 无备注 —
  「照旧」makes 无备注 unambiguous, only the similarity signal flags
  it). Direct AI correctness is 10/12 — catching both needs both
  signals.
- ③ Grade = QUEUE_PROBES (domain/queueProbes.ts): 12 crafted queue
  snapshots asking "who first" — 3 urgent-jump probes + 9 min-slack
  probes (slack = 9−wait urgent / 18−wait normal; ties FIFO). The min-
  slack rule is stated verbatim in the task (restaurant's own 排单规定,
  not a hidden judge) and every expected winner is still savable
  (slack > cook + delivery 2), with min-slack and min(slack−cook) rules
  agreeing on all answers. Calibration: urgent-first 3, FIFO/wait-only
  9, boost/overwrite 12 for T 8..12 (T=13 → 9, T≥15 → 3), pass = 11.
  QUEUE_FIXTURES' 12-order round is the panel's preview only (FIFO
  8/12, urgent-first 11/12 starving Q07).
- ④ hiddenSet.ts FINAL_FIXTURES: same trap classes reworded into
  paid-express phrasing; F11 「平常速度，不要催」→少辣 is the designed
  miss (lowest margin ~0.057). Same arrival shape as ③ so the boost
  formula stays full marks. Test mirrors the fixtures inline.
- RUSH_FIXTURES: optional 20-order 晚高峰 set — stage-3 extra practice
  AND the stage-5 fixed bill source.

## Judging contract

- Stage 2/3/5 malformed submissions → recorded failed submission carrying
  `errors` (retry allowed); stage 2/4 missing results → `missing-run`
  400 BEFORE grading (a client-protocol fault, not an attempt).
- Stage 2 pass: `correct == 12` AND `confirmed <= AI_CONFIRM_BUDGET(4)`
  on the practice set — confirming a right order can't fix a miss, so a
  pass must find the orders the model actually got wrong.
- Stage 3 pass: `passedProbes >= QUEUE_PASS(11)` of 12 — the summary's
  `onTime` field carries the probe count for compat; the per-probe rows
  ride in `probes` (picked + answer indices, no slack math leaked).
- Stage 4 pass: `correct == 12` AND `confirmed <= 4` AND `served >=
AI_SERVED_MIN(11)` (记对且准时) — accuracy, confirmation cost and
  delivery speed gate together. With BOOST10 priority: {F10,F11}
  confirms → served 12; a careless 4-confirm pick can sink to 9–10;
  a FIFO queue fails served even with perfect tickets (8/12) — the
  stage demands a near-full-marks stage-3 function.
- Stage-4 judge mechanics: confirmed orders record the EXPECTED ticket
  (the customer restated — confirmation can't return a wrong ticket, so
  forging `confirmed:true` is worthless) and stall intake one slot via
  `SimConfig.confirmStalls` (held event, ticket lands next pass);
  unconfirmed orders keep the submitted ticket via `SimConfig.tickets`
  (map override; missing key records nothing). Stage 4 summary = ids +
  correct/confirmed/onTime only — no request text. Stage 5 is pass/fail.
- Any code edit immediately nulls the derived results/priority in the
  draft — submit stays disabled until a fresh run.
- Draft shapes: AiIntakeDraft{confirmCode,results} (stage 2),
  QueueDraft{code,priority}, AiDraft = AiIntakeDraft & {queueCode,
  priority} (stage 4 seeds confirmCode from draft 2 and queue artefact
  from draft 3 in `draftOf`); CompensateDraft{code,compensate}.
  `runSummaries` extras keyed intake/queue/final/compensate; `aiOrders`
  extras = `FINAL_PUBLIC_ORDERS` (id+request only) and ships ONLY once
  stage 4 is unlocked.
- DB migration v15 drops lunch-shift stage-2 and stage-4 submissions/
  drafts/passed flags (both redesigned) while keeping 1/3/5; v16 drops
  stage-3 leftovers for the probe-battery rescoring.

## AI intake — browser-local embedding (stages 2+4 share it)

- `domain/aiIntake.ts` holds the pure extraction logic: `splitClauses`
  (CJK punctuation), `predictField` (per-candidate best clause×prototype
  cosine → {value, similarity, margin, prototype, clause, scores}),
  literal-first `predictTicket` (桌号 via local `readTable` regex + full
  dish-name substring → certain literal fields that don't drag
  confidence; note/urgent via clause-level embedding),
  `checkAiResults`/`sanitizeAiResults`/`AiResultRow` for the submission
  boundary, and `clarifiedText`/`parseClarified` for the restatement
  round-trip. Order-level similarity/margin = worst field's.
- The hybrid clause-level design is what makes it work: whole-sentence
  embeddings scored only 6/12; clause-level gives 12/12 practice and
  11/12 direct on the hidden set. Negation needs explicit calm
  prototypes (不急着/不用加急/平常速度); urgent prototypes carry the
  paid-express family (我需要加急/付费加快/加钱走急单).
- Measured calibration (practice set): weakest orders P06 0.720/0.001,
  P10 0.573/0.156, P03 0.670/0.116 — NEED_CONFIRM_STARTER sim<0.85 OR
  margin<0.10 → 5 confirmations → over budget on purpose; sim<0.75
  (3 confirms incl. both traps) passes; margin<0.06 catches only P06 →
  fails at 11/12 (the P10 trap needs the similarity signal).
- WASM↔WebGPU consistency measured: identical predictions and sims on
  the practice set; only a 0.005 margin wobble on a literal-resolved
  order (P09 0.123→0.118) — nothing near a decision boundary moves.
- `ui/embed.worker.ts` + `embedRunner.ts`: transformers.js
  `pipeline("feature-extraction", "Xenova/bge-small-zh-v1.5")`, q8,
  WebGPU→WASM fallback, CLS pooling + L2 normalize. Fully self-hosted:
  model files committed under `public/vendor/models/` and verified by
  `scripts/embed-manifest.mjs` (pinned revision + sha256,
  `bun run sync:embed` = verify-only by default, `--force` redownloads);
  ORT wasm/mjs imported via Vite `?url` → hashed build assets, so a
  clean `git archive` deploy ships everything (`deploy/smoke.mjs`
  asserts the dist copies). `env.allowRemoteModels` OFF.
- AiIntakePanel caches predictions per order-set key — editing
  need_confirm/priority re-runs only Pyodide, not the model.
- `need_confirm` verdicts are STRICT booleans in pyodide.worker —
  non-True/False raises with the exact (sim, margin) case.
- The dev PoC (`ai/AiIntakePocPage.tsx`, route /__dev/labs/lunch-shift-ai)
  stays for model calibration — it prints per-field scores and exports
  vectors via `window.__aiEmbed`; `scripts/embed-experiment.mjs` replays
  exported vectors for offline scoring experiments.

## Pitfalls

- `findFullWidthPunctuation` skips strings AND comments — starter comments
  legitimately contain Chinese punctuation.
- `StageRailItem.englishTitle` is now optional; lunch stages dropped it
  (dashboard falls back to `stage.title`).
- Full-width punctuation check + `friendlyRunError` live in
  `domain/runErrors.ts`; worker timeout covers infinite loops.
- Student-facing copy avoids —— (em dash): use commas/periods instead.
- onnxruntime-web 1.31 splits factories — `jsep.mjs` lacks `webgpuInit`;
  `asyncify.mjs` has it and serves wasm+webgpu alike. The runtime pair
  is imported from node_modules via `?url` (no vendored copy), which
  also prevents version drift.
