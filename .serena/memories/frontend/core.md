# Frontend Core

- `src/app` owns TanStack Router setup, route loaders/errors, and page composition; see `src/app/router.tsx`.
- The audio-encoding demo has no API route to enforce access: its home card and direct page route both require an open `GET /api/labs` catalog entry.
- Labs own `domain/lesson/ui`; complex labs may add `controller/preview` (CPU pilot). Visual tasks consume ViewModel/actions and DEV-only fixtures; see `mem:cpu_lab` for its runtime boundary. Task sheets live under `src/features/task-sheets`.
- `src/shared/{auth,api,layout,lab}` holds only cross-feature infrastructure with live consumers. Do not move lesson semantics into shared code.
- Full-page screens use `AppPageLayout` and `AppTopbar`; use shared page gutters and width tokens. `AppPageLayout` keeps `AppTopbar` outside its viewport-height `.page-layout-content` scroll region. More project-wide guidance: `mem:conventions`.
