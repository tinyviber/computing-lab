# Frontend Core

- `src/app` owns TanStack Router setup, route loaders/errors, and page composition; see `src/app/router.tsx`.
- The audio-encoding demo has no API route to enforce access: its home card and direct page route both require an open `GET /api/labs` catalog entry.
- Each lab is self-contained under `src/features/<lab>/{domain,lesson,ui}`; task-sheet workflows live under `src/features/task-sheets`.
- `src/shared/{auth,api,layout,lab}` holds only cross-feature infrastructure with live consumers. Do not move lesson semantics into shared code.
- Full-page screens use `AppPageLayout` and `AppTopbar`; use shared page gutters and width tokens. `AppPageLayout` keeps `AppTopbar` outside its viewport-height `.page-layout-content` scroll region. More project-wide guidance: `mem:conventions`.
