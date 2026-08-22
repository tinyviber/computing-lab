# Image Encoding rebuild — implementation handoff

## 1. Guided course model

Image Encoding keeps its feature-local raster model, but the UI now presents one four-task sequential flow plus an extra challenge:

```text
1. form sampling evidence: baseline + changed snapshot + same observation spot + observation sentence
   → 2. choose palette/original color and adjust palette bit depth
   → 3. edit calculator inputs and calculate raw data quantity
   → 4. discuss the boundary between raw data and actual file size
   → extra challenge: stay within a fixed 20 KB theoretical rawBytes budget
```

The sampling-percent range, source comparison, evidence card, and upload input are enabled on first load. Color controls, phase/view controls, and pixel inspection actions are event-guarded until the evidence structure is complete. After task 1, color controls unlock; after task 2, the raw-data calculator unlocks; after task 3, the static file-format boundary and extra challenge appear. The extra challenge is not a fifth knowledge step.

The initial color representation is RGB24. Explicit `color=rgb24` links and old `color=palette` links are accepted for compatibility, but both open in RGB24; serialization omits the color parameter. Existing fixture and legacy scenario parameters remain parseable. URL parameters configure a reproducible scene only; they never set progress.

## 2. Feature-local state

`src/features/image-encoding/lesson/state.ts` owns:

- `samplingChanged`
- `colorAdjusted`
- `calculatorEdited`
- `samplingEvidence` with baseline/changed dimensions, pixel counts, observation spot, and observation text
- `budgetChallenge` with sampling, color mode, bit depth, readability judgment, trade-off explanation, acknowledgement, and submission signature

Reducer actions enforce the sequence. Sampling evidence is complete only when both snapshots belong to the same source, their normalized sampling values differ, the same observation spot is selected, and the observation text is non-empty. The observation is not judged against a unique answer. Selecting RGB24 or the palette, or changing palette bit depth after evidence, completes task 2. Editing calculator width or height completes task 3. Task 4 is a discussion boundary and has no completion button. Locked direct actions return the existing state.

The budget challenge uses a fixed `20 KB = 20,480 bytes` budget. Its pass condition is theoretical `rawBytes <= 20,480`, a selected observation spot and readability judgment, a non-empty trade-off explanation, and explicit acknowledgement that rawBytes is not the actual PNG/JPEG/WebP file size. It does not create files, read `Blob.size`, or compare formats.

Scenario load, reset, and successful upload clear progress. Upload also resets the color representation to RGB24. A failed upload only records the decode error and preserves the current lesson state. No shared lesson runtime is introduced.

## 3. Raster data flow

`RasterImage` is decoded in the feature UI/adapter. Pure domain calculations then run:

1. `sampleImage` computes sampled dimensions and representative source coordinates.
2. `quantizeSampledImage` either maps each sampled value to the nearest entry in the deterministic nested RGB codebook or preserves each sampled RGB channel directly in RGB24 mode.
3. In palette mode, `bitDepth` is the number of bits for one per-pixel color index. The codebook contains at most `2 ** bitDepth` colors, so b=2/4/8 means at most 4/16/256 colors; it is not b bits per RGB channel and not a JPEG parameter. Palette indices are formatted as exactly `bitDepth` bits; RGB24 values use 8 bits per channel.
4. `reconstructImage` expands each quantized sample cell over the source-sized display raster.
5. `deriveImageEncodingModel` keeps sampled-RGB quantization error separate from source-to-reconstruction error, compares source and reconstruction into an error map, and calculates the theoretical raw payload.

The source and reconstructed canvases keep the same CSS display size. The reconstruction is generated from sampled quantized cells; CSS resizing is not part of the model.

## 4. Upload input

The browser adapter decodes an uploaded image with `Image` and an offscreen canvas, capping the in-memory working raster at 96 pixels on its longest axis. The UI reports both original dimensions and working-raster dimensions. Uploads are input material, are not serialized into the URL, and are available from the first render. Successful uploads clear progress; failed uploads preserve the current lesson and only show a decode error.

## 5. File-format boundary and estimate boundary

`src/features/image-encoding/domain/model.ts` provides pure raw data calculations. The UI names raw/uncompressed, PNG, JPEG, and WebP only in the boundary discussion; it does not offer format buttons or claim a fixed compressed byte count.

The raw theoretical payload remains:

```text
rawBits = width × height × bitsPerPixel
rawBytes = ceil(rawBits / 8)
```

The format-boundary card explains that compressed file size depends on image content, encoding method, encoder settings, headers, and metadata. The calculator safely normalizes invalid, fractional, empty, and out-of-range numeric input before applying the exact raw-bits/raw-bytes formula. It does not estimate compressed file size, and the fourth task is shown as “可讨论” rather than “已完成”.

## 6. Preserved visual and compatibility surfaces

The feature retains source/reconstruction comparison, sampling geometry and phase behavior, compatibility fixtures, legacy scenario URLs, view tabs, local upload handling, color representation, palette details, and pixel-to-bits inspection. Those surfaces are now placed behind the four-task guards where appropriate.

The fixed classroom image remains the local deterministic 240 × 160 kitten raster in `src/features/image-encoding/domain/photo-rgb.ts`. Older fixtures remain addressable through `image=gradient`, `image=checkerboard`, `image=text-edge`, and `image=pixel-grid`.

## 7. Boundaries and review notes

The implementation is feature-local. No universal stepper, submit state, score, global workflow, or shared inspector was added. Domain functions remain pure, URL parsing remains configuration-only, and source/reconstruction geometry remains separate from the teaching sequence.
