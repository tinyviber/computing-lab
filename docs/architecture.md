# Architecture decision record

## Current repository shape

Product-owned routing and catalog live under `src/app`. Feature pages are exposed through
`src/features/<lab>/index.ts`; app code does not reach into feature internals. Each feature has
three layers:

```text
ui → lesson → domain
```

`domain` contains pure facts and calculations. `lesson` contains URL scenario parsing, presets,
workflow state, and validation transitions. `ui` contains React composition and user events.

`src/shared/lab` contains only cross-feature UI primitives. It receives catalog-shaped navigation
items through `LabNavigationProvider`; it does not import `src/app` or any feature.

Global CSS is split by ownership: `src/design` owns tokens and base rules, `shared/lab/lab.css`
owns shell/primitives, each feature owns its UI stylesheet, and `app/pages/home.css` owns catalog
and error pages.

## PR8 evaluation

Three lessons now consume the same structural needs:

| Consumer       | Actual shared consumers                                                                  | Lesson-owned pieces                            |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Image Encoding | `LabShell`, `ParameterControl`, `ExperimentStatus`, `VisualizationPanel`, `FormulaPanel` | pixel grid, sampling formula, workflow steps   |
| Audio Encoding | `LabShell`, `ParameterControl`, `ExperimentStatus`, `VisualizationPanel`, `FormulaPanel` | waveform, sample-rate formula, amplitude model |
| Home Network   | `LabShell`, `ExperimentStatus`, `VisualizationPanel`, `FormulaPanel`                     | device palette, topology, gateway validation   |

## Decision

Keep `src/shared/lab` as an internal UI layer. It owns slots, layout, controls, status, and accessibility behavior. It does not own lesson state, formulas, scenario schemas, renderers, or action interpreters.

Image palettes are derived from the unique 8×8 source colors, sorted deterministically,
and quantized by nearest RGB squared distance. The index width remains `2..8` bits per
pixel; the source-derived palette is not a fixed RGB-space quantizer.

The image lesson exposes a theoretical pixel-payload comparison based only on
`8×8×24` source bits versus `sampledPixels×bits`. It excludes palette, file header, metadata,
container/codec overhead, and actual file size/compression; it does not represent a file-size or
compression result.

Do not create a framework package yet. All three consumers are inside one product and still have different teaching semantics. A package becomes justified only after an external consumer needs the same contract. `programming-viz` is intentionally outside this change.

## Boundary checks

- `src/app` imports feature pages through public entrypoints, never feature internals.
- Feature domains do not import React, router, lesson, UI, app, or other features.
- Feature lessons do not import React, router, app, UI, or other features.
- Feature UI imports only its own feature layers and shared UI.
- Shared components do not import feature or app modules.
- `src/app/architecture-boundaries.test.ts` scans the production import graph in CI.
- No backend, auth, database, PWA, or cross-repository dependency is required.

## Runtime resilience

- Every lab route has a local `LabErrorPage`, so one render failure stays inside that route.
- Scenario parsers use defaults, first-value semantics, and clamping for malformed URL input.
- Domain and lesson tests cover deterministic calculations, invariants, scenario parsing, and state
  transitions. Router integration and Playwright cover direct links, search hydration, base paths,
  navigation, and browser history.
