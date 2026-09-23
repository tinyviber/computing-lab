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

- `src/app` owns routing and page composition.
- `src/features/<lab>/domain` owns lesson calculations and fixtures.
- `src/features/<lab>/ui` owns lab-specific composition.
- `src/shared/{auth,api,layout,lab}` owns only infrastructure with a live consumer; lesson
  semantics do not belong in shared code.
- Do not import from `talk-polish-ai`; this repository stays independently deployable.

## Frontend layout and visual consistency

- Use `AppPageLayout` and `AppTopbar` from `src/shared/layout` for full-page screens, including access-denied and error states. Keep shared navigation and account behavior in this layout instead of recreating it in page components.
- `AppTopbar` provides “返回首页” by default. Hide it only on the home route with `showHomeLink: false`; do not add duplicate home links in individual page topbars or content actions.
- Keep page gutters and alignment based on shared `.page-content` and `--page-gutter` / `--page-max` tokens. Avoid outer page padding or margins that offset one page from the shared header and other pages. Page-specific content widths are fine when intentional.
- Keep cards in the same collection visually consistent in width and height across breakpoints. Use the grid for equal tracks; avoid one-off spans unless hierarchy explicitly requires them.
- Do not add thick, dark-purple focus outlines globally. Text inputs and textareas may use the existing thin, light-purple focus border.

## Teaching model

Prefer explicit formulas and observable state. A scenario may be encoded in the URL so a teacher can share a reproducible experiment. Validate and clamp user-controlled values at the domain boundary.
