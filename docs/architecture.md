# Architecture decision record

## PR8 evaluation

Three lessons now consume the same structural needs:

| Consumer       | Actual shared consumers                                                           | Lesson-owned pieces                            |
| -------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| Image Encoding | `LabShell`, `RangeControl`, `StatusMessage`, `VisualizationPanel`, `FormulaPanel` | pixel grid, sampling formula, workflow steps   |
| Audio Encoding | `LabShell`, `RangeControl`, `StatusMessage`, `VisualizationPanel`, `FormulaPanel` | waveform, sample-rate formula, amplitude model |
| Home Network   | `LabShell`, `StatusMessage`, `VisualizationPanel`, `FormulaPanel`                 | device palette, topology, gateway validation   |

## Decision

Keep `src/shared/lab` as an internal UI layer. It owns slots, layout, controls, status, and accessibility behavior. It does not own lesson state, formulas, scenario schemas, renderers, or action interpreters.

Image palettes are derived from the unique 8×8 source colors, sorted deterministically,
and quantized by nearest RGB squared distance. The index width remains `2..8` bits per
pixel; the source-derived palette is not a fixed RGB-space quantizer.

Do not create a framework package yet. All three consumers are inside one product and still have different teaching semantics. A package becomes justified only after an external consumer needs the same contract. `programming-viz` is intentionally outside this change.

## Boundary checks

- `src/app` imports feature pages, never feature domains directly for lesson logic.
- Feature domains do not import UI or router modules.
- Shared components do not import feature modules.
- No backend, auth, database, PWA, or cross-repository dependency is required.
