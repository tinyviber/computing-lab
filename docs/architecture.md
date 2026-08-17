# Architecture decision record

## Current repository shape

Product-owned routing and catalog live under `src/app`. Feature pages are exposed through
`src/features/<lab>/index.ts`; app code does not reach into feature internals. Each feature has
three layers:

```text
ui → lesson → domain
```

`domain` contains pure facts and calculations. `lesson` contains URL scenario parsing, presets,
feature-owned state, and feature transitions. `ui` contains React composition and user events.

`src/shared/lab` contains only cross-feature app-chrome/UI code. It receives catalog-shaped navigation
items through `LabNavigationProvider`; it does not import `src/app` or any feature.

`LabShell` owns app chrome only: the catalog rail, mobile menu/scrim, focus return, inert state,
and the landmark `<main>`. Its public boundary is `eyebrow`, `title`, `subtitle`, and `children`.
Each feature owns the layout inside that main landmark. Image owns its source/reconstruction,
controls, views, payload evidence, and pixel inspector; Network owns its configuration inspector
and causal probe trace; Sound owns its configuration, source, transport, audition, analysis mode,
view, cursor, and loop state.

Global CSS is split by ownership: `src/design` owns tokens and base rules, `shared/lab/lab.css`
owns shell/primitives, each feature owns its UI stylesheet, and `app/pages/home.css` owns catalog
and error pages.

## Historical PR8 snapshot

The PR8 review captured the shared surface at that point in the refactor. It is a historical
snapshot, not the current ownership model:

| Consumer       | Actual shared consumers                                                                  | Lesson-owned pieces                            |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Image Encoding | `LabShell`, `ParameterControl`, `ExperimentStatus`, `VisualizationPanel`, `FormulaPanel` | pixel grid, sampling formula, workflow steps   |
| Audio Encoding | `LabShell`, `ParameterControl`, `ExperimentStatus`, `VisualizationPanel`, `FormulaPanel` | waveform, sample-rate formula, amplitude model |
| Home Network   | `LabShell`, `ExperimentStatus`, `VisualizationPanel`, `FormulaPanel`                     | device palette, topology, gateway validation   |

## Current decision

`LabShell` is a children-only app-chrome component. It owns the catalog rail, mobile menu and
scrim, focus return, inert state, and the landmark `<main>`. Each feature owns the layout inside
that landmark and all lesson semantics. Sound, Network, and the rebuilt Image feature do not use
legacy shared lesson primitives; those files remain untouched as historical/internal code until
the dedicated Primitive Extraction Review.

Keep `src/shared/lab` as an internal UI layer. It does not own lesson state, formulas, scenario
schemas, renderers, or action interpreters.

Image uses a source-sized raster model. Spatial sampling derives a smaller sampled representation
and coordinate mapping (with per-axis phase and periodic edge wrapping). The derived per-axis geometry also drives Image's phase control and URL canonicalization, rather than inferring identity from the percentage alone. Indexed quantization exposes a deterministic nested RGB codebook whose first
`2^bitDepth` entries are available to sampled values; reconstruction expands those quantized sample
cells back to source dimensions. `bitDepth` is the index width and adding a bit cannot increase
nearest-color error for the same sampled representation. The feature exposes source, sampled,
quantized, reconstructed, error-map, pixel-inspection, and representation evidence.

The image lesson exposes a theoretical raw pixel payload:
`sampledWidth × sampledHeight × bitDepth` bits and `ceil(bits / 8)` bytes. It excludes palette,
file header, metadata, container/codec overhead, and actual browser file size/compression; it does
not represent a file-size or compression result.

Do not create a framework package yet. All three consumers are inside one product and still have different teaching semantics. A package becomes justified only after an external consumer needs the same contract. `programming-viz` is intentionally outside this change.

## Boundary checks

- `src/app` imports feature pages through public entrypoints, never feature internals.
- Feature domains do not import React, router, lesson, UI, app, or other features.
- Feature lessons do not import React, router, app, UI, or other features.
- Feature UI imports only its own feature layers and app shell.
- Shared components do not import feature or app modules.
- `src/app/architecture-boundaries.test.ts` scans the production import graph in CI.
- No backend, auth, database, PWA, or cross-repository dependency is required.

## Runtime resilience

- Every lab route has a local `LabErrorPage`, so one render failure stays inside that route.
- Scenario parsers use defaults, first-value semantics, and clamping for malformed URL input.
- Domain and lesson tests cover deterministic calculations, invariants, scenario parsing, and state
  transitions. Router integration and Playwright cover direct links, search hydration, base paths,
  navigation, and browser history.
