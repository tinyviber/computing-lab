# Image Encoding rebuild — implementation handoff

## 1. Exploratory model

Image Encoding keeps its feature-local raster model, with an exploratory feedback loop plus two optional note/feedback tools:

```text
change one parameter → inspect the image and metrics → make a judgment → try another parameter

optional evidence card: baseline + changed snapshot + optional observation spot + open observation text
optional budget challenge: keep raw data within the source baseline's 25% budget while preserving a target detail
```

Sampling, sampling offset, view, pixel inspection, color controls, calculator, file-format boundary, evidence card, and challenge are independently usable on first load. The evidence card records A and B independently and never grants navigation permission. The challenge is a live optional feedback surface, not a fifth step and not a mastery submission flow.

The initial color representation is RGB24. Explicit `color=rgb24` links and old `color=palette` links are accepted for compatibility, but both open in RGB24; serialization omits the color parameter. Existing fixture and legacy scenario parameters remain parseable. URL parameters configure a reproducible scene only; they never set learning progress.

## 2. Feature-local state

`src/features/image-encoding/lesson/state.ts` owns:

- `samplingEvidence` with independent baseline/changed dimensions, pixel counts, an optional observation spot, and open observation text
- `budgetChallenge` with sampling, color mode, bit depth, readability judgment, trade-off explanation, and acknowledgement

Reducer actions keep the controls independent. The evidence card is a notebook: it records A and B plus whatever observation the learner chooses to write. There is no evidence-completion predicate or navigation gate. The challenge has no submit state: the UI continuously reports budget facts and the student's readability judgment.

The budget challenge reuses the existing source baseline's 25% theoretical raw-data budget. It reports “over budget”, “within budget but target detail not recognizable”, or “within budget and student judges the target recognizable”; `readability=no` is not presented as success. It does not create files, read `Blob.size`, or compare formats.

Scenario load, reset, and successful upload clear notes. Upload also resets the color representation to RGB24. A failed upload only records the decode error and preserves the current lesson state. No shared lesson runtime is introduced.

## 3. Raster data flow

`RasterImage` is decoded in the feature UI/adapter. Pure domain calculations then run:

1. `sampleImage` computes sampled dimensions and representative source coordinates.
2. `quantizeSampledImage` either maps each sampled value to the nearest entry in the deterministic nested RGB codebook or preserves each sampled RGB channel directly in RGB24 mode.
3. In palette mode, `bitDepth` is the number of bits for one per-pixel color index. The codebook contains at most `2 ** bitDepth` colors, so b=2/4/8 means at most 4/16/256 colors; it is not b bits per RGB channel and not a JPEG parameter. Palette indices are formatted as exactly `bitDepth` bits; RGB24 values use 8 bits per channel.
4. `reconstructImage` expands each quantized sample cell over the source-sized display raster.
5. `deriveImageEncodingModel` keeps sampled-RGB quantization error separate from source-to-reconstruction error, compares source and reconstruction into an error map, and calculates the theoretical raw payload.

The source and reconstructed canvases keep the same CSS display size. The reconstruction is generated from sampled quantized cells; CSS resizing is not part of the model.

## 4. Upload input

The browser adapter decodes an uploaded image with `Image` and an offscreen canvas, capping the in-memory working raster at 96 pixels on its longest axis. The UI reports both original dimensions and working-raster dimensions. Uploads are input material, are not serialized into the URL, and are available from the first render. Successful uploads clear notes; failed uploads preserve the current lesson and only show a decode error.

## 5. File-format boundary and estimate boundary

`src/features/image-encoding/domain/model.ts` provides pure raw data calculations. The UI names raw/uncompressed, PNG, JPEG, and WebP only in the boundary discussion; it does not offer format buttons or claim a fixed compressed byte count.

The raw theoretical payload remains:

```text
rawBits = width × height × bitsPerPixel
rawBytes = ceil(rawBits / 8)
```

The format-boundary card explains that compressed file size depends on image content, encoding method, encoder settings, headers, and metadata. The calculator safely normalizes invalid, fractional, empty, and out-of-range numeric input before applying the exact raw-bits/raw-bytes formula. It does not estimate compressed file size; the boundary remains a discussion surface rather than a completion state.

## 6. Preserved visual and compatibility surfaces

The feature retains source/reconstruction comparison, sampling geometry and offset behavior, compatibility fixtures, legacy scenario URLs, view tabs, local upload handling, color representation, palette details, and pixel-to-bits inspection. Those surfaces remain independently usable while the evidence and challenge cards provide optional structure and feedback.

The fixed classroom image remains the local deterministic 240 × 160 kitten raster in `src/features/image-encoding/domain/photo-rgb.ts`. Older fixtures remain addressable through `image=gradient`, `image=checkerboard`, `image=text-edge`, and `image=pixel-grid`.

## 7. Boundaries and review notes

The implementation is feature-local. No universal stepper, submit state, score, global workflow, or shared inspector was added. Domain functions remain pure, URL parsing remains configuration-only, and source/reconstruction geometry remains separate from the teaching sequence.
