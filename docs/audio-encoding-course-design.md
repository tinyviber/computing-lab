# Audio Encoding course design

**Status:** Batch 1 product pass; feature-local listening experiment.

## Product promise

> Listen to the original and reconstructed signal, change one encoding parameter, then explain the audible difference with waveform evidence.

Audio is an A/B listening lab, not a general DSP console. The primary entries are aliasing and quantization. Source choice, phase, plot window, loop, and detailed views are secondary exploration.

## Learner trajectory

1. Choose either the sampling-rate experiment or the bit-depth experiment.
2. Press play with the original audition, then switch to reconstructed audio for A/B comparison.
3. Change sample rate, bit depth, or phase and listen again.
4. Read the waveform, samples, Nyquist/folded-frequency table, quantization levels, and reconstruction error.
5. Scrub or loop a short window to inspect a local sample.

The lesson reducer owns transport, cursor, loop, and audition. The domain remains the pure source/sampling/quantization model. No shared transport, clock, chart, or analysis workflow is introduced.

## URL contract

Canonical keys are `source`, `sampleRate`, `bitDepth`, `phase`, `mode`, `loop`, and `view`. Legacy `scenario`, `rate`, and `bits` remain readable. Canonical keys take precedence when both forms are present; repeated query values use the first value. Numeric values are clamped at the domain boundary and malformed enum/loop values fall back to defaults. Cursor, transport, audition, and transient plot state stay out of the URL.

## Audio fallback

The Web Audio adapter may be unavailable or blocked by the browser. The page must still expose transport state, A/B selection, waveform, samples, Nyquist, quantization, and error evidence. Automated browser checks can verify controls and visual/model evidence, but cannot claim to verify human hearing.

## Acceptance

- The two primary experiment entries are visible without opening a secondary inspector.
- Original/reconstructed A/B controls remain available before and after parameter changes.
- Aliasing exposes Nyquist, classification, and folded frequency.
- Quantization exposes level count, sample error, and payload impact.
- Visual-only fallback is explicit and accessible when `AudioContext` is unavailable.
- Narrow layout and keyboard controls preserve the same evidence path.
