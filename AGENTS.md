# Computing Lab Engineering Guide

## Runtime

- Use Bun `1.2.17` and `bun install --frozen-lockfile`.
- Keep repository as one Vite package. Do not add workspace packages.
- Run `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test:run`, and `bun run build` before handoff.
- Avoid spawning too many Node processes in parallel on this machine: test runners are capped at 2 workers (`maxWorkers: 2` in `vitest.config.ts`, `workers: 2` in `playwright.config.ts`); keep it that way and do not run several heavy scripts at once.
- `local/` holds gitignored local-only material that is never committed. Check
  `local/deploy/` for the production deployment scripts (`api-deploy.sh`, the
  systemd unit) before any deploy work; see `docs/deployment.md` and
  `local/README.md`.

## Boundaries

- `src/app` owns routing and registry only.
- `src/features/<lab>/domain` owns lesson calculations and fixtures.
- `src/features/<lab>/ui` owns lab-specific composition.
- `src/shared/lab` owns layout and interaction primitives, not lesson semantics.
- Do not import from `talk-polish-ai`; this repository stays independently deployable.

## Teaching model

Prefer explicit formulas and observable state. A scenario may be encoded in the URL so a teacher can share a reproducible experiment. Validate and clamp user-controlled values at the domain boundary.
