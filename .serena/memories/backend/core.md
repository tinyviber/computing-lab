# Backend Core

- `server/` is the Node API for authentication, drafts, judging, class dashboards, and administration; entrypoint is `server/index.ts`.
- Lab project/draft/judge routes use the shared thin pipeline in `server/routes/labRoutes.ts`; route-specific setup stays in `server/routes/`.
- `labRoutes` `LabSpec.actions` mounts extra `POST /<name>` endpoints (e.g. ai-eval `/draws`, `/verify`) between `/draft` and `/judge`, inheriting `requireAccess` + stageIndex validation; give each its own rate limiter.
- For ai-eval's evidence-replay judging (server-dispatched draws, per-user seeded hidden bank, transcript replay), read `mem:backend/ai_eval`.
- Hidden judging cases and fixtures stay under `server/judge/`; never expose them to browser code. ai-eval's `hiddenBank.ts` also holds the planted-defect metadata — wire payloads strip `flags`/`entryId` in `toDrawPayload`.
- Protocol types are shared from each lab's `src/features/<lab>/domain`; keep route orchestration and authoritative judging on the server.
