# Learner-study synthesis

Date: 2026-08-19. Research only; no production implementation changes in this phase.

## Executive finding

The labs are already strong causal instruments. Learners usually manipulate, inspect an intermediate trace, revise a mental model, and solve transfer. No broad P0 objective failure appeared in the sampled runs.

Biggest leverage: make the hidden course move explicit. The product currently supplies excellent evidence, but learners often skip prediction and teachers must supply the vocabulary bridge. The next implementation phase should strengthen a reusable **predict → perturb → inspect → explain → transfer** flow, with precise labels for state-versus-knowledge boundaries.

## Lab alignment

| Lab | Observed alignment | Main gap | Priority |
| --- | --- | --- | --- |
| Image Encoding | Strong core; partial phase semantics | Sampling phase and slider feedback | P2, verify first |
| Audio Encoding | Strong core; partial terminology | Nyquist/folded frequency and control feedback | P1/P2 |
| Home Network | Strong local/remote routing model | Gateway, return path, and unmodeled DHCP/guest cases | P1 |
| Two's Complement | Strong | Vocabulary and table density | P2 |
| Program Execution | Strong | Historical frame versus final result | P2 |
| Protocol Process | Strong causal model | Accepted/delivered/ACK-observed vocabulary; tick timing | P1 |
| UTF-8 | Strong | Branch thresholds and safe split transfer | P1/P2 |
| Monte Carlo | Strong | Accuracy versus precision terminology | P1/P2 |
| Relational Data | Strong core; partial type-import boundary | Join preservation, NULL, provenance labels | P1/P2 |
| Byte Edit | Strong | Index base, offending byte versus cause, reset semantics | P2 |

## Repeated learner pattern

Learners notice the visible phenomenon first. They reach for Step, Run, presets, or a slider before recording a prediction. Then they trust the page more when an intermediate artifact explains the result: sample grid, aliasing table, route trace, ripple table, event trace, queue, byte grouping, provenance, or validity evidence.

Transfer was strongest where the page exposed a causal chain and a counterexample. Surface confidence alone was not enough; the careful and strong personas were especially valuable for finding ambiguous boundaries.

## Teacher orchestration pattern

Recommended 5–15 minute class rhythm:

1. Hook with one surprising fixture or contradiction.
2. Require a short prediction before Step/Run.
3. Let learners perturb one variable or choose one contrast fixture.
4. Ask for the first causal evidence, not the final score.
5. Name the mechanism only after evidence is visible.
6. Give one unseen transfer case and ask for a teach-back.

Teacher silence target: a learner should reach the core causal explanation without the teacher narrating every click. Current strongest silence performance: Program, UTF-8, Image core, Monte Carlo, and Two's Complement. Current teacher-dependent zones: Audio terminology, Home Network route/return semantics, Protocol timing vocabulary, and Relational join/type boundaries.

## Highest-leverage next implementation phase

Implement a shared prediction-and-evidence layer only after validating the repeated control observations. Minimum scope:

- persistent, visible prediction commitment before first run;
- stable “what changed / what the system knows” evidence labels;
- explicit reset versus fixture/preset semantics;
- teacher-facing prompt and transfer hooks;
- terminology tooltips or compact glossary for the cross-lab vocabulary;
- a small cross-lab interaction test matrix for slider commits, selected historical frame, and inspection buttons.

Do not redesign the domain simulators wholesale. Their causal traces are the strongest asset.

