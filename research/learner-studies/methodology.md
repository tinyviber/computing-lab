# Learner-study methodology

Date: 2026-08-19  
Scope: all 10 rendered labs in `tinyviber/computing-lab`.  
Mode: simulated-user research on the running local app at `127.0.0.1:5173`.

## Roles and blind protocol

Each study used four learner personas:

| Persona | Constraint |
| --- | --- |
| Curious average learner | Will explore, but has no assumed specialist vocabulary. |
| Impatient explorer | Wants the shortest path to a visible answer; skips prose when possible. |
| Careful low-prior learner | Hesitates, records evidence, and asks what each control changes. |
| Strong computing learner | Tests edge cases and looks for counterexamples, not only the happy path. |

Blind instruction: use the real rendered page; do not read source, curriculum docs, or research notes first; record first impression, action order, attention, surprises, hypothesis change, teach-back, confusion, self-scores, and transfer commitments. Transfer questions were frozen before the learner passes.

## Transfer assessment

The frozen assessment set appears in each lab report. It tests a new case, not recall of the default fixture. Expected answers are included after the observed commitments so observed understanding can be compared with the intended model.

## Evidence boundary

Eight labs had independent subagent learner passes: Image Encoding, Audio Encoding, Home Network, Two's Complement, Program Execution, Monte Carlo, Relational Data, and Byte Edit. Protocol Process and UTF-8 hit the available subagent-thread limit. They therefore received fresh-browser simulated-persona passes by the primary researcher. Those two reports are useful rendered-page evidence, but have lower independence and must not be treated as equivalent to the blinded subagent set.

The primary researcher then inspected the curriculum/domain source only after learner evidence was frozen. “Observed” means directly seen or said during the pass. “Interpretation” means a research inference. Repeated control failures are marked as observations, but may still be browser-agent interaction issues and require reproduction before a P0/P1 implementation decision.

## Analysis rules

- Separate receiver/system state from what a learner can know.
- Separate a page-level success score from transfer performance.
- Mark an objective as **aligned** only when the learner can teach back the causal mechanism and solve transfer, not merely quote the visible result.
- Mark a gap as **partial** when the page supports the core phenomenon but a term, boundary, or control state remains opaque.
- Recommendations use P0 (blocks valid learning), P1 (blocks a common teacher/learner path), P2 (discoverability/evidence friction), and P3 (polish).

