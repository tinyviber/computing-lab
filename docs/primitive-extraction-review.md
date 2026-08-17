# Primitive Extraction Review

**Status:** review complete — **No extraction yet.**

**Decision:** The three reference courses prove a small app boundary, but they do **not** prove a new shared lesson primitive. No course code, state model, URL contract, or layout should be refactored in this review.

> The heterogeneity of the three courses is evidence, not something to eliminate. Shared code must express an invariant, never an appearance.

## Review scope and method

This review treats `research/output/04-interaction-primitives.md` as a hypothesis registry, not a delivery backlog. It independently read the current `main` implementation and its tests:

- `src/features/audio-encoding/**`;
- `src/features/home-network/**`;
- `src/features/image-encoding/**`;
- `src/shared/**`, `src/design/**`, app/catalog/router/error boundaries, `LabShell`, and test helpers;
- `src/app/architecture-boundaries.test.ts`;
- `docs/course-model-reset.md`, `docs/architecture.md`, `docs/design-qa.md`, `research/output/03-precedent-research.md`, and `research/output/04-interaction-primitives.md`;
- `docs/image-encoding-pr-handoff.md` and `research/output/05-image-encoding-natural-course-model.md`.

### Documentation inventory

The handoff evidence is intentionally asymmetric in the current repository:

- Image has a course-specific handoff and natural-model document.
- Sound and Network have no separate course-specific handoff/architecture Markdown documents.
- Their authoritative evidence is therefore their feature source/tests, `docs/course-model-reset.md`, and `docs/architecture.md`.

This is an evidence-gap observation. It is **not** a reason to manufacture matching documents or a shared abstraction.

### Terms used in the matrix

| Code | Meaning                                                                          |
| ---- | -------------------------------------------------------------------------------- |
| A    | Appearance: color, cards, spacing, rail, dense technical visual language.        |
| B    | DOM structure: a similar section, native input, SVG, canvas, list, or card.      |
| C    | Interaction semantics: the user performs recognizably similar manipulation.      |
| D    | State-transition semantics: the manipulation changes state by the same rule.     |
| E    | Mathematical invariant: the same calculation/fact remains true.                  |
| F    | Browser/runtime invariant: the same browser API or lifecycle constraint applies. |

A/B alone never qualifies. C is useful evidence for a small controlled render primitive only when the primitive does not own lesson state; shared behavior needs compatible D and, where applicable, E/F.

## 1. Independent course evidence

### Sound Encoding

| Concern                          | Evidence                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature-owned state**          | `SoundLessonState` owns source/config, `transport`, audition A/B, cursor, loop interval, mode, view, and an initial reset baseline (`lesson/state.ts:17-45`).                                                                                                                                                                            |
| **Derived state**                | `deriveSoundModel` derives timestamps/samples, quantization codes/levels/errors, Nyquist/alias evidence, cursor readout, payload, a bounded plot, and `reconstructAt` (`domain/model.ts:78-112`).                                                                                                                                        |
| **Actions**                      | Configuration/source changes, play/pause/stop, seek/tick, A/B audition, loop, mode/view, scoped resets, and scenario hydration (`lesson/state.ts:25-45`). A configuration change rewinds and stops; a seek preserves current transport (`lesson/state.ts:92-101,172-179`).                                                               |
| **Browser/runtime dependencies** | Feature-owned `requestAnimationFrame`/fallback timing in the page plus Web Audio buffer construction, node replacement, loop config, seek restart, source cleanup, cache keys, and `AudioContext` disposal (`ui/AudioEncodingPage.tsx:146-224`; `ui/audioPlayback.ts:76-234`). Audio unavailability falls back to visual-only operation. |
| **URL scenario semantics**       | Sound parses canonical-over-legacy source/rate/bits keys, finite numbers, a wrapping phase, mode/view, and a loop grammar. It omits defaults on serialization and does not serialize cursor/transport/audition (`lesson/scenario.ts:88-152`).                                                                                            |
| **Main interaction/rendering**   | Source/rate/window selects; bit-depth, phase, cursor sliders; transport buttons; audition toggles; loop; explicit advance; SVG waveform overlays and sample markers; metric/readout/evidence panels (`ui/AudioEncodingPage.tsx`).                                                                                                        |
| **Pedagogical invariants**       | Continuous time is real; sample rate changes Nyquist/aliasing and payload; bit depth changes quantization; the original/reconstructed A/B must stay meaningful at the same cursor; ticks/loops/seek have precise temporal behavior.                                                                                                      |
| **Only visually similar**        | Labelled inputs, a side inspector, summary cards, a reset button, and an SVG region are visual/DOM overlap only.                                                                                                                                                                                                                         |
| **Actual software invariants**   | A configuration mutation invalidates playback state; seeking does not; loop wrap is temporal; browser sound source must be replaced and disposed safely; A/B selects different audio buffers at the same time.                                                                                                                           |

### Home Network

| Concern                          | Evidence                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Feature-owned state**          | `HomeNetworkLessonState` owns named scenario/preset config, source/target, selected device, optional prediction, probe history, prediction-by-probe ID, selected trace, and selected event (`lesson/state.ts:19-30`).                                                                            |
| **Derived state**                | Domain derives configuration validity, target locality, neighbor/ARP results, route/NAT/reply causal events, deterministic probe ID, first failure, and delivered/blocked outcome (`domain/model.ts:594-1103`).                                                                                  |
| **Actions**                      | Raw host-field edits, device/target selection, optional locality prediction, atomic probe commit, selected history/trace/event, reset (`lesson/state.ts:34-47`). Edits intentionally do not create history; probe deep-clones a snapshot and then computes evidence (`lesson/state.ts:116-148`). |
| **Browser/runtime dependencies** | No feature clock, AudioContext, canvas decode, or browser persistence lifecycle. The topology is a fixed SVG and probe is a synchronous deterministic domain computation.                                                                                                                        |
| **URL scenario semantics**       | URL chooses only a named preset and optional target. It deliberately excludes editable config, probe history, prediction, selected trace/event, and all transient diagnostic state (`lesson/scenario.ts:98-140`).                                                                                |
| **Main interaction/rendering**   | Native text inputs retain malformed IP/prefix/gateway strings, device/target/prediction selects, a Send probe commit, fixed-topology SVG, causal event list, first-failure evidence, and immutable history/snapshot comparison (`ui/HomeNetworkPage.tsx`).                                       |
| **Pedagogical invariants**       | An invalid gateway is not a generic preflight form error: the trace reaches ARP and stops at its first causal failure. Each probe freezes the then-current config; later edits cannot rewrite history. Local/remote is a host/netmask decision before actual L2 neighbor resolution.             |
| **Only visually similar**        | Inspector heading/card, labelled controls, diagnostic card, reset, selected object, and a comparison region.                                                                                                                                                                                     |
| **Actual software invariants**   | Probe is a causally ordered commitment; snapshots are deeply immutable; first failure terminates trace; prediction attaches to probe identity, not current configuration.                                                                                                                        |

### Image Encoding

| Concern                          | Evidence                                                                                                                                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Feature-owned state**          | `ImageLessonState` owns fixture/upload source, sampling percentage, requested/effective phase, bit depth, view, selected source coordinate, decode error, and initial scenario (`lesson/state.ts:14-30`).                                                                                     |
| **Derived state**                | The domain derives sampled raster/dimensions/per-axis geometry, nested finite palette/index bits, same-size reconstruction, error map, raw payload, and source-coordinate-to-sample inspection (`domain/model.ts:41-110,446-521`).                                                            |
| **Actions**                      | Continuous sampling/bit-depth/phase/view changes, pixel selection, source load/decode error, reset (`lesson/state.ts:21-30`). There is no submit, phase, progress, status, or workflow action.                                                                                                |
| **Browser/runtime dependencies** | Feature-local image decode with `Image`, object URLs, canvas, a capped working raster, canvas paint/pick/keyboard navigation, and feature-local `role="alert"` decoding failure (`ui/ImageEncodingPage.tsx:65-205`).                                                                          |
| **URL scenario semantics**       | Fixture, sample percent, bit depth, phase, and view are reproducible. Phase canonicalization depends on **rounded per-axis geometry**, not merely scalar percentage. Uploaded pixels, selection, decode error, focus, and object URLs remain transient (`lesson/scenario.ts:101-135`).        |
| **Main interaction/rendering**   | Fixture/upload controls, controlled range inputs, view tabs, paired source/reconstruction canvases, canvas coordinate picking, read-only encoded sample grid, pixel-to-palette-to-bits inspector, palette list, and local error map (`ui/ImageEncodingPage.tsx`).                             |
| **Pedagogical invariants**       | Spatial sampling and indexed quantization are separate losses; reconstruction stays source-sized but only uses sampled/quantized cells; full-density axes force phase to zero; a nested codebook means added bit depth cannot worsen nearest-color error for the same sampled representation. |
| **Only visually similar**        | Controls, cards, a compare region, selected-object inspector, evidence and reset controls.                                                                                                                                                                                                    |
| **Actual software invariants**   | 2D coordinate maps to a sample cell; phase is per-axis geometry; reconstruction must not read original pixels at paint time; exact encoded bit width equals bit depth; upload errors remain feature-local.                                                                                    |

## 2. Cross-course evidence matrix

The table records the actual implementation before discussing an extraction. “None” means the course has no mechanism of that type, not an incomplete implementation.

| Candidate                        | Sound: actual mechanism                                                            | Network: actual mechanism                                                           | Image: actual mechanism                                                                                     | Overlap                                                   | Disposition                                                           |
| -------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------------------------------------- |
| Range / number / select controls | Selects plus ranges for rate/bits/phase/cursor; configuration stops/rewinds media. | Raw text fields preserve malformed values; selects choose device/target/prediction. | Controlled ranges update static raster evidence; phase disabled by derived geometry; fixture select/upload. | A/B; limited C for native controlled inputs. D conflicts. | Keep feature-local; field-level extraction is not yet cost-effective. |
| Scenario parsing                 | Canonical-first keys, legacy aliases, finite values, wrapping phase, loop grammar. | Named preset + target only.                                                         | Aliases plus integer-only values and geometry-derived phase canonicalization.                               | C: all parse query text. D/E differ.                      | No `ScenarioCodec`; see smaller-helper audit.                         |
| Scenario serialization           | Omits default source/config/mode/view/loop; excludes transport/cursor.             | Emits only non-default preset/target.                                               | Always emits normalized fixture/sample/phase/bits/view.                                                     | C only.                                                   | Feature-local.                                                        |
| Normalization / clamp            | Local clamp/finite config and wrapping phase.                                      | No scalar numeric clamp; raw configuration is intentionally retained.               | Local clamp/finite sampling, bits, and non-wrapping phase.                                                  | Small E for clamp alone; otherwise D/E differ.            | Keep domains self-contained.                                          |
| Compare layout                   | Same-time SVG overlay and A/B buffer audition.                                     | Earlier immutable probe snapshot versus current config.                             | Same-display-size source/reconstruction canvases sharing coordinate selection.                              | A/B; partial C (“compare”).                               | Reject behavioral comparator; no common geometry proven.              |
| Selected-object inspector        | Cursor maps time to nearest sample/readout.                                        | Device/event/trace selection exposes causal evidence.                               | Source coordinate maps to sample cell/palette/index/bits.                                                   | A/B only.                                                 | Feature-local.                                                        |
| Evidence cards                   | Aliasing, quantization, payload and cursor evidence.                               | First causal failure, observed locality, outcome and snapshot evidence.             | Error/payload/palette/pixel encoding evidence.                                                              | A/B.                                                      | CSS vocabulary only, no `EvidenceCard` API.                           |
| Chart / plot rendering           | Bounded time-domain SVG polyline/markers.                                          | Fixed topology SVG and ordered trace DOM.                                           | Raster/error canvas and CSS grid.                                                                           | A/B only.                                                 | Reject `Chart` family.                                                |
| Pixel/sample grids               | SVG sample markers/quantization levels, not a grid.                                | None.                                                                               | Read-only 2D encoded sample grid.                                                                           | Appearance only.                                          | No `BitGrid`.                                                         |
| Trace / history                  | Temporal playback cursor, not historical commitments.                              | Immutable committed probe history plus selected causal trace.                       | Selected coordinate, not trace/history.                                                                     | No compatible C/D.                                        | Network-local.                                                        |
| Transport                        | Full real-time transport/seek/loop/A-B and AudioContext lifecycle.                 | Atomic synchronous Send probe.                                                      | Static exploration.                                                                                         | No.                                                       | Sound-local.                                                          |
| Prediction                       | No current prediction feature.                                                     | Optional local/remote prediction stored by immutable probe ID.                      | No current prediction feature.                                                                              | One consumer.                                             | Network-local; no hard gate.                                          |
| Error display                    | Audio unavailable → visual-only fallback.                                          | Causal first failure in a trace.                                                    | Upload decode failure alert.                                                                                | A/B (“error visible”) only.                               | Feature-local.                                                        |
| Reset                            | Stops playback/cursor/A-B and restores scenario baseline.                          | Restores preset and clears history/selection/predictions.                           | Restores scenario source/config/view, drops upload.                                                         | C (“reset”) but D conflicts.                              | Feature-local.                                                        |
| Field labels / units             | Frequency/rate/bits/time units; dynamic source-specific plot units.                | IPv4/prefix/gateway labels; no numeric unit shell.                                  | Pixel/sampling/bit units; geometry-dependent phase explanation.                                             | A/B; partial C.                                           | Do not centralize labels/help/unit policy.                            |
| Navigation                       | All mount `LabShell`.                                                              | All mount `LabShell`.                                                               | All mount `LabShell`.                                                                                       | C/D/F identical app chrome.                               | Already proven shared app contract; retain unchanged.                 |
| URL state at router              | Router passes opaque search.                                                       | Router passes opaque search.                                                        | Router passes opaque search.                                                                                | F identical.                                              | Retain app-owned opaque transport.                                    |
| Test helpers                     | Route-aware `renderAppAt` hydrates Sound route.                                    | Same helper hydrates Network route.                                                 | Same helper hydrates Image route.                                                                           | C/D/F identical test setup.                               | Existing shared test helper; retain.                                  |

### What has actually passed the gate already

These are existing boundaries, not newly proposed lesson primitives:

| Existing contract                         | Consumers                   | Shared invariant                                                                                               | Why it is safe                                                                                                 |
| ----------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `LabShell`                                | Sound, Network, Image       | App chrome owns navigation/mobile focus/scrim/inert/main landmark and accepts opaque metadata plus `children`. | It has no lesson nouns, state machine, slots, renderer, scenario, or action model (`shared/lab/LabShell.tsx`). |
| Router `passThroughSearch`                | All three lab routes        | App routes accept/preserve opaque query records.                                                               | Feature parsers own all key meanings (`app/router.tsx:41-65`).                                                 |
| `LabNavigationProvider` and test renderer | App and all route UI suites | Catalog-driven navigation and route-aware test hydration.                                                      | It does not model a lesson (`shared/lab/LabNavigationProvider.tsx`, `test/router-test-helpers.tsx`).           |
| Design tokens/base styles                 | All pages                   | Color, spacing, focus, basic button/typography vocabulary.                                                     | Tokens are not behavioral lesson contracts.                                                                    |
| Architecture boundary test                | All production code         | `domain → lesson → ui`, public feature entries, and no feature/app import from shared.                         | This actively preserves course ownership (`app/architecture-boundaries.test.ts`).                              |

The historical `ParameterControl`, `FormulaPanel`, `VisualizationPanel`, and `ExperimentStatus` exports are **not** evidence of a current primitive: none of the three reference UIs consumes them. `ExperimentStatus` furthermore hard-codes `ready/editing/success/failure`, directly contradicting the frozen course model.

## 3. Primitive Extraction Gate

Every candidate was tested against the requested gate.

| Gate                                                                                            | Review result                                                                                                                                                 |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Two merged implementations use the same mechanism.                                           | No named `04` lesson candidate has two compatible current consumers. Future E1–E14 forecasts are not consumers.                                               |
| 2. The shared item is an invariant, not visual similarity.                                      | Cards, inspectors, two-column regions, controls, labels, and reset buttons stop at A/B or partial C.                                                          |
| 3. Removing it only duplicates code; no course model changes.                                   | Large candidates would require model changes: audio temporal effects, image coordinate mapping, or network snapshot/causal commitment would move into shared. |
| 4. It adds no absent phase/step/submit/workflow/transport/status/validator/prediction.          | `ParameterPanel`, `Stepper`, `Transport`, `PredictionGate`, `Validator`, and `ScenarioCodec` would all introduce exactly such policy.                         |
| 5. API has no textbook/domain noun.                                                             | Candidate APIs become sound/time, pixel/coordinate, or probe/route aware once made honest.                                                                    |
| 6. Consumers may retain different layouts.                                                      | No behavioral candidate can meet this without a render/slot/callback policy explosion.                                                                        |
| 7. Visual-only structure permits render primitive only.                                         | No repeated geometry has two compatible current consumers; a render wrapper would add indirection with no deduplication.                                      |
| 8. Different lifecycles cannot share runtime because buttons match.                             | Sound is media/clock lifecycle; Network is synchronous immutable commitment; Image is static recomputation.                                                   |
| 9. Optional-prop explosion is failure.                                                          | All broad candidates need callbacks for parsing, normalization, error timing, output rendering, lifecycle, and selection identity.                            |
| 10. Names approaching Experiment/Lesson/Workflow/Universal/GenericPanel/Runtime trigger review. | Proposed broad names fail for the preceding reasons; none is introduced.                                                                                      |

## 4. `04-interaction-primitives.md` hypothesis review

The source document correctly records future possibilities, but its cluster membership primarily counts planned E1–E14 courses. This review counts only present, independently implemented consumers.

| `04` hypothesis      | Disposition                                           | Evidence-driven reason                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BitGrid**          | **REJECT / TOO BROAD**                                | Image alone has a read-only 2D encoded grid. Sound has SVG sample markers; Network has none. A truthful general API needs one/two-dimensional geometry, values, selections, edits, highlights, accessible descriptions, mapping callbacks, and possibly zoom/virtualization.                                                                                                                                                     |
| **ParameterPanel**   | **REJECT BROAD FORM / WAIT FOR FIELD-LEVEL EVIDENCE** | A descriptor-driven panel would absorb Sound source-specific control options and media-reset policy, Image geometry-dependent phase disablement, and Network raw-string/error-retention rules. The correct direction is independent controlled fields, not a panel. This is **not** an approved extraction backlog: no field is extracted now because current duplicate LOC does not beat shared implementation + CSS/test cost. |
| **Stepper**          | **REJECT / TOO BROAD**                                | Sound’s advance is a time tick; Network events are generated atomically after probe commitment; Image has no sequence. There is no shared snapshot/forward/backward/auto-play transition rule.                                                                                                                                                                                                                                   |
| **Transport**        | **NEEDS ANOTHER REAL CONSUMER**                       | Only Sound has play/pause/stop/seek/loop/A-B, visual clock, RAF, and Web Audio resource cleanup. Forecast Monte Carlo batches or password enumeration would have discrete progress lifecycles, not proof of a shared runtime. At most a future course may prove a purely controlled render strip.                                                                                                                                |
| **Comparator**       | **REJECT / TOO BROAD**                                | Sound synchronizes audio/time, Image synchronizes raster coordinate/display geometry, and Network compares immutable snapshots. No shared behavioral `ComparatorRuntime` exists. `CompareLayout` remains a future **hypothesis**, not an extractable current primitive, because only Image uses matching side-by-side geometry.                                                                                                  |
| **PredictionGate**   | **NEEDS ANOTHER REAL CONSUMER**                       | Network currently has an optional prediction stored by probe ID; it is not hard-gated. Sound and Image do not implement prediction. A future gate must prove shared answer/reveal/attempt semantics rather than inherit Network’s commitment model.                                                                                                                                                                              |
| **Validator**        | **REJECT / TOO BROAD**                                | Network validation is target/path causal evidence; Image decode error is browser-adapter failure; Sound unavailability is graceful visual-only fallback. Timing, retention, recovery, and teaching meaning conflict.                                                                                                                                                                                                             |
| **Chart**            | **REJECT / TOO BROAD**                                | Sound is bounded SVG time geometry; Image is Canvas raster/error; Network is fixed topology SVG plus DOM events. A chart API would either erase meaning or become a renderer framework.                                                                                                                                                                                                                                          |
| **GraphView**        | **NEEDS ANOTHER REAL CONSUMER**                       | Network alone has a fixed, non-editable topology diagram. Neither waveform nor raster supplies a compatible node/edge data model.                                                                                                                                                                                                                                                                                                |
| **Builder**          | **NEEDS ANOTHER REAL CONSUMER**                       | No current reference course uses a builder. Do not build around future configuration tasks.                                                                                                                                                                                                                                                                                                                                      |
| **FormulaEvaluator** | **NEEDS ANOTHER REAL CONSUMER**                       | There is no current shared expression grammar, type system, whitelist, error model, or step reveal. Sound/Image formulas are feature-derived evidence; Network teaches causal paths.                                                                                                                                                                                                                                             |
| **ScenarioCodec**    | **REJECT / TOO BROAD**                                | Sound’s aliases/loop/wrapping/default omission, Network’s named presets/transient exclusion, and Image’s geometry-derived canonicalization are distinct schema contracts. `ScenarioCodec<T>` would be policy callbacks in a generic costume.                                                                                                                                                                                     |
| **SeedPRNG**         | **NEEDS ANOTHER REAL CONSUMER**                       | No reference course has a seeded random sequence. A tiny deterministic algorithm should be extracted only when a second real feature needs identical seed/sequence guarantees.                                                                                                                                                                                                                                                   |

### ParameterPanel decomposition

The only valid shape for a future low-level control layer is controlled, semantic-neutral render components:

```text
RangeField
NumberField
SelectField
SegmentedControl
ToggleField
field label / help / unit shell
```

Such components must not own scenario state, validation policy, layout, option generation, workflow, or lesson reducer dispatch. They are **not** being introduced by this review: current implementation divergence and the LOC audit below fail the cost gate.

### Scenario parsing: smaller than a codec, still not worth extracting

All three features independently implement a roughly 10–11 line search-record-to-`URLSearchParams` adapter with first-array-value behavior. That is a real low-level C/F overlap, but it is too small and has subtle choices:

- Sound clones `URLSearchParams`, has canonical-first numeric keys, and rejects malformed canonical values instead of falling through.
- Network uses named presets and only scalar `scenario`/`target` values.
- Image returns an existing `URLSearchParams`, searches aliases in order, and hands canonicalization to raster geometry.

A shared `ScenarioCodec<T>` is rejected. A future two-consumer extraction may be a tiny helper such as `firstSearchRecordValue` or `toSearchParams`, provided both callers first prove the **same ownership/copy semantics** and the helper decreases total code including tests.

## 5. Code-size and complexity audit

Counts are conservative, source-line estimates from the current feature implementations. “Feature-specific after” is the code that must remain even if a shared item existed; it is not a promise to implement it.

| Candidate                                |                                                                       Current repeated / similar LOC |                             Hypothetical shared LOC |                        Adapter LOC |                                                Feature-specific after extraction | Cost result                                                                                                                                         |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------: | --------------------------------------------------: | ---------------------------------: | -------------------------------------------------------------------------------: | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Search-record coercion                   |                                                                 ~31 (Sound 11, Network 11, Image 10) |                         ~12 helper + ~20 unit tests |        ~3 imports/call adjustments |                                 ~250 parser/schema/canonicalization lines remain | **Do not extract:** ~35 shared+adapter+tests is already at/above the mechanical duplication, and copy/precedence semantics differ.                  |
| `clamp` function                         |                                         ~6 in Sound/Image domain plus a legacy 3-line shared version |                                                  ~3 |                         ~2 imports |                                     All finite/rounding/phase rules remain local | **Do not migrate:** savings are negligible and `domain` is deliberately self-contained; the architecture test prohibits domain → `shared` imports.  |
| `RangeField` shell                       | ~47 local Image field + ~36 comparable Sound range markup = ~83, but layout/styles are not identical | ~45 component + ~30 primitive test + ~20 shared CSS | ~18–30 call-site/style adaptations | Dynamic Sound descriptions/selects and Image phase geometry remain feature-owned | **Do not extract:** the apparent saving disappears once CSS/a11y test/adapter costs are honest; a common shell would force layout class/slot props. |
| Select/number/toggle field family        |                                  ~0 mechanically repeated field component (only raw per-page markup) |                           35–60 each + tests/styles |                 10–25 per consumer |  Source-specific options, raw Network text handling, unit/help/disabled policies | **Do not extract:** no present repeated component and prospective API is wider than the markup.                                                     |
| Compare layout                           |                  ~0 mechanical block: Sound overlay, Image paired canvases, Network history snapshot |                                              ~20–30 |                ~20–40 per consumer |                         Time/coordinate/snapshot behavior remains entirely local | **Do not extract:** no shared geometry with two consumers.                                                                                          |
| Inspector/evidence card                  |                   ~0 mechanical block: cursor/sample, causal first-failure, coordinate/palette proof |                                              ~25–40 |           25–60 slots/data mapping |                                          All meaningful inspection/evidence code | **Do not extract:** generic card only hides semantic differences.                                                                                   |
| Plot/grid/graph                          |                             ~0 mechanical block: SVG waveform, Canvas/CSS raster, fixed topology SVG |                                              60–150 |                             30–100 |                                               Domain-specific geometry/rendering | **Do not extract:** API cost exceeds any duplication and creates a renderer framework.                                                              |
| Transport/trace/history/prediction/reset |                                                             ~0 shared behavior: only local instances |                              80–250 runtime + tests |                 30–100 per feature |                                                   Most lifecycle/transition code | **Do not extract:** requires incompatible state machines.                                                                                           |

### Audit conclusion

The only mechanically similar blocks are very small helpers and native field markup. For each, `shared + adapters` is at least comparable to the code it would remove **before** the required primitive tests and shared CSS are included. Larger similarities are semantic lookalikes rather than duplicate code. Therefore the cost gate independently reaches the same result as the invariant gate: **no extraction.**

## 6. Independent adversarial abstraction review

A separate read-only reviewer independently examined the three courses, current architecture/docs, and all named `04` hypotheses. The reviewer was instructed to disprove abstractions rather than propose them.

### Attacks and outcomes

| Attack                                         | Result                                                                                                                                                                                 |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Is it only visual/DOM similarity?              | Yes for cards, inspectors, labels, controls, two-sided regions, render containers, resets, and errors.                                                                                 |
| Does it secretly bind Sound time/audio?        | `Transport` and `Comparator` would need cursor, loop, selected buffer, RAF, AudioContext replacement/disposal, and visual-only fallback. Rejected.                                     |
| Does it secretly bind Image coordinates?       | `BitGrid`, `Comparator`, inspector, and chart candidates would need sample-cell ownership, per-axis phase, raster reconstruction, palette/index mapping, and canvas picking. Rejected. |
| Does it secretly bind Network trace semantics? | `Validator`, `Stepper`, `Comparator`, prediction, reset, and history candidates would need snapshot identity, first failure, causal event order, and raw-edit retention. Rejected.     |
| Does optional callback/prop growth appear?     | Every broad candidate needs render slots plus policy callbacks for parsing, normalization, options, failures, lifecycle, selection, or output mapping. Failure.                        |
| Would a fourth course be forced to fit?        | Yes for named broad candidates. The recommended future rule is: build it feature-local first, then extract only while adding its second compatible consumer.                           |
| Is feature-local shorter/clearer?              | Yes. Sound’s local audio adapter, Network’s local probe reducer, and Image’s local raster adapter are direct and testable without a configuration framework.                           |
| Are future consumers only hypotheses?          | Yes. `04` is a roadmap/research registry, not current implementation evidence.                                                                                                         |
| Is deletion of an abstraction healthy?         | Yes: removing every proposed lesson abstraction leaves all three courses more natural, with only small local duplication.                                                              |

**Adversarial verdict:** no named `04` hypothesis survives the strict current-consumer gate. The only contracts that survive are already-existing app/test boundaries.

## 7. Extraction decision

### A. Extract now

**None.** No new shared lesson primitive meets both the invariant and cost gates.

Existing `LabShell`, opaque router transport, navigation provider, route-aware test helpers, design tokens, and architecture checks remain in place. They are not expanded in this review.

### B. Decompose hypotheses / wait

This bucket deliberately contains **no approved implementation backlog**. It records a smaller boundary to reassess only when a second compatible feature independently needs it.

| Broad candidate  | Smaller boundary                                                                                                                              | Current decision                                                                                                                              |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `ParameterPanel` | Independently controlled `RangeField`, `NumberField`, `SelectField`, `SegmentedControl`, `ToggleField`, and an optional label/help/unit shell | Wait: do not implement until an individual field has two compatible consumers **and** shared+adapter+test cost drops below local duplication. |
| `ScenarioCodec`  | At most tiny first-value/search-record coercion or finite-number parse helpers                                                                | Wait: current schemas and copy/precedence semantics make the cost saving illusory.                                                            |
| `Comparator`     | At most a pure `CompareLayout` geometry wrapper                                                                                               | Wait: this is a hypothesis only; matching paired geometry currently has one consumer (Image).                                                 |

### C. Wait for another real consumer

- `Transport` (Sound is the only real consumer; do not extract its runtime).
- `PredictionGate` (Network optional prediction is not a gate).
- `GraphView` (Network fixed topology only).
- `Builder`, `FormulaEvaluator`, and `SeedPRNG` (no current consumers).
- Any individual controlled field that a future feature independently implements with matching controlled, accessibility, and layout-neutral behavior.

### D. Reject

- `BitGrid`, `Stepper`, `ComparatorRuntime`, `Validator`, `Chart`, and `ScenarioCodec<T>`.
- A universal `ParameterPanel`.
- Any generic inspector/evidence card, trace/history runtime, reset runtime, error/status runtime, scenario schema, feature state/action union, fixed shell slots, phase/step/submit/workflow layer, or shared lesson clock.

### Explicit non-extractions

The following visual similarities are deliberately left local:

- two-column/side-inspector layouts;
- cards, metrics, title/label/help text, and units;
- evidence/failure notices;
- selected cursor/device/pixel views;
- reset controls;
- SVG/canvas/grid containers;
- scenario parse/serialize shape.

## 8. Implementation and validation handoff

### Change scope

- **Implementation:** none.
- **Course behavior:** unchanged for Sound, Home Network, and Image.
- **Scenario URLs:** unchanged.
- **Course state models/layouts:** unchanged.
- **New lesson runtime/status/phase/workflow:** none.
- **Primary output:** this review document only.

The absence of an extraction means primitive-specific unit tests are intentionally not added. Existing feature tests already protect the three different course contracts; a future extraction must add primitive unit tests plus at least two real consumer tests before moving code.

### Fourth-course independence test

A fourth course remains free to implement its own domain, lesson state, URL schema, interaction lifecycle, and layout without importing any proposed primitive. Shared is optional, never a mandatory framework.

### Verification results

| Command                                                     | Result                                             | Notes                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run lint`                                              | Pass                                               | Exit 0.                                                                                                                                                                                                                                                                                                                                        |
| `bun run typecheck`                                         | Pass                                               | Exit 0.                                                                                                                                                                                                                                                                                                                                        |
| `bun run test:run`                                          | Pass                                               | 22 files, 172 tests passed. Expected JSDOM `scrollTo` diagnostics were emitted but did not fail tests.                                                                                                                                                                                                                                         |
| `bun run format:check`                                      | Baseline failure unrelated to this review document | Prettier reports 16 pre-existing untracked research/source Markdown files under `research/output/**` and `research/source/**`; it does not report this document. Do not mass-reformat research artifacts in a primitive-extraction review.                                                                                                     |
| `bunx prettier --check docs/primitive-extraction-review.md` | Pass                                               | The changed review document matches Prettier style.                                                                                                                                                                                                                                                                                            |
| `bun run build`                                             | Pass                                               | Exit 0; 150 modules transformed and production assets emitted.                                                                                                                                                                                                                                                                                 |
| `bun run test:e2e`                                          | Blocked on local Playwright browser                | The build/typecheck stage passes, but all 13 browser tests stop before page execution because Chromium is absent from the local Playwright cache. Two `bunx playwright install chromium` attempts produced no output and were terminated (one after 180 seconds, one background attempt after repeated waits). Provision Chromium, then rerun. |

### Recommended next action

Provision the Playwright Chromium executable and rerun the blocked E2E suite. With that environment prerequisite met, submit this as a **documentation-only boundary decision**. Do not start a fourth course or a refactor in the same PR. When a future course independently duplicates a candidate, reopen this matrix, compare the real transition/runtime contracts, write a two-consumer primitive test first, and extract only the smallest invariant that still passes this gate.
