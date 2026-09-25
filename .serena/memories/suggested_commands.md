# Suggested Commands

- Reproducible install: `bun install --frozen-lockfile`; seed local data when needed: `node server/db/seed.ts`.
- Run the API with `node server/index.ts`; run Vite with `bun run dev`.
- Targeted unit feedback: `bun run vitest run <test-file>`; changed-file lint/format: `bun run eslint <path>` and `bun run prettier --check <path>`.
- On the affected development Mac, use `--maxWorkers=1 --minWorkers=1` for Vitest and `--workers=1` for Playwright; prefer `nice -n 10` when supported.
- For browser integration changes, run one relevant Playwright spec after build. Full `bun run test:e2e` is for CI/release or explicit requests.
- Deployment checks are task-specific: `bun run test:deploy` and `bun run test:caddy`.
