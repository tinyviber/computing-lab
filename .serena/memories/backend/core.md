# Backend Core

- `server/` is the Node API for authentication, drafts, judging, class dashboards, and administration; entrypoint is `server/index.ts`.
- Lab project/draft/judge routes use the shared thin pipeline in `server/routes/labRoutes.ts`; route-specific setup stays in `server/routes/`.
- Hidden judging cases and fixtures stay under `server/judge/`; never expose them to browser code.
- Protocol types are shared from each lab's `src/features/<lab>/domain`; keep route orchestration and authoritative judging on the server.
- `server/labs.ts` is also the visibility registry. Browser-only labs without API routes still need a registry entry and a guarded page route; use `defaultHidden` when they must remain closed until an admin reviews them.
