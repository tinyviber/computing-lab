# Conventions

- Follow `AGENTS.md`; it is the source of truth for ownership, layout, and engineering constraints.
- Keep domain calculations, fixtures, and lesson semantics inside `src/features/<lab>/domain`; lab composition belongs in `ui` and lesson content in `lesson`.
- `src/app` owns routing/page composition. Shared modules contain only infrastructure with live consumers.
- Full-page views use `AppPageLayout` and `AppTopbar`; the topbar supplies the home link except on the home route. Align content to shared page gutters/max-width tokens.
- Keep collection cards consistent across breakpoints; avoid global dark-purple focus outlines.
- Keep teaching formulas and observable state explicit; validate/clamp user-controlled values at domain boundaries.
- Status banners (`.test-error`, `.stage-takeaway`) and stage-rail primitives (`.stage-list`, `.stage-branch*`, `.lab-stage-link.is-optional`) are defined once in `src/design/base.css` or `src/shared/layout/app-layout.css`. Feature CSS must not redefine cross-page component classes.
