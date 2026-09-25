# Conventions

- Follow `AGENTS.md`; it is the source of truth for ownership, layout, and engineering constraints.
- Keep domain calculations, fixtures, and lesson semantics inside `src/features/<lab>/domain`; lab composition belongs in `ui` and lesson content in `lesson`.
- `src/app` owns routing/page composition. Shared modules contain only infrastructure with live consumers.
- Full-page views use `AppPageLayout` and `AppTopbar`; the topbar supplies the home link except on the home route. Align content to shared page gutters/max-width tokens.
- Keep collection cards consistent across breakpoints; avoid global dark-purple focus outlines.
- Keep teaching formulas and observable state explicit; validate/clamp user-controlled values at domain boundaries.
