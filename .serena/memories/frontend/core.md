# Frontend Core

- `src/app` owns TanStack Router setup, route loaders/errors, and page composition; see `src/app/router.tsx`.
- Each lab is self-contained under `src/features/<lab>/{domain,lesson,ui}`; task-sheet workflows live under `src/features/task-sheets`.
- `src/shared/{auth,api,layout,lab}` holds only cross-feature infrastructure with live consumers. Do not move lesson semantics into shared code.
- `src/shared/rng.ts` owns the seeded PRNG + hashing helpers (`fnv1a`, `seedFor`, `makeRng`, `rngInt`, `rngShuffleIndices`) — feature code must not re-declare them.
- Full-page screens use `AppPageLayout` and `AppTopbar`; use shared page gutters and width tokens. `AppPageLayout` keeps `AppTopbar` outside its viewport-height `.page-layout-content` scroll region. More project-wide guidance: `mem:conventions`.
