# Task Completion

- During implementation, use the narrowest relevant tests and changed-file lint/format checks; typecheck when types/contracts change or at feature completion. Keep full-suite tests, build, and Playwright out of the edit/repair loop.
- After focused checks pass, before handoff run the repository-required `bun run format:check`, `bun run lint`, `bun run typecheck`, `bun run test:run`, and `bun run build`. Run heavy commands serially; do not repeat a passing expensive check unless relevant code changed.
- For browser routes, authentication, API/persistence boundaries, or complete user flows, run one relevant Playwright spec after build. Reserve full `bun run test:e2e` for CI, release validation, or explicit requests.
- On the affected development Mac, follow `.codex/AGENTS.md` for single-worker and resource-safety rules.
