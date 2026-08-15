# Design QA

## Intent

Computing Lab / 图像编码 is a small, local-first workspace for inspecting the relationship between sampling density and palette depth. The UI uses a restrained technical surface: a cool canvas, white panels, hairline borders, tight type hierarchy, and a single blue interaction accent.

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

| Viewport | Expected composition | Verification |
| --- | --- | --- |
| 1440 × 1024 | 72px header; 280px rail; flexible center; 400px inspector; 4×4 cells near 52px | No horizontal overflow; rail, preview, and inspector align as three stable regions |
| 1024 × 900 | 240px rail; workspace in one column; inspector details below preview | Inspector uses native `details`; action area becomes a compact two-column row |
| 390 × 844 | Single column; mobile rail menu; stacked inspector; sticky safe-area actions | Escape closes the rail and returns focus to the menu button; controls remain reachable |

## Interaction QA

- The visible teaching loop is four steps: `01 Observe sampling`, `02 Adjust quantization`, `03 Calculate file size`, and `04 Write conclusion`; progress starts at `1 / 4`.
- Density and bits are constrained to `2..8`; moving either slider enters `editing`.
- `ready` exposes Run preview; Run preview enters `editing`.
- `editing` exposes Submit compression; only `density=4` and `bits=8` produce `success`.
- Other submitted profiles produce `failure`; Retry retains values and returns to `editing`.
- Success advances only while `step < 4`; the final-step action stays disabled.
- Reset returns to `ready` with density `4` and bits `8`, retaining the current workflow step.
- The 4×4 pixel field is a read-only grid of non-focusable `gridcell` elements; color labels remain available to assistive technology.
- Pixel labels include row, column, sample index, source color, display color, and bit depth.

## Visual checks

- Focus-visible rings are visible on buttons, sliders, and the inspector disclosure.
- Status uses `role="status"`; failure uses `role="alert"`.
- The page has one `h1`, semantic `header` / `nav` / `main` / `aside` landmarks, and an `aria-current="step"` marker.
- No remote fonts, APIs, uploads, codecs, router, backend, audio, sound, or home-network features are included.
