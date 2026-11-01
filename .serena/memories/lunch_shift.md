# Lunch-shift Lab (设计餐馆系统 — 4 mainline stages + bonus, 45 分钟)

Layout: `domain/` (contracts, wordTables, priority, scenarios, simulator,
stages, compensate, protocol, runErrors, aiIntake), `lesson/state.ts` (per-stage
drafts + save machinery), `ui/` (panels + `pyodide.worker.ts`/
`pyodideRunner.ts` built on `shared/worker/createWorkerClient` +
`shared/lab/pyodideRuntime`, plus `embed.worker.ts`/`embedRunner.ts` for
the vendored embedding model), `server/judge/lunch-shift/{judge,hiddenSet}.ts`,
`ai/` (dev-only PoC page behind /__dev/labs/lunch-shift-ai).

## Teaching model

- Stages: 1 订单旅程 (guided walkthrough — intro establishes the paid
  「加急」 option customers buy) → 2 修接单 (edit Python word tables —
  字典/列表复习; orders phrase urgency as paid intent: 要加急/付费加快/
  走加急通道, plus the 不用加急 negation) → 3 修排队 (write
  `priority(urgent, wait, cook)` — 函数复习) → 4 智能接单 (AI semantic
  intake: the vendored BGE model proposes tickets for the hidden orders
  in-browser; the student writes `need_confirm(similarity, margin)` — a
  function — to pick which orders the simulated customer restates). The
  explicit narrative: stage 2's hard-coded word tables can't scale to
  real natural-language input — semantic judgment is the modern answer,
  but uncertainty has a price. Paid express is the hook: 加钱走急单 is
  the phrasing no word table lists but the model still catches.
  Stage 5 附加挑战 (compensate) is optional: unlocked by passing stage 3,
  lives as a collapsed "附加挑战（选做）" toggle under stage 3 in the rail,
  autosaves under draft slot 5.
- Server NEVER executes student code — and never runs the model either.
  Browser Pyodide worker turns code into JSON: stage 2 → `IntakeTables`
  (dish/note pairs, calm/rush lists, insertion order matters, ≤20 entries,
  keys 1–10 runes); stage 3 → a 124-cell table of `priority()` over
  urgent×wait(0–30)×cook(1|3); stage 4 → per-order `{id, ticket, confirmed}`
  rows (see 智能接单 below); stage 5 → a 3844-cell table of `compensate()`.
  The server re-validates shapes (checkIntakeTables / checkPriorityTable /
  checkAiResults / checkCompensateTable, Chinese errors) and replays fixed
  parsers in `domain/`. Code snapshots (≤8000 chars) are kept for teacher
  review only.
- Intake parse semantics: first key hit in insertion order wins per table;
  calm words are checked BEFORE rush; 桌号 is a fixed program (N号桌 /
  桌 N / 桌号 N) with no student trap.
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
  price dimension turns "who to refund" into yuan-per-risk-cut: refunds
  212@142 fail spend, refund-all-lost 328@110 fail spend, the near-miss
  (cheap-lost + delivered ot≥6) lands 401@61 — one point over; the
  readable optimum (cheap lost ≤12 + urgent delivered ot≥4) hits
  379@70 exactly. `bestCompensation()` is an exact spend-DP under the
  cap (379@70) shown as the gap target.
- Starter refunds every undelivered order → 356 pts @ 108 元, fails
  spend; the fix path teaches price thresholds + half-price delivered
  refunds (the `price` arg is what makes urgent matter beyond risk).

## Order sets (locked by engine.test.ts)

- ② INTAKE_FIXTURES: default tables miss P03(炒饭), P04(不放香菜),
  P08(别太辣), P09(不用加急→误急), P11(付费加快) = 5/12; each fixable
  by one added word, no deadlock. Default rush list includes 加急 (the
  menu's official option name) so P09 doubles as the negation trap.
- ③ QUEUE_FIXTURES (小票已录对): FIFO 8/12, urgent-first 11/12 (Q07
  starves), both scoring styles (additive urgent+1 / overwrite wait≥T→2)
  give 12/12 for every T in 8..16 — a range, not one magic number.
- ④ hiddenSet.ts FINAL_FIXTURES: same trap classes reworded into
  paid-express phrasing; literal practice words lose F02(别放香菜)/
  F07(少放点辣)/F08(加钱走急单) = 3/12; generic words (放香菜/辣/急单)
  → 24/24. Same arrival shape as ③ so the boost formula stays full
  marks. Test mirrors the fixtures inline.
- RUSH_FIXTURES: optional 20-order 晚高峰 set — stage-3 extra practice
  AND the stage-5 fixed bill source.

## Judging contract

- Stage 2/3/5 malformed submissions → recorded failed submission carrying
  `errors` (retry allowed); stage 4 malformed → `missing-run` 400 BEFORE
  grading (a client-protocol fault, not an attempt). Stage 4 is retryable:
  failed submissions record normally and the student resubmits. Pass needs
  BOTH `AI_PASS_CORRECT` ≥11/12 correct AND `AI_CONFIRM_MIN..AI_CONFIRM_BUDGET`
  =1–4 confirmations (stages.ts) — always-confirm burns the budget,
  never-confirm keeps the AI's one real miss. Score = 小票正确数 +
  记对且准时数 (a wrong ticket earns no delivery point) shown as /24 but
  only informational. Stage 4 summary = ids + correct/confirmed/onTime
  only — no request text. Stage 5 is pass/fail: score 1/1.
- Stage-4 judge mechanics: confirmed orders record the EXPECTED ticket
  (the customer restated — confirmation can't return a wrong ticket, so
  forging `confirmed:true` is worthless) and stall intake one slot via
  `SimConfig.confirmStalls` (held event, ticket lands next pass);
  unconfirmed orders keep the submitted ticket via `SimConfig.tickets`
  (map override; missing key records nothing). Priority carries over from
  stage 3 through the same sim.
- Any code edit immediately nulls the derived tables/priority/results in
  the draft — submit stays disabled until a fresh run; newest local
  preview is shown ahead of the last recorded grade.
- trainingOrderFor always returns a normal order (the companion is the
  fixed urgent one) — the step-2 copy assumes exactly one urgent order.
- Draft shapes: IntakeDraft{code,tables}, QueueDraft{code,priority},
  AiDraft{confirmCode,results,queueCode,priority} — stage 4 seeds its
  queue artefact from draft 3 in `draftOf`; CompensateDraft{code,compensate}.
  `runSummaries` extras keyed intake/queue/final/compensate; `aiOrders`
  extras = `FINAL_PUBLIC_ORDERS` (id+request only) and ships ONLY once
  stage 4 is unlocked — the wording is needed for embedding but expected
  tickets/arrival/cook shape never leave hiddenSet.ts.
- DB migration v12 resets lunch-shift (renumbered stages); v13 drops only
  stage-5 submissions/drafts (rescore) plus the removed rush artefacts;
  v14 drops stage-5 again for the price-argument rescore.

## 智能接单 (stage 4) — browser-local embedding intake

- `domain/aiIntake.ts` holds the pure extraction logic shared by the PoC
  page and AiIntakePanel: `splitClauses` (CJK punctuation), `predictField`
  (per-candidate best clause×prototype cosine → {value, similarity,
  margin, prototype, clause, scores}), literal-first `predictTicket`
  (桌号 via `readTable` regex + full dish-name substring → certain
  literal fields that don't drag confidence; note/urgent via clause-level
  embedding), `checkAiResults`/`sanitizeAiResults`/`AiResultRow` for the
  submission boundary, and the clarify round-trip (`clarifiedText`/
  `parseClarified` — the simulated customer's fixed-format restatement).
  Order-level similarity/margin = worst field's (what need_confirm sees).
- The hybrid clause-level design is what makes it work: whole-sentence
  embeddings scored only 6/12 (note/urgent signal drowned by dish+table);
  scoring each clause against its own prototypes gives 12/12 on the
  practice set and 11/12 direct on the hidden set (F11 「不要催」→少辣 is
  the designed miss — low margin, caught by confirmation). Negation
  needs explicit calm prototypes (不急着/不用加急/平常速度); the urgent
  prototypes also carry the paid-express family (我需要加急/付费加快/
  加钱走急单 all resolve correctly).
- Measured calibration (hidden set, WebGPU q8): the weakest order
  margins sit at F11 0.057 / F01 0.064 / F10 0.097 / F06 0.099 while
  confident orders run 0.11–0.33. NEED_CONFIRM_STARTER uses sim<0.85 OR
  margin<0.10 → 5 confirmations → over the 4-budget on purpose, so the
  shipped default cannot pass untouched; tightening to sim<0.75 alone
  (2 confirms, catches F11) or margin<0.10 alone (4) both pass.
- `ui/embed.worker.ts` + `embedRunner.ts`: transformers.js
  `pipeline("feature-extraction", "Xenova/bge-small-zh-v1.5")`, q8,
  WebGPU→WASM fallback, CLS pooling + L2 normalize. Fully self-hosted:
  model + ORT wasm vendored to `public/vendor/` by `bun run sync:embed`
  (gitignored like pyodide). `env.allowRemoteModels` OFF;
  `env.localModelPath` = vendor/models/, `wasmPaths` → vendored
  `ort-wasm-simd-threaded.asyncify.*`.
- Pitfall: onnxruntime-web 1.31 splits factories — `jsep.mjs` lacks
  `webgpuInit`; `asyncify.mjs` (the name transformers.js itself fetches)
  has it and serves wasm+webgpu alike. Vendor asyncify, never jsep.
- Pyodide worker has a `confirm` kind: `need_confirm(similarity, margin)`
  evaluated once per [sim, margin] pair in a single run → boolean list.
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
- rush() was removed from stage 4 (it had no real cost; review verdict):
  no rush table, no boost events, RUSH_* names now mean 晚高峰 only.
