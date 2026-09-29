# Decoding Lab (解码侦探, issue #81)

## Teaching model

- Claim: 数据 + 解码约定 = 信息. Every stage ends with a visible decoded
  artifact; the artifact IS the submission (students never submit code to be
  run — server never executes student code; Python runs browser-only in the
  Pyodide worker, code snapshot is saved for teacher review).
- Stages in `domain/stages.ts` (`DECODING_STAGES`, indices 1–6). Core 1–4:
  codes (字码→词), bits (8 位→句), bmp (先读 'BM' 签名再写解码器),
  files (三份文件按 meta 选解码器). Challenges 5 (bmp-script, R 通道隐写)
  and 6 (bmp, 修坏解码器) sit on `track:"challenge"` rails anchored by
  `railAfter`; `unlockAfter` lists prerequisites.
- `kind` describes stage rules; `payload.kind` describes data ("bmp-script"
  stage carries a "bmp" payload). `requiresSignature: true` means the
  submission must include the discovered 'BM' signature.

## Judging

- Per-user payload: `generatePayload(stage, seedFor(userId,"decoding",idx))`
  is deterministic — `GET /project` ships it via `projectExtras.payloads`
  and the judge regenerates the identical one, then `verifyArtifact`
  compares artifact vs reference decode. Failure detail reports only the
  first mismatch position; never name the right answer (stage 4 wrong
  decoder says "与 meta 不符", not which decoder).
- Stage prompts are concept checks: `promptsComplete` server-side re-checks
  every picked option is `correct` → else 400 `guided-incomplete`. UI only
  records correct picks (`answer-prompt` ignores wrong ones and flags
  `wrongPick`).
- Files-stage can't be passed by decoder choice alone — the artifact must
  match the reference decode; `SlidingWindowLimiter` (12/10min/stage)
  guards guessing.

## Pyodide contract

- `pyodide.worker.ts` posts `{phase:"executing"}` ONLY after
  `await getPyodide()` resolves — ack before load finishes makes the main
  thread switch the 90s load budget to the 15s exec budget mid-download
  and killWorker wipes the cold start (the #79 regression).
- `runDecode(code, data, {preamble, call})`; preamble hooks: `BMP_HELPER`
  (decode_bmp) for stage 5, `FILE_HELPERS` (decode_as_text/image) for
  stage 4.

## Constraints worth knowing

- BMP profile is deliberately constrained: 54-byte header, 24bpp, BGR,
  bottom-up rows, `width*3%4==0` (encoder throws otherwise) — the X2 buggy
  decoder's three bugs live exactly in offset/通道序/行序.
- Stage-4 ambiguity file: asciiSafe palette keeps image bytes printable so
  a text decode also "runs" — meta decides (the lesson, not a bug).
- `?stage=N` deep link applied once after project load (`stageLinkApplied`);
  refresh restores `currentStage` via load-project preferring
  `action.currentStage` over `state.stageIndex`.
