# Tech Stack

- Package manager/runtime: Bun 1.2.17 (`.bun-version`, `packageManager`); lockfile is `bun.lock`.
- Frontend: one Vite package, React 19, TypeScript, TanStack Router, Tailwind CSS 4.
- API: Node >=22.13, Hono, single server process under `server/`.
- Tests: Vitest + Testing Library; Playwright for browser E2E.
- Do not introduce workspace packages. Pyodide is synced from the installed dependency into ignored `public/vendor/pyodide/` by postinstall.
