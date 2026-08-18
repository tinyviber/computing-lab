# Image Encoding — learner study

Evidence: 4 independent blinded persona passes. Rendered route: `/labs/image-encoding`.

## Intended objective

Learners should separate spatial sampling from color quantization, then connect both to a fixed-size reconstruction and raw payload. Intended chain: source raster → sample positions → sampled values → palette/index quantization → encoded index bits → reconstruction/error. The key transfer is not “the picture looks worse”; it is identifying whether geometry/detail or available colors caused the loss.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Compared gradient, checkerboard, thin lines; opened sampling/quantization/error evidence; used pixel inspector. | Same display size can hide fewer spatial samples or fewer colors; payload follows positions × bits. | Sampling phase remained vague. |
| Impatient explorer | Clicked presets and sliders first, then inspected the most visible difference. | Gradient banding = color quantization; thin-line loss/false pattern = sampling. | Slider/readout change was not visibly obvious. |
| Careful low-prior | Followed source coordinate → sample cell → value → palette/index → bits/error. | Can explain the causal path without relying on image quality alone. | “Palette index” versus color; raw payload versus compressed file. |
| Strong computing | Tested checkerboard, stripes, and payload arithmetic. | More bits do not restore missing positions; more samples do not restore missing levels. | Sampling phase/positioning semantics. |

## Observed interaction

The page’s strongest attractors were the same-size visual comparison, source presets, and evidence tabs. Learners naturally asked whether the browser had merely resized the image; the inspector and raw-payload readout changed that hypothesis. All four solved the frozen transfer: fewer levels create banding; 8 versus 4 bits at equal 1000×1000 sampling gives 2× raw data; stripes narrower than sample spacing need more samples, not more bits/compression.

Repeated observation: sample/bit sliders sometimes appeared not to commit or their readouts did not visibly update. Treat as P2 verification, not confirmed defect.

## Alignment

**Strong core; partial boundary semantics.** The intended causal distinction was teachable and transferred. Phase, indexed-color language, and “raw payload” scope need a teacher bridge. Page score was roughly 8–9/10; concept score 7–8/10.

## 5–15 minute teacher flow

Hook: show smooth gradient and thin stripes at the same display size. Commit: “Which setting caused each artifact?” Perturb one of sample count or bits. Step/inspect the coordinate-to-sample-to-index chain. Contrast checkerboard versus gradient. Name spatial sampling, quantization, and payload. Transfer: a new stripe pattern and a 1000×1000 byte-count question. Teacher silence target: 3/5 today; phase still needs one explicit prompt.

