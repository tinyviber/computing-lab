# Legacy shared lesson cleanup recommendation

**Scope:** audit performed during the Program Execution reference-course phase. This is a recommendation only; no legacy shared lesson file was deleted in the course change.

## Findings

| Surface                                                              | Current consumers                                                                    | Assessment                                                                                                               | Recommendation                                                                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `src/shared/lab/ExperimentStatus.tsx`                                | Its own unit test and barrel export; no production feature import                    | Truly unused in production; dangerous because `ready/editing/success/failure` signals the rejected global workflow model | Delete in a dedicated cleanup PR after removing its test/export and updating boundary assertions if needed                  |
| `src/shared/lab/ParameterControl.tsx`                                | Its own unit test and barrel export; no production feature import                    | Truly unused in production; encodes a generic parameter-control abstraction that current courses intentionally rejected  | Delete with `src/shared/lab/number.ts` (its only consumer), its test, and barrel export in a dedicated cleanup PR           |
| `src/shared/lab/FormulaPanel.tsx`                                    | Barrel export and no production feature import                                       | Truly unused; dangerous because it suggests formula rendering is a learning primitive                                    | Delete in dedicated cleanup PR after test/export verification                                                               |
| `src/shared/lab/VisualizationPanel.tsx`                              | Barrel export and no production feature import                                       | Truly unused; dangerous because it suggests a universal visualization slot                                               | Delete in dedicated cleanup PR after test/export verification                                                               |
| `src/shared/lab/index.ts` legacy exports                             | No production imports found; direct imports are used for current shell/provider code | Barrel is partly historical and makes obsolete surfaces discoverable                                                     | Replace with a minimal barrel or delete only after checking external/package consumers; repository is currently one package |
| `src/app/architecture-boundaries.test.ts` references to legacy names | Deliberate assertions that Sound/Image do not import old primitives                  | Still useful as a guard while cleanup is staged                                                                          | Update or remove only as part of the dedicated cleanup PR, not a course PR                                                  |

## Why this is separate

The current course architecture is intentionally feature-first. Removing historical files in a course diff would mix semantic course evidence with unrelated cleanup and make review harder. The old components are not being extracted, adapted, or consumed by Program Execution.

## Safe cleanup sequence

1. Confirm no production import with a repository-wide search and `bun run test:run`.
2. Remove the four unused components and their unit tests in one small cleanup PR.
3. Remove `ParameterControl`'s now-unused `number.ts` if no other consumer exists.
4. Remove obsolete barrel exports and update architecture-boundary tests that only mention deleted names.
5. Run format, lint, typecheck, full unit tests, build, and E2E commands.
6. Keep `LabShell`, `LabNavigationProvider`, and `number.ts` only if a post-removal consumer audit proves they remain needed.

No deletion is authorized by the Program Execution course branch itself.
