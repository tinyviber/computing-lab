# Core

- This is the project entry point, not a source dump. For full component ownership and cross-layer data flow, consult `docs/architecture.md`; `AGENTS.md` defines engineering constraints.
- For route/page composition and shared client infrastructure, read `mem:frontend/core`; for API, persistence, and judging, read `mem:backend/core`. For cross-layer work, use both.
- Read `mem:conventions` when changing shared UI or architecture; `mem:tech_stack` when changing runtime or dependencies.
- Read `mem:suggested_commands` when selecting local commands and `mem:task_completion` when preparing validation or handoff.
- Preserve feature ownership: `src/app` composes routes/pages; lesson semantics stay under `src/features/<lab>`; shared code is infrastructure only.
