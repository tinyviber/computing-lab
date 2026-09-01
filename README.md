# computing-lab

Interactive high-school computing lessons. The learner-facing labs remain a Vite app, and the
repository also includes a small online authoring service for editing lesson source files in a
browser.

## Development

```sh
bun install
bun run dev
```

## Online lesson editor

Open `/editor` through the editor service. It provides a password-protected browser workspace
with a Markdown/code editor on the left and a real Slidev hot-reload preview on the right. Saving
a file writes it directly to `lessons/<lesson>/`, so there is no GitHub/Gitee promotion step in
the editing loop.

For local development, run:

```sh
EDITOR_PASSWORD='choose-a-password' bun run editor:dev
```

Then open <http://localhost:8787/editor>. `editor:dev` starts the React/Vite app, the editor API,
and Slidev preview processes as needed. In a server checkout that already has a built `dist/`,
run `EDITOR_PASSWORD='choose-a-password' bun run editor:start` instead.

`EDITOR_ROOT` can point the service at another checkout, and `EDITOR_PORT` changes the editor
HTTP port. Source files with `.md`, `.vue`, `.css`, `.js`, `.ts`, `.tsx`, `.json`, or `.html`
extensions are editable; image assets are listed as read-only. Set `EDITOR_PASSWORD` in any
non-local deployment—without it, the editor is intentionally open.

For a static subpath deployment, set the Vite base before building:

```sh
VITE_BASE_PATH=/computing-lab/ bun run build
```

Static hosting must serve `dist/index.html` as the history fallback for the configured base
path (`/` or `/computing-lab/`) and every base-prefixed `/labs/...` deep link. Without that
fallback, refreshing a nested route returns a server 404.

## Quality gates

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test:run
bun run test:e2e
bun run build
```

Playwright uses the same base path when `VITE_BASE_PATH` or `BASE_PATH` is set:

```sh
VITE_BASE_PATH=/computing-lab/ bun run build
BASE_PATH=/computing-lab/ bun run test:e2e
```

Routes:

- `/` — lab registry
- `/editor` — password-protected online lesson editor (when `editor:start` or `editor:dev` is running)
- `/labs/image-encoding` — image sampling and color-count analysis
- `/labs/audio-encoding` — waveform sampling
- `/labs/home-network` — gateway configuration

All lesson calculations run in the browser. The image lesson starts with one fixed local kitten sample and supports shareable parameters, for example `/labs/image-encoding?image=photo&sample=25&phase=0.5&bits=2&view=error`; uploaded image pixels stay local and are not written to the URL. Older fixture URLs remain available for compatibility tests and direct links.

For a record of the image sample selection, plain-language copy audit, and classroom UI changes, see [docs/image-encoding-optimization.md](docs/image-encoding-optimization.md).

## Learner-site deployment

The existing `deploy/` runbook describes the static learner site. The online editor is a
separate long-running service: place a reverse proxy in front of its `EDITOR_PORT`, enable
WebSocket upgrades for Slidev HMR, and keep `EDITOR_PASSWORD` set. It writes the configured
`EDITOR_ROOT/lessons` checkout directly and therefore does not use the static promotion loop.

The host-side reconciler, Caddy template, systemd timer, failure invariants,
and Tencent bootstrap/rollback runbook are in [docs/deployment.md](docs/deployment.md).
Run deterministic deployment checks with:

```sh
bun run test:deploy
```
