# computing-lab

Interactive high-school computing lessons. Local-first, static Vite app, no account or backend.

## Development

```sh
bun install
bun run dev
```

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
- `/labs/image-encoding` — image sampling and color-count analysis
- `/labs/audio-encoding` — waveform sampling
- `/labs/home-network` — gateway configuration

All lesson calculations run in the browser. The image lesson starts with one fixed local kitten sample and supports shareable parameters, for example `/labs/image-encoding?image=photo&sample=25&phase=0.5&bits=2&view=error`; uploaded image pixels stay local and are not written to the URL. Older fixture URLs remain available for compatibility tests and direct links.

For a record of the image sample selection, plain-language copy audit, and classroom UI changes, see [docs/image-encoding-optimization.md](docs/image-encoding-optimization.md).

## Static host deployment

Computing Lab deploys as static files only. GitHub `main` is canonical, CI
promotes its exact verified SHA to Gitee `main`, and a Tencent host pulls and
reconciles that qualified SHA into an atomic `current` release for Caddy.

The host-side reconciler, Caddy template, systemd timer, failure invariants,
and Tencent bootstrap/rollback runbook are in [docs/deployment.md](docs/deployment.md).
Run deterministic deployment checks with:

```sh
bun run test:deploy
```
