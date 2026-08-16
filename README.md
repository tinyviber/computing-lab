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
- `/labs/image-encoding` — sampling and quantization
- `/labs/audio-encoding` — waveform sampling
- `/labs/home-network` — gateway configuration

All lesson calculations run in the browser. Query scenarios are shareable, for example `/labs/image-encoding?scenario=low-sampling`.
