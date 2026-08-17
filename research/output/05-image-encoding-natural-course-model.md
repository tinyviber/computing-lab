# Image Encoding natural course model

Implementation freeze: source raster → spatial sampling → sampled representation → color quantization → encoded index bits → reconstruction → visible spatial/color loss.

首版 uses an indexed-color model: bitDepth is index bits per sampled pixel, exposing the first 2^bitDepth entries of a deterministic nested RGB codebook. The codebook is independent of sampling; sampled values choose the nearest available entry, and each displayed index is the value used for reconstruction. Adding a bit can only add candidate colors, so sampled-RGB quantization error cannot increase.

## Trajectories

1. Upload/select a real image, lower sampling percentage, observe a same-display-size reconstruction become pixelated, inspect sampled width × height and pixel count, then select a local coordinate.
2. Keep sampling fixed, lower bit depth, observe finite palette states, banding and color loss, then inspect original/sample color, palette index, quantized color and bits.
3. Vary both parameters and compare similar raw payloads with different spatial versus color loss; there is no unique best setting.
4. Click a reconstructed pixel and follow source coordinate → sample cell → sampled value → palette entry → encoded index → bit string.
5. Optional prediction/reveal can explain which parameter causes which loss, but is never a course-level gate.

## State

Feature state: decoded raster source, samplingPercent, bitDepth, view (compare/sampling/quantization/representation), selectedCoordinate, and decodeError. Derived state: sampled dimensions/pixel count, coordinate mapping, finite palette, indices/bits, source-sized reconstructed raster, spatial/color loss evidence, selected-pixel inspection, and raw payload `sampledWidth × sampledHeight × bitDepth` bits with `ceil(bits / 8)` bytes. URL scenario state is only fixture, sampling, bits, and view; uploaded pixels, selection, file input/object URL, focus and reveal state are transient. There is no uploading/ready/completed phase.

## Comparison and boundaries

Source and reconstructed canvases have equal CSS display dimensions. Reconstruction expands each sampled cell over its source region and never samples the original during paint, so this is not CSS resize. Source, sampled representation, quantized representation, and reconstructed image stay separately inspectable.

First release excludes JPEG/PNG compression/file size, codec black boxes, universal workflow, shared ParameterPanel/Comparator/BitGrid/Inspector abstractions, full RGB channel allocation, upload serialization, and unique-answer grading. It uses P-C live parameter feedback, P-D same-size comparison, P-E pixel/value reveal, P-J real upload with deterministic fallback, and P-K coordinate-to-representation mapping. Similar UI patterns across Sound/Network/Image are candidates only for the later Primitive Extraction Review.

## Invariants

Sampling controls encoded dimensions while display dimensions stay source-sized. Reconstruction colors come only from sampled values and the fixed codebook selection. Every index is allowed and its bit string is exactly bitDepth bits. Lower bit depth exposes fewer nested states; higher bit depth cannot increase sampled-RGB quantization error. Raw payload is explicit and independent of browser file bytes. Pixel inspection equals the value used by reconstruction. Similar payloads can show different loss types.

No shared extraction or changes to Sound/Network are part of this implementation.
