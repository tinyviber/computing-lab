# Audio Encoding — learner study

Evidence: 4 independent blinded persona passes. Rendered route: `/labs/audio-encoding`.

## Intended objective

Separate sampling rate (time/frequency detail) from bit depth (amplitude precision), then use Nyquist, folded frequency, quantization levels, sample-hold reconstruction, and payload arithmetic to explain the waveform. Fixtures include pure 440 Hz, high pulse, speech-like composite, and harmonic-rich sawtooth.

## Learner reports

| Persona | Natural path | Model after exploration | Friction |
| --- | --- | --- | --- |
| Curious average | Played audio, chose high pulse, opened Samples/Aliasing/Levels/Error. | Rate controls time detail and aliasing; depth controls amplitude steps. | “Folded frequency” needed translation. |
| Impatient explorer | Ran default, then tried 24k/44.1k and high-pulse fixtures. | 48k/16-bit versus 24k/8-bit is 4× raw payload; knobs affect different failure modes. | Bit-depth/phase control feedback unclear. |
| Careful low-prior | Read sample table and quantization levels before changing settings. | Can distinguish a wrong frequency from amplitude rounding. | Fixed playback rate versus selectable analysis rate. |
| Strong computing | Used 18 kHz at 30 kHz as an aliasing case and inspected component table. | Aliases fold; more bit depth cannot repair undersampling; use higher rate/pre-filter. | Nyquist terminology and bilingual headings. |

## Observed interaction

Play controls, fixture choice, waveform comparison, aliasing table, and quantization/error views supported a productive path. All four solved transfer: sampling rate changes temporal/frequency resolution; bit depth changes amplitude precision; 24k/8-bit → 48k/16-bit is 4× raw data; 18 kHz sampled at 30 kHz appears at 12 kHz and needs higher rate or pre-filtering, not more bit depth.

Repeated observation: bit-depth and phase controls sometimes failed to show a clear committed readout. Verify manually before coding. “Nyquist,” “folded,” and analysis-rate versus playback-rate distinctions were the main teacher burden.

## Alignment

**Strong core; partial terminology/evidence legibility.** Transfer is strong, but the page can let a learner say “bad sound” without naming whether the cause is aliasing or quantization. Page/concept self-scores were about 4/5.

## 5–15 minute teacher flow

Hook: play high pulse at a low rate. Commit: “Which knob fixes the wrong pitch? Which fixes staircase amplitude?” Perturb rate, then depth separately. Inspect aliasing component table and quantization levels. Contrast a high-rate/low-depth case with low-rate/high-depth. Name Nyquist, folding, quantization, and payload. Transfer: 18 kHz at 30 kHz and a raw-bit comparison. Teacher silence target: 3/5; define folded frequency at the first table.

