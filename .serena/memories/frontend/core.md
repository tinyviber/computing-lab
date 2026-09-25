# Frontend Core

- `src/app` owns TanStack Router setup, route loaders/errors, and page composition; see `src/app/router.tsx`.
- Each lab is self-contained under `src/features/<lab>/{domain,lesson,ui}`; task-sheet workflows live under `src/features/task-sheets`.
- `src/shared/{auth,api,layout,lab}` holds only cross-feature infrastructure with live consumers. Do not move lesson semantics into shared code.
- Full-page screens use `AppPageLayout` and `AppTopbar`; use shared page gutters and width tokens. More project-wide guidance: `mem:conventions`.
