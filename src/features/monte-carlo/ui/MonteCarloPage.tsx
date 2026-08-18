import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  MONTE_CARLO_SCENARIOS,
  monteCarloComparison,
  type MonteCarloFrame,
  type MonteCarloScenarioId,
} from "../domain";
import { parseMonteCarloScenario } from "../lesson/scenario";
import {
  createMonteCarloLessonState,
  transitionMonteCarloLesson,
  type MonteCarloLessonState,
} from "../lesson/state";
import "./monte-carlo.css";

const scenarioOptions: readonly {
  value: MonteCarloScenarioId;
  label: string;
  description: string;
}[] = [
  {
    value: "medium",
    label: "Medium sample",
    description: "Seed 2024, 10,000 samples, 40 batches.",
  },
  { value: "small", label: "Small sample", description: "Seed 42, 1,000 samples, 4 batches." },
  {
    value: "large",
    label: "Large sample",
    description: "Seed 271828, 100,000 samples, 400 batches.",
  },
  {
    value: "same-n-different-seed",
    label: "Same count, different seed",
    description: "Seed 11, 10,000 samples: same count as Medium, different trajectory.",
  },
];

const estimateText = (value: number) => value.toFixed(4);
const errorText = (value: number) => value.toFixed(4);

function ConvergenceTable({ frames }: { frames: readonly MonteCarloFrame[] }) {
  return (
    <table className="mc-table">
      <caption>Convergence by batch</caption>
      <thead>
        <tr>
          <th scope="col">Batch</th>
          <th scope="col">Samples</th>
          <th scope="col">Inside</th>
          <th scope="col">Estimate</th>
          <th scope="col">|Estimate − π|</th>
        </tr>
      </thead>
      <tbody>
        {frames.length === 0 ? (
          <tr>
            <td colSpan={5}>No batches yet.</td>
          </tr>
        ) : (
          frames.map((frame) => (
            <tr key={frame.batch}>
              <th scope="row">{frame.batch}</th>
              <td>{frame.sampleCount}</td>
              <td>{frame.insideCount}</td>
              <td>{estimateText(frame.estimate)}</td>
              <td>{errorText(frame.error)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function FrameTrace({
  frames,
  selectedFrameIndex,
  onSelect,
}: {
  frames: readonly MonteCarloFrame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="mc-card" aria-label="Monte Carlo batch trace">
      <div className="mc-card-heading">
        <div>
          <p className="eyebrow">BATCH TRACE</p>
          <h3>One batch per frame</h3>
        </div>
        <span>{frames.length} frames</span>
      </div>
      {frames.length === 0 ? (
        <p>Press Step to draw the first 250 random points.</p>
      ) : (
        <ol className="mc-trace-list">
          {frames.map((frame) => (
            <li key={frame.batch}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`Batch ${frame.batch}, ${frame.sampleCount} samples, ${frame.insideCount} inside, estimate ${estimateText(frame.estimate)}`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <strong>Batch {frame.batch}</strong>
                <span>
                  {frame.sampleCount} samples · {frame.insideCount} inside
                </span>
                <small>π ≈ {estimateText(frame.estimate)}</small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SelectedEvidence({ frame }: { frame?: MonteCarloFrame }) {
  if (!frame) {
    return (
      <section className="mc-card" aria-label="Selected Monte Carlo evidence">
        <p className="eyebrow">SELECTED EVIDENCE</p>
        <h3>Step once to inspect a batch</h3>
        <p>The selected batch will show cumulative samples, inside count, estimate, and error.</p>
      </section>
    );
  }
  return (
    <section className="mc-card" aria-label="Selected Monte Carlo evidence">
      <div className="mc-card-heading">
        <div>
          <p className="eyebrow">SELECTED EVIDENCE</p>
          <h3>
            Batch {frame.batch} of {frame.after.samplesDrawn} samples
          </h3>
        </div>
        <span>4 × inside ÷ samples</span>
      </div>
      <dl className="mc-facts">
        <div>
          <dt>Samples before batch</dt>
          <dd>{frame.before.samplesDrawn}</dd>
        </div>
        <div>
          <dt>Samples after batch</dt>
          <dd>{frame.sampleCount}</dd>
        </div>
        <div>
          <dt>Inside count before batch</dt>
          <dd>{frame.before.inside}</dd>
        </div>
        <div>
          <dt>Inside count after batch</dt>
          <dd>{frame.insideCount}</dd>
        </div>
        <div>
          <dt>Running estimate</dt>
          <dd>{estimateText(frame.estimate)}</dd>
        </div>
        <div>
          <dt>Running error</dt>
          <dd>{errorText(frame.error)}</dd>
        </div>
      </dl>
    </section>
  );
}

function MonteCarloContent({
  lesson,
  dispatch,
}: {
  lesson: MonteCarloLessonState;
  dispatch: Dispatch<Parameters<typeof transitionMonteCarloLesson>[1]>;
}) {
  const selectedFrame = lesson.frames.find((frame) => frame.index === lesson.selectedFrameIndex);
  const option = scenarioOptions.find((candidate) => candidate.value === lesson.scenario)!;
  const fixture = MONTE_CARLO_SCENARIOS[lesson.scenario];
  const comparison = useMemo(() => monteCarloComparison(Object.values(MONTE_CARLO_SCENARIOS)), []);
  const finalEstimate =
    lesson.machine.status === "complete"
      ? (4 * lesson.machine.inside) / lesson.machine.samplesDrawn
      : undefined;

  return (
    <div className="mc-page">
      <header className="mc-hero">
        <div>
          <p className="eyebrow">MONTE CARLO · RANDOM SAMPLES</p>
          <h2>How many random points does it take to find π?</h2>
          <p>
            Draw points in a unit square, count how many land inside the quarter circle, and watch
            the estimate converge.
          </p>
        </div>
        <div className="mc-fixture-card" aria-label="Monte Carlo fixture">
          <span>FIXTURE</span>
          <strong>{option.label}</strong>
          <small>
            seed {fixture.seed} · {fixture.samples.toLocaleString("en-US")} samples ·{" "}
            {fixture.samples / fixture.batchSize} batches of {fixture.batchSize}
          </small>
        </div>
      </header>

      <div className="mc-layout">
        <aside className="mc-controls" aria-label="Monte Carlo experiment controls">
          <section className="mc-card">
            <p className="eyebrow">PREDICT</p>
            <h3>Where will the estimate land?</h3>
            <label htmlFor="mc-prediction">Final estimate relative to π</label>
            <select
              id="mc-prediction"
              onChange={(event) => dispatch({ type: "set-prediction", value: event.target.value })}
              value={lesson.predictionDraft}
            >
              <option value="">Choose one</option>
              <option value="above">Above π</option>
              <option value="below">Below π</option>
            </select>
            <p id="mc-prediction-help">Prediction is optional and never blocks Step or Run.</p>
            <button
              className="mc-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              Record prediction
            </button>
            {lesson.predictionMessage ? <p role="status">{lesson.predictionMessage}</p> : null}
          </section>

          <section className="mc-card">
            <p className="eyebrow">FIXTURE</p>
            <h3>Choose sample size</h3>
            <label htmlFor="mc-scenario">Monte Carlo fixture</label>
            <select
              id="mc-scenario"
              onChange={(event) =>
                dispatch({
                  type: "set-scenario",
                  scenario: event.target.value as MonteCarloScenarioId,
                })
              }
              value={lesson.scenario}
            >
              {scenarioOptions.map((candidate) => (
                <option key={candidate.value} value={candidate.value}>
                  {candidate.label}
                </option>
              ))}
            </select>
            <p>{option.description}</p>
          </section>

          <section className="mc-card">
            <p className="eyebrow">INTERVENE</p>
            <h3>Advance the sampling</h3>
            <div className="mc-action-row">
              <button
                className="mc-primary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "step" })}
                type="button"
              >
                Step
              </button>
              <button
                className="mc-secondary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "run-all" })}
                type="button"
              >
                Run to end
              </button>
            </div>
            <button
              className="mc-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              Reset to URL scenario
            </button>
          </section>
        </aside>

        <div className="mc-main-column">
          <section className="mc-card mc-status-card" aria-label="Monte Carlo sampling status">
            <div>
              <p className="eyebrow">CURRENT SAMPLING</p>
              <strong>{lesson.machine.status}</strong>
            </div>
            <dl>
              <div>
                <dt>Samples drawn</dt>
                <dd>{lesson.machine.samplesDrawn}</dd>
              </div>
              <div>
                <dt>Inside quarter circle</dt>
                <dd>{lesson.machine.inside}</dd>
              </div>
              <div>
                <dt>Running estimate</dt>
                <dd>
                  {lesson.machine.samplesDrawn > 0
                    ? estimateText((4 * lesson.machine.inside) / lesson.machine.samplesDrawn)
                    : "—"}
                </dd>
              </div>
            </dl>
          </section>
          <FrameTrace
            frames={lesson.frames}
            onSelect={(index) => dispatch({ type: "select-frame", index })}
            selectedFrameIndex={lesson.selectedFrameIndex}
          />
          <SelectedEvidence frame={selectedFrame} />
          <section className="mc-card" aria-label="Convergence table">
            <p className="eyebrow">CONVERGENCE</p>
            <h3>Estimate by batch</h3>
            <div className="mc-table-scroll">
              <ConvergenceTable frames={lesson.frames} />
            </div>
          </section>
          <section className="mc-card mc-final-card" aria-label="Final Monte Carlo result">
            <p className="eyebrow">FINAL MONTE CARLO RESULT</p>
            <h3>Estimate for this fixture</h3>
            {finalEstimate === undefined ? (
              <p>Run the fixture to completion to compare its final estimate.</p>
            ) : (
              <>
                <output aria-label="Final Monte Carlo estimate">
                  4 × {lesson.machine.inside} ÷ {lesson.machine.samplesDrawn} ≈{" "}
                  {estimateText(finalEstimate)}
                </output>
                <p>
                  Final error {errorText(Math.abs(finalEstimate - Math.PI))} against π ={" "}
                  {Math.PI.toFixed(4)}.
                </p>
                {lesson.prediction ? (
                  <p role="status">
                    Prediction: finishes {lesson.prediction} π; observed estimate{" "}
                    {estimateText(finalEstimate)} ({finalEstimate > Math.PI ? "above" : "below"} π).
                  </p>
                ) : null}
              </>
            )}
          </section>
          <section className="mc-card" aria-label="Monte Carlo comparison">
            <p className="eyebrow">COMPARE</p>
            <h3>Same count, different seed; more samples, smaller error</h3>
            <div className="mc-table-scroll">
              <table className="mc-table">
                <caption>Fixture comparison</caption>
                <thead>
                  <tr>
                    <th scope="col">Fixture</th>
                    <th scope="col">Seed</th>
                    <th scope="col">Samples</th>
                    <th scope="col">Final estimate</th>
                    <th scope="col">Final error</th>
                  </tr>
                </thead>
                <tbody>
                  {comparison.map((row) => (
                    <tr key={row.id}>
                      <th scope="row">{row.title}</th>
                      <td>{row.seed}</td>
                      <td>{row.samples.toLocaleString("en-US")}</td>
                      <td>{estimateText(row.estimate)}</td>
                      <td>{errorText(row.error)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mc-claim">
              Observed final error shrinks with more samples for these fixtures; the batch table
              shows the per-batch wobble, and the same-count pair shows the seed-dependent
              trajectory.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

export function MonteCarloPage() {
  const search = useSearch({ from: "/labs/monte-carlo" }) as Record<string, unknown>;
  const scenario = useMemo(() => parseMonteCarloScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionMonteCarloLesson,
    scenario,
    createMonteCarloLessonState,
  );

  useEffect(() => {
    dispatch({ type: "sync-url-scenario", scenario: scenario.scenario });
  }, [scenario.scenario]);

  return (
    <LabShell eyebrow="Monte Carlo" title="Monte Carlo π" subtitle="random points converge">
      <MonteCarloContent dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
