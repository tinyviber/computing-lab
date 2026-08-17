# Design QA

## Intent

Computing Lab is a local-first collection of interactive computing lessons. Image Encoding exposes the causal chain from a source raster through spatial sampling, indexed color quantization, finite representation, and same-size reconstruction. The UI uses a restrained technical surface: a cool canvas, white panels, hairline borders, tight type hierarchy, and a single blue interaction accent.

The existing `vercel_design.md` reference is preserved as-is. This screen intentionally follows the implementation brief in this task instead of the reference file's marketing-gradient and pill guidance.

## Token checklist

- Canvas: `#F6F8FB`
- Surface: `#FFFFFF`
- Subtle surface: `#F1F4F8`
- Border: `#D9E0E8`
- Primary ink: `#17212B`
- Secondary ink: `#526171`
- Accent: `#2563EB`
- Focus semantic token: `#60A5FA`; focus ring: `#1D4ED8` for 3:1 indicator contrast
- Success / warning / danger: `#15803D` / `#B45309` / `#B42318`
- Control and panel radii: `4px` / `6px`
- Base spacing: `4px`, with `8px` rhythm

## Responsive QA matrix

| Viewport    | Expected composition                                    | Verification                                                                       |
| ----------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1440 × 1024 | 72px header; flexible center; feature-local side column | No horizontal overflow; source/reconstruction and inspector remain legible         |
| 1024 × 900  | Workspace in one column; controls below evidence        | Canvas pair keeps equal display dimensions; representation remains inspectable     |
| 390 × 844   | Single column; mobile rail menu; stacked feature cards  | Escape closes the app rail; controls, upload, tabs, and inspector remain reachable |

## Interaction QA

- The course is continuous: source selection/upload, sampling, phase, bit depth, view changes, and pixel inspection update evidence immediately. There is no workflow step, submit, retry, success/failure, or unique target profile.
- Sampling is constrained to `10..100%`; bit depth is constrained to `1..8`; phase is constrained to `0..0.99`.
- Source and reconstructed canvases retain the same source display dimensions. The reconstructed raster is generated from sampled/quantized cells and is not CSS resizing.
- Built-in fixtures include a disclosed controlled color scene (not a photograph), gradient, checkerboard, text-edge, and pixel-grid material. Upload decode errors are feature-local alerts; uploaded pixels stay in memory.
- The representation grid is a read-only dynamic sampled grid with accessible cell labels containing sample index, source color, palette index, and encoded bits.
- The pixel inspector shows source coordinate, sample cell, sampled value, palette entry/index, exact bit string, and RGB error used by the reconstruction.
- The error view renders per-pixel RGB difference evidence; raw payload uses `sampledWidth × sampledHeight × bitDepth` and explicitly does not claim browser file size.

## Visual checks

- Focus-visible rings are visible on buttons, selects, sliders, file input, tabs, and image canvases; focused canvases support arrow-key pixel selection.
- Upload failures use `role="alert"`; successful local upload notices use `role="status"`.
- The page has one `h1`, semantic `header` / `main` / `aside` landmarks, and feature-local evidence tabs.
- No remote fonts, APIs, codecs, backend, account system, or shared lesson workflow are included. Client-side routing, audio representation, and home-network configuration lessons remain separate features.
