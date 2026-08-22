# Image Encoding rebuild — implementation handoff

## 1. Guided course model

Image Encoding keeps its feature-local raster model, but the UI now presents one four-task sequential flow:

```text
1. change sampling percent
   → 2. choose palette/original color and adjust palette bit depth
   → 3. choose raw, PNG, JPG/JPEG, or WebP
   → 4. edit calculator inputs and compare data quantities
```

Only the sampling-percent range is enabled on first load. Phase, view tabs, canvas/pixel selection, color controls, upload, format choices, and the calculator are visibly disabled and event-guarded until their prerequisites are met. After task 1, visual inspection and upload become available; after task 2, format choices become available; after task 3, the calculator becomes available.

The initial color representation is RGB24. Explicit `color=rgb24` links remain supported, and links without a color parameter now open in RGB24 as well. Existing fixture and legacy scenario parameters remain parseable. URL parameters configure a reproducible scene only; they never set progress.

## 2. Feature-local state

`src/features/image-encoding/lesson/state.ts` owns:

- `samplingChanged`
- `colorAdjusted`
- `formatSelected`
- `selectedFormat`

Reducer actions enforce the sequence. A sampling action only completes task 1 when its normalized value differs from the current value, including range changes made with keyboard or touch. Selecting the palette opens the color controls; lowering the palette bit depth completes task 2. Selecting any supported format completes task 3. Locked direct actions return the existing state.

Scenario load, reset, and successful upload clear progress. Upload also resets the color representation to RGB24 and the format to raw. A failed upload resets the lesson before displaying the decode error. No shared lesson runtime is introduced.

## 3. Raster data flow

`RasterImage` is decoded in the feature UI/adapter. Pure domain calculations then run:

1. `sampleImage` computes sampled dimensions and representative source coordinates.
2. `quantizeSampledImage` either maps each sampled value to the nearest entry in the deterministic nested RGB codebook or preserves each sampled RGB channel directly in RGB24 mode.
3. Palette indices are formatted as exactly `bitDepth` bits; RGB24 values use 8 bits per channel. Adding a palette bit only adds codebook entries and cannot increase nearest-color error for the same sampled image.
4. `reconstructImage` expands each quantized sample cell over the source-sized display raster.
5. `deriveImageEncodingModel` keeps sampled-RGB quantization error separate from source-to-reconstruction error, compares source and reconstruction into an error map, and calculates the theoretical raw payload.

The source and reconstructed canvases keep the same CSS display size. The reconstruction is generated from sampled quantized cells; CSS resizing is not part of the model.

## 4. Upload input

The browser adapter decodes an uploaded image with `Image` and an offscreen canvas, capping the in-memory working raster at 96 pixels on its longest axis. The UI reports both original dimensions and working-raster dimensions. Uploads are input material, are not serialized into the URL, and are disabled until task 1 has been completed.

## 5. Format profiles and estimate boundary

`src/features/image-encoding/domain/model.ts` provides pure functions for format profiles, human labels, classroom estimated bytes, and calculator calculations. Supported formats are raw/uncompressed, PNG, JPEG, and WebP.

The raw theoretical payload remains:

```text
rawBits = width × height × bitsPerPixel
rawBytes = ceil(rawBits / 8)
```

Format values are labeled `教学估算` in the UI. They are deterministic classroom comparison values for the current sampled representation, not browser file sizes, encoder guarantees, or a claim about a real compression ratio. Real bytes depend on image content, encoder settings, headers, color tables, metadata, and implementation details. The calculator safely normalizes invalid, fractional, empty, and out-of-range numeric input before applying the formula.

## 6. Preserved visual and compatibility surfaces

The feature retains source/reconstruction comparison, sampling geometry and phase behavior, compatibility fixtures, legacy scenario URLs, view tabs, local upload handling, color representation, palette details, and pixel-to-bits inspection. Those surfaces are now placed behind the four-task guards where appropriate.

The fixed classroom image remains the local deterministic 240 × 160 kitten raster in `src/features/image-encoding/domain/photo-rgb.ts`. Older fixtures remain addressable through `image=gradient`, `image=checkerboard`, `image=text-edge`, and `image=pixel-grid`.

## 7. Boundaries and review notes

The implementation is feature-local. No universal stepper, submit state, score, global workflow, or shared inspector was added. Domain functions remain pure, URL parsing remains configuration-only, and source/reconstruction geometry remains separate from the teaching sequence.
