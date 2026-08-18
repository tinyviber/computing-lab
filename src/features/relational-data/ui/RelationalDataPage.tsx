import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  RELATIONAL_QUERY_SEQUENCE,
  getRelationalScenario,
  validateRelational,
  type RelationalFrame,
  type RelationalQueryResult,
  type RelationalValue,
} from "../domain";
import { parseRelationalScenario } from "../lesson/scenario";
import {
  createRelationalLessonState,
  transitionRelationalLesson,
  type RelationalLessonState,
} from "../lesson/state";
import "./relational-data.css";

function formatRelationalValue(value: RelationalValue | undefined): string {
  if (value === null) return "NULL";
  if (value === undefined) return "MISSING";
  if (value === "") return '""';
  return String(value);
}

function ResultTable({ result }: { result: RelationalQueryResult }) {
  return (
    <table className="rd-table">
      <caption>Query result rows</caption>
      <thead>
        <tr>
          {result.columns.map((column) => (
            <th key={column} scope="col">
              {column}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {result.rows.length === 0 ? (
          <tr>
            <td colSpan={result.columns.length}>No rows.</td>
          </tr>
        ) : (
          result.rows.map((row) => (
            <tr key={row.id}>
              {result.columns.map((column) => (
                <td key={column}>{formatRelationalValue(row.values[column])}</td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function ProvenanceTable({ result }: { result: RelationalQueryResult }) {
  return (
    <table className="rd-table">
      <caption>Provenance: which source rows produced each result</caption>
      <thead>
        <tr>
          <th scope="col">Result row</th>
          <th scope="col">Source rows</th>
          <th scope="col">Operation</th>
        </tr>
      </thead>
      <tbody>
        {result.provenance.length === 0 ? (
          <tr>
            <td colSpan={3}>No provenance.</td>
          </tr>
        ) : (
          result.provenance.map((entry) => (
            <tr key={entry.resultRowId}>
              <th scope="row">{entry.resultRowId}</th>
              <td>{entry.sourceIds.join(", ") || "—"}</td>
              <td>{entry.note}</td>
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
  frames: readonly RelationalFrame[];
  selectedFrameIndex?: number;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="rd-card" aria-label="Relational query trace">
      <div className="rd-card-heading">
        <div>
          <p className="eyebrow">QUERY TRACE</p>
          <h3>One query per frame</h3>
        </div>
        <span>{frames.length} frames</span>
      </div>
      {frames.length === 0 ? (
        <p>Press Step to run the first query over the fixed catalog.</p>
      ) : (
        <ol className="rd-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`Query ${frame.index + 1}, ${frame.result.title}, ${frame.result.rows.length} rows`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <strong>Query {frame.index + 1}</strong>
                <span>{frame.result.title}</span>
                <small>
                  {frame.predictedRows !== undefined ? `predicted ${frame.predictedRows} · ` : ""}
                  {frame.result.rows.length} row{frame.result.rows.length === 1 ? "" : "s"}
                </small>
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function SelectedEvidence({ frame }: { frame?: RelationalFrame }) {
  if (!frame) {
    return (
      <section className="rd-card" aria-label="Selected relational evidence">
        <p className="eyebrow">SELECTED EVIDENCE</p>
        <h3>Step once to run a query</h3>
        <p>The selected query will show its result rows, provenance, and derived cells.</p>
      </section>
    );
  }
  const derivedColumns = frame.queryId === "borrower-counts" ? (["loans"] as const) : ([] as const);
  return (
    <section className="rd-card" aria-label="Selected relational evidence">
      <div className="rd-card-heading">
        <div>
          <p className="eyebrow">SELECTED EVIDENCE</p>
          <h3>{frame.result.title}</h3>
        </div>
        <span className="rd-mono">{frame.result.description}</span>
      </div>
      <p>{frame.result.explanation}</p>
      {frame.predictedRows !== undefined ? (
        <p role="status">
          Predicted {frame.predictedRows} row{frame.predictedRows === 1 ? "" : "s"}; observed{" "}
          {frame.result.rows.length}.
        </p>
      ) : null}
      {derivedColumns.length > 0 ? (
        <p className="rd-derived-note">
          Derived cells: {derivedColumns.join(", ")} is computed, not stored.
        </p>
      ) : null}
      <ResultTable result={frame.result} />
      <ProvenanceTable result={frame.result} />
    </section>
  );
}

function ConstraintsPanel({ scenario }: { scenario: ReturnType<typeof getRelationalScenario> }) {
  const constraints = useMemo(() => validateRelational(scenario), [scenario]);
  const borrowers = scenario.tables.find((table) => table.name === "borrowers")!;
  return (
    <section className="rd-card" aria-label="Relational constraints">
      <p className="eyebrow">CONSTRAINTS</p>
      <h3>What the data promises</h3>
      <table className="rd-table">
        <caption>Constraint checks over the catalog</caption>
        <thead>
          <tr>
            <th scope="col">Constraint</th>
            <th scope="col">Table</th>
            <th scope="col">Result</th>
            <th scope="col">Detail</th>
          </tr>
        </thead>
        <tbody>
          {constraints.map((constraint) => (
            <tr key={constraint.id}>
              <th scope="row">{constraint.description}</th>
              <td>{constraint.table}</td>
              <td>{constraint.passed ? "pass" : "FAIL"}</td>
              <td>{constraint.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rd-claim">
        NULL means absent value; an empty string is present text. `borrowers.name IS NOT NULL`
        rejects only NULL, while the broken loan (book 99) fails its foreign-key check and
        disappears from the joined aggregate.
      </p>
      <table className="rd-table">
        <caption>Borrower source rows: NULL versus empty string</caption>
        <thead>
          <tr>
            <th scope="col">Row</th>
            <th scope="col">id</th>
            <th scope="col">name</th>
            <th scope="col">Value meaning</th>
          </tr>
        </thead>
        <tbody>
          {borrowers.rows.map((row) => (
            <tr key={row.id}>
              <th scope="row">{row.id}</th>
              <td>{formatRelationalValue(row.values.id)}</td>
              <td>{formatRelationalValue(row.values.name)}</td>
              <td>
                {row.values.name === null
                  ? "NULL (absent)"
                  : row.values.name === ""
                    ? "empty string (present)"
                    : "text value"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function RelationalContent({
  lesson,
  dispatch,
}: {
  lesson: RelationalLessonState;
  dispatch: Dispatch<Parameters<typeof transitionRelationalLesson>[1]>;
}) {
  const selectedFrame = lesson.frames.find((frame) => frame.index === lesson.selectedFrameIndex);
  const scenario = getRelationalScenario(lesson.scenario);
  const nextQueryId = RELATIONAL_QUERY_SEQUENCE[lesson.machine.nextQueryIndex];

  return (
    <div className="rd-page">
      <header className="rd-hero">
        <div>
          <p className="eyebrow">RELATIONAL DATA · FIXED CATALOG</p>
          <h2>How does a fixed set of rows answer a query?</h2>
          <p>
            Run four fixed queries over books, borrowers, and loans; inspect result rows,
            provenance, derived counts, and the one broken foreign key.
          </p>
        </div>
        <div className="rd-fixture-card" aria-label="Relational fixture">
          <span>FIXTURE</span>
          <strong>{scenario.title}</strong>
          <small>
            {scenario.tables.map((table) => `${table.name} (${table.rows.length})`).join(" · ")}
          </small>
        </div>
      </header>

      <div className="rd-layout">
        <aside className="rd-controls" aria-label="Relational experiment controls">
          <section className="rd-card">
            <p className="eyebrow">PREDICT</p>
            <h3>How many rows will the next query return?</h3>
            <label htmlFor="rd-prediction">Row count</label>
            <input
              id="rd-prediction"
              min={0}
              onChange={(event) => dispatch({ type: "set-prediction", value: event.target.value })}
              type="number"
              value={lesson.predictionDraft}
            />
            <p id="rd-prediction-help">Prediction is optional and never blocks Step or Run.</p>
            <button
              className="rd-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              Record prediction
            </button>
            {lesson.predictionMessage ? <p role="status">{lesson.predictionMessage}</p> : null}
          </section>

          <section className="rd-card">
            <p className="eyebrow">FIXTURE</p>
            <h3>Catalog fixture</h3>
            <label htmlFor="rd-scenario">Relational fixture</label>
            <select
              id="rd-scenario"
              onChange={(event) =>
                dispatch({
                  type: "set-scenario",
                  scenario: event.target.value as "catalog",
                })
              }
              value={lesson.scenario}
            >
              <option value="catalog">Library catalog</option>
            </select>
            <p>One fixed scenario with a reference date of 2026-01-15.</p>
          </section>

          <section className="rd-card">
            <p className="eyebrow">INTERVENE</p>
            <h3>Advance the queries</h3>
            {nextQueryId ? (
              <p className="rd-next">Next: {nextQueryId.replace(/-/g, " ")}.</p>
            ) : null}
            <div className="rd-action-row">
              <button
                className="rd-primary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "step" })}
                type="button"
              >
                Step
              </button>
              <button
                className="rd-secondary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "run-all" })}
                type="button"
              >
                Run to end
              </button>
            </div>
            <button
              className="rd-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              Reset to URL scenario
            </button>
          </section>
        </aside>

        <div className="rd-main-column">
          <section className="rd-card rd-status-card" aria-label="Relational query status">
            <div>
              <p className="eyebrow">CURRENT QUERIES</p>
              <strong>{lesson.machine.status}</strong>
            </div>
            <dl>
              <div>
                <dt>Queries run</dt>
                <dd>{lesson.machine.results.length}</dd>
              </div>
              <div>
                <dt>Queries total</dt>
                <dd>{RELATIONAL_QUERY_SEQUENCE.length}</dd>
              </div>
              <div>
                <dt>Total result rows</dt>
                <dd>
                  {lesson.machine.results.reduce((total, result) => total + result.rows.length, 0)}
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
          <ConstraintsPanel scenario={scenario} />
          <section className="rd-card" aria-label="Predicted versus actual">
            <p className="eyebrow">COMPARE</p>
            <h3>Predicted vs actual row counts</h3>
            <table className="rd-table">
              <caption>Prediction comparison</caption>
              <thead>
                <tr>
                  <th scope="col">Query</th>
                  <th scope="col">Predicted</th>
                  <th scope="col">Actual</th>
                </tr>
              </thead>
              <tbody>
                {lesson.frames.length === 0 ? (
                  <tr>
                    <td colSpan={3}>Run the queries to compare predictions.</td>
                  </tr>
                ) : (
                  lesson.frames.map((frame) => (
                    <tr key={frame.index}>
                      <th scope="row">{frame.result.title}</th>
                      <td>{frame.predictedRows ?? "—"}</td>
                      <td>{frame.result.rows.length}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>
        </div>
      </div>
    </div>
  );
}

export function RelationalDataPage() {
  const search = useSearch({ from: "/labs/relational-data" }) as Record<string, unknown>;
  const scenario = useMemo(() => parseRelationalScenario(search), [search]);
  const [lesson, dispatch] = useReducer(
    transitionRelationalLesson,
    scenario,
    createRelationalLessonState,
  );

  useEffect(() => {
    dispatch({ type: "sync-url-scenario", scenario: scenario.scenario });
  }, [scenario.scenario]);

  return (
    <LabShell eyebrow="Relational Data" title="关系数据" subtitle="tables answer queries">
      <RelationalContent dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
