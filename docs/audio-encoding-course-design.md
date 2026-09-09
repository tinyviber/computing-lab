# Audio Encoding course design

**Status:** Batch 1 product pass; feature-local listening experiment.

## Product promise

> Listen to the original and reconstructed signal, change one encoding parameter, then explain the audible difference with waveform evidence.

Audio is an A/B listening lab, not a general DSP console. The primary entries are aliasing and quantization. Source choice, sampling offset, plot window, loop, and detailed views are secondary exploration.

## Learner trajectory

The page shows one compact static hint near the waveform, not a numbered route or inferred learning progress:

> Try this: listen to the original and reconstructed audio → change one parameter at a time → write down what you hear.

Waveform, samples, Nyquist/folded-frequency evidence, quantization levels, reconstruction error, scrubbing, and looping remain available for free exploration. The note card stores A/B settings and an open observation; it does not judge completion or unlock another control.

The phase control is labelled 采样偏移（offset, in turns）and its description states explicitly that it only moves sample positions inside one sampling interval — it does not change the sample rate.

The lesson reducer owns transport, cursor, loop, audition, and the evidence record. The domain remains the pure source/sampling/quantization model. No shared transport, clock, chart, or analysis workflow is introduced.

## URL contract

Canonical keys are `source`, `sampleRate`, `bitDepth`, `phase`, `mode`, `loop`, and `view`. Legacy `scenario`, `rate`, and `bits` remain readable. Canonical keys take precedence when both forms are present; repeated query values use the first value. Numeric values are clamped at the domain boundary and malformed enum/loop values fall back to defaults. Cursor, transport, audition, and transient plot state stay out of the URL.

## Audio fallback

The Web Audio adapter may be unavailable or blocked by the browser. The page must still expose transport state, A/B selection, waveform, samples, Nyquist, quantization, and error evidence. Automated browser checks can verify controls and visual/model evidence, but cannot claim to verify human hearing.

## Acceptance

- Static experiment suggestions are visible without `data-active-step`, `done/current/todo`, or inferred progress.
- The sound evidence card records A and B snapshots plus an open observation, without a completion badge or success state. Identical settings are allowed as a useful control comparison.
- Reset hierarchy is clear: 光标回到开头 (transport only), 重置分析与视图 (mode/view/audition), and 恢复初始设置并清空记录 (full reset). The first two preserve notes; the full reset clears them.
- The phase control is labelled 采样偏移 and its description states that it does not change the sample rate.
- The two primary experiment entries are visible without opening a secondary inspector.
- Original/reconstructed A/B controls remain available before and after parameter changes.
- Aliasing exposes Nyquist, classification, and folded frequency.
- Compare evidence states the current Nyquist frequency and points to the aliasing experiment.
- Quantization exposes level count, sample error, and payload impact.
- Visual-only fallback is explicit and accessible when `AudioContext` is unavailable.
- Narrow layout and keyboard controls preserve the same evidence path.
