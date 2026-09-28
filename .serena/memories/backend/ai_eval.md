# ai-eval lab

- Evidence-authenticity judging: draws are server-dispatched (`POST /draws`), the transcript records `{probe, drawId}` only (never answer text), and the judge replays every row under `seed = fnv1a(userId‖"ai-eval"‖stageIndex‖case)`; mismatch → `transcript-mismatch`.
- `server/judge/ai-eval/hiddenBank.ts`: `c1Plan`/`c2Question`/`c3Plan` pick per-user questions; `resolveProbe` enforces per-stage probe legality (C2 temp-0 single-dim, C3 sequential cursor `k===issued.length`); `issueDraws`/`verifySlot` are the action handlers; `stampPredictionChange` writes `predictedAt` on draft save so C2 can assert `predictedAt < firstDrawSeq` from the STORED draft.
- Draft `_srv` field is server-managed: sanitize carries it only from `prior`, never client input; `verifyLog` lives there and gates C3 `doubt+fieldId` cites.
- C3 `doubt` without `fieldId` = soft miss (recall/false-flag sink), not an error.
- Corpus invariant: every template of an entry interpolates the SAME slot set, so `answerKeyOf` stays stable on wording alone.
