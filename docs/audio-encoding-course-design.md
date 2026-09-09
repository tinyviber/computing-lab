# Audio Encoding course design

**Status:** Batch 1 product pass; feature-local listening experiment.

## Product promise

> Listen to the original and reconstructed signal, change one encoding parameter, then explain the audible difference with waveform evidence.

Audio is an A/B listening lab, not a general DSP console. The primary entries are aliasing and quantization. Source choice, phase, plot window, loop, and detailed views are secondary exploration.

## Learner trajectory

The experiment-path card at the top of the page numbers the intended route (01 → 02 → 03) and highlights the suggested step via `data-active-step`: step 01 while the student is still A/B-comparing original vs. reconstructed audio in `compare` mode, step 02 once an aliasing/quantization experiment is chosen, and step 03 once the cursor leaves the start point to inspect a sample against the readout.

1. Press play with the original audition, then switch to reconstructed audio for A/B comparison (step 01).
2. Choose either the sampling-rate experiment or the bit-depth experiment; change one parameter at a time and listen/watch again (step 02).
3. Move the cursor onto a sample and use the cursor readout to explain where the reconstruction error comes from (step 03).
4. Record a baseline snapshot and a changed snapshot in the sound evidence card (sample rate, bit depth, auditioned signal), then write a one-sentence explanation of the difference.
5. Read the waveform, samples, Nyquist/folded-frequency table, quantization levels, and reconstruction error.
6. Scrub or loop a short window to inspect a local sample.

The phase control is labelled 采样偏移（offset, in turns）and its description states explicitly that it only moves sample positions inside one sampling interval — it does not change the sample rate.

The lesson reducer owns transport, cursor, loop, audition, and the evidence record. The domain remains the pure source/sampling/quantization model. No shared transport, clock, chart, or analysis workflow is introduced.

## URL contract

Canonical keys are `source`, `sampleRate`, `bitDepth`, `phase`, `mode`, `loop`, and `view`. Legacy `scenario`, `rate`, and `bits` remain readable. Canonical keys take precedence when both forms are present; repeated query values use the first value. Numeric values are clamped at the domain boundary and malformed enum/loop values fall back to defaults. Cursor, transport, audition, and transient plot state stay out of the URL.

## Audio fallback

The Web Audio adapter may be unavailable or blocked by the browser. The page must still expose transport state, A/B selection, waveform, samples, Nyquist, quantization, and error evidence. Automated browser checks can verify controls and visual/model evidence, but cannot claim to verify human hearing.

## Acceptance

- The experiment-path card is visible with numbered steps 01–03 and a suggested active step that follows the A/B → experiment → cursor-readout progression.
- The sound evidence card can record a baseline and a changed snapshot plus a one-sentence explanation; two identical settings are flagged as incomplete, and completion is shown via badge and status line.
- Graded resets are available: 回到起点 (transport only), 重置分析视图 (mode/view/audition), and 恢复默认状态 (full reset). Recorded evidence survives the two light resets and is cleared by the full reset.
- The phase control is labelled 采样偏移 and its description states that it does not change the sample rate.
- The two primary experiment entries are visible without opening a secondary inspector.
- Original/reconstructed A/B controls remain available before and after parameter changes.
- Aliasing exposes Nyquist, classification, and folded frequency.
- Compare evidence states the current Nyquist frequency and points to the aliasing experiment.
- Quantization exposes level count, sample error, and payload impact.
- Visual-only fallback is explicit and accessible when `AudioContext` is unavailable.
- Narrow layout and keyboard controls preserve the same evidence path.
