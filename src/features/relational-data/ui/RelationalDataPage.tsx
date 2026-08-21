import { useEffect, useMemo, useReducer, type Dispatch } from "react";
import { useSearch } from "@tanstack/react-router";
import { LabShell } from "../../../shared/lab/LabShell";
import {
  RELATIONAL_QUERY_SEQUENCE,
  getRelationalScenario,
  validateRelational,
  type RelationalFrame,
  type RelationalConstraintId,
  type RelationalQueryId,
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

const QUERY_LABELS: Record<RelationalQueryId, string> = {
  "all-books": "全部图书",
  "available-books": "可借图书",
  "overdue-loans": "逾期借阅",
  "borrower-counts": "按借阅人统计借阅数",
};

const QUERY_EXPLANATIONS: Record<RelationalQueryId, string> = {
  "all-books": "投影 books 的每一行和全部列；没有应用筛选条件。",
  "available-books": "只有 available = true 的行通过筛选；来源记录会标出每本匹配的书。",
  "overdue-loans": "每笔逾期借阅都会与对应的 borrower 和 book 连接；来源记录会列出三类源行。",
  "borrower-counts":
    "在完整连接结果上按 borrower 分组；请结合来源行检查缺失书籍与 NULL 姓名如何影响聚合。",
};

const PROVENANCE_NOTES: Record<string, string> = {
  project: "投影",
  "filter available": "按 available 过滤",
  join: "连接",
  "aggregate over join; stable union of participating loan, borrower, and book rows":
    "连接后聚合；合并参与的 loan、borrower、book 源行",
};

const CONSTRAINT_LABELS: Record<RelationalConstraintId, string> = {
  "unique-books-id": "books.id 唯一",
  "books-year-range": "books.year ≥ 1900",
  "borrowers-name-not-null": "borrowers.name 不是 NULL",
  "loans-borrower-fk": "loans.borrower_id 引用 borrowers.id",
  "loans-book-fk": "loans.book_id 引用 books.id",
};

const CONSTRAINT_PASS_DETAILS: Record<RelationalConstraintId, string> = {
  "unique-books-id": "所有图书 id 都唯一。",
  "books-year-range": "所有图书年份都不早于 1900。",
  "borrowers-name-not-null": '每个借阅人姓名都不是 NULL；"" 仍是存在的文本值。',
  "loans-borrower-fk": "每笔 loan 都引用已有 borrower；NULL 可为空，也不会参与连接。",
  "loans-book-fk": "每笔 loan 都引用已有 book；NULL 可为空，也不会参与连接。",
};

function queryTitle(queryId: RelationalQueryId): string {
  return QUERY_LABELS[queryId];
}

function queryExplanation(result: RelationalQueryResult): string {
  return QUERY_EXPLANATIONS[result.id];
}

function provenanceNote(note: string): string {
  return PROVENANCE_NOTES[note] ?? note;
}

function constraintDetail(constraint: ReturnType<typeof validateRelational>[number]): string {
  if (constraint.passed) return CONSTRAINT_PASS_DETAILS[constraint.id];
  return constraint.detail
    .replace("books.id is missing.", "books.id 缺失。")
    .replace(/book (\S+) has NULL id\./, "图书 $1 的 id 为 NULL。")
    .replace(/duplicate id (\S+)\./, "出现重复 id：$1。")
    .replace(/book (\S+) has year (\S+)\./, "图书 $1 的年份为 $2。")
    .replace(/borrower (\S+) has NULL name\./, "借阅人 $1 的姓名为 NULL。")
    .replace(
      /loan (\S+) references missing borrower (\S+)\./,
      "loan $1 引用了不存在的 borrower $2。",
    )
    .replace(/loan (\S+) references missing book (\S+)\./, "loan $1 引用了不存在的 book $2。");
}

function predictionMessage(message: string | undefined): string | undefined {
  if (!message) return undefined;
  const recorded = message.match(/Prediction recorded: the next query returns (\d+) row/);
  return recorded
    ? `已记录预测：下一条查询将返回 ${recorded[1]} 行。`
    : "请输入 0 到 100 之间的整数行数。";
}

function statusLabel(status: "running" | "complete"): string {
  return status === "complete" ? "已完成" : "进行中";
}

function tableLabel(name: string): string {
  return name === "books"
    ? "图书（books）"
    : name === "borrowers"
      ? "借阅人（borrowers）"
      : "借阅记录（loans）";
}

function formatRelationalValue(value: RelationalValue | undefined): string {
  if (value === null) return "NULL";
  if (value === undefined) return "MISSING";
  if (value === "") return '""';
  return String(value);
}

function ResultTable({ result }: { result: RelationalQueryResult }) {
  return (
    <table className="rd-table">
      <caption>查询结果行</caption>
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
            <td colSpan={result.columns.length}>没有结果行。</td>
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
      <caption>哪些原始记录产生了每条结果</caption>
      <thead>
        <tr>
          <th scope="col">结果行</th>
          <th scope="col">源行</th>
          <th scope="col">操作</th>
        </tr>
      </thead>
      <tbody>
        {result.provenance.length === 0 ? (
          <tr>
            <td colSpan={3}>没有来源记录。</td>
          </tr>
        ) : (
          result.provenance.map((entry) => (
            <tr key={entry.resultRowId}>
              <th scope="row">{entry.resultRowId}</th>
              <td>{entry.sourceIds.join(", ") || "—"}</td>
              <td>{provenanceNote(entry.note)}</td>
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
    <section className="rd-card" aria-label="关系查询过程">
      <div className="rd-card-heading">
        <div>
          <p className="eyebrow">查询过程</p>
          <h3>一步运行一条查询</h3>
        </div>
        <span>{frames.length} 步</span>
      </div>
      {frames.length === 0 ? (
        <p>点击“执行一步”，运行第一条查询。</p>
      ) : (
        <ol className="rd-trace-list">
          {frames.map((frame) => (
            <li key={frame.index}>
              <button
                aria-current={selectedFrameIndex === frame.index ? "true" : undefined}
                aria-label={`查询 ${frame.index + 1}：${queryTitle(frame.queryId)}，${frame.result.rows.length} 行`}
                className={selectedFrameIndex === frame.index ? "is-selected" : ""}
                onClick={() => onSelect(frame.index)}
                type="button"
              >
                <strong>查询 {frame.index + 1}</strong>
                <span>{queryTitle(frame.queryId)}</span>
                <small>
                  {frame.predictedRows !== undefined ? `预测 ${frame.predictedRows} 行 · ` : ""}
                  {frame.result.rows.length} 行
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
      <section className="rd-card" aria-label="当前关系数据结果">
        <p className="eyebrow">当前结果</p>
        <h3>执行一步来运行查询</h3>
        <p>下方显示结果行、来源行和计算列。</p>
      </section>
    );
  }
  const derivedColumns = frame.queryId === "borrower-counts" ? (["loans"] as const) : ([] as const);
  return (
    <section className="rd-card" aria-label="当前关系数据结果">
      <div className="rd-card-heading">
        <div>
          <p className="eyebrow">当前结果</p>
          <h3>{queryTitle(frame.queryId)}</h3>
        </div>
      </div>
      <p>{queryExplanation(frame.result)}</p>
      {frame.predictedRows !== undefined ? (
        <p role="status">
          预测 {frame.predictedRows} 行；实际返回 {frame.result.rows.length} 行。
        </p>
      ) : null}
      {derivedColumns.length > 0 ? (
        <p className="rd-derived-note">
          计算得到的结果：{derivedColumns.join(", ")} 不是表中直接存储的值。
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
    <section className="rd-card" aria-label="关系数据约束">
      <p className="eyebrow">约束</p>
      <h3>数据声明的规则</h3>
      <table className="rd-table">
        <caption>约束检查</caption>
        <thead>
          <tr>
            <th scope="col">约束</th>
            <th scope="col">表</th>
            <th scope="col">结果</th>
            <th scope="col">细节</th>
          </tr>
        </thead>
        <tbody>
          {constraints.map((constraint) => (
            <tr key={constraint.id}>
              <th scope="row">{CONSTRAINT_LABELS[constraint.id]}</th>
              <td>{tableLabel(constraint.table)}</td>
              <td>{constraint.passed ? "通过" : "失败"}</td>
              <td>{constraintDetail(constraint)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="rd-claim">
        约束检查和源行可用于核对查询结果：NULL 表示缺失值，空字符串仍是存在的文本；
        连接与聚合时，外键能否找到对应书籍会影响哪些行进入结果。
      </p>
      <table className="rd-table">
        <caption>借阅人源行：NULL 与空字符串的对照</caption>
        <thead>
          <tr>
            <th scope="col">行</th>
            <th scope="col">id</th>
            <th scope="col">name</th>
            <th scope="col">值的含义</th>
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
                  ? "NULL（缺失）"
                  : row.values.name === ""
                    ? "空字符串（存在）"
                    : "文本值"}
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
          <p className="eyebrow">关系数据</p>
          <h2>查询结果与来源行</h2>
          <p>在三张表上运行查询，查看筛选、连接、聚合和来源行。</p>
        </div>
        <div className="rd-fixture-card" aria-label="关系数据情境">
          <span>情境</span>
          <strong>图书目录</strong>
          <small>
            {scenario.tables.map((table) => `${table.name} (${table.rows.length})`).join(" · ")}
          </small>
        </div>
      </header>

      <div className="rd-layout">
        <aside className="rd-controls" aria-label="关系数据实验控制">
          <section className="rd-card">
            <p className="eyebrow">预测</p>
            <h3>下一条查询的结果行数</h3>
            <label htmlFor="rd-prediction">行数</label>
            <input
              id="rd-prediction"
              min={0}
              onChange={(event) => dispatch({ type: "set-prediction", value: event.target.value })}
              type="number"
              value={lesson.predictionDraft}
            />
            <p id="rd-prediction-help">可先记录预测，再执行查询。</p>
            <button
              className="rd-secondary-button"
              onClick={() => dispatch({ type: "record-prediction" })}
              type="button"
            >
              记录预测
            </button>
            {lesson.predictionMessage ? (
              <p role="status">{predictionMessage(lesson.predictionMessage)}</p>
            ) : null}
          </section>

          <section className="rd-card">
            <p className="eyebrow">情境</p>
            <h3>目录情境</h3>
            <label htmlFor="rd-scenario">关系数据情境</label>
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
              <option value="catalog">图书目录</option>
            </select>
            <p>参考日期：2026-01-15。</p>
          </section>

          <section className="rd-card">
            <p className="eyebrow">推进</p>
            <h3>运行查询</h3>
            {nextQueryId ? <p className="rd-next">下一条：{queryTitle(nextQueryId)}。</p> : null}
            <div className="rd-action-row">
              <button
                className="rd-primary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "step" })}
                type="button"
              >
                执行一步
              </button>
              <button
                className="rd-secondary-button"
                disabled={lesson.machine.status === "complete"}
                onClick={() => dispatch({ type: "run-all" })}
                type="button"
              >
                运行到结束
              </button>
            </div>
            <button
              className="rd-reset-button"
              onClick={() => dispatch({ type: "reset" })}
              type="button"
            >
              恢复进入页面时的初始状态
            </button>
          </section>
        </aside>

        <div className="rd-main-column">
          <section className="rd-card rd-status-card" aria-label="关系查询状态">
            <div>
              <p className="eyebrow">当前查询</p>
              <strong>{statusLabel(lesson.machine.status)}</strong>
            </div>
            <dl>
              <div>
                <dt>已运行查询</dt>
                <dd>{lesson.machine.results.length}</dd>
              </div>
              <div>
                <dt>查询总数</dt>
                <dd>{RELATIONAL_QUERY_SEQUENCE.length}</dd>
              </div>
              <div>
                <dt>结果行总数</dt>
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
          {lesson.frames.length > 0 ? <ConstraintsPanel scenario={scenario} /> : null}
          <section className="rd-card" aria-label="预测与实际对照">
            <p className="eyebrow">对照</p>
            <h3>预测行数与实际行数</h3>
            <table className="rd-table">
              <caption>预测对照</caption>
              <thead>
                <tr>
                  <th scope="col">查询</th>
                  <th scope="col">预测</th>
                  <th scope="col">实际</th>
                </tr>
              </thead>
              <tbody>
                {lesson.frames.length === 0 ? (
                  <tr>
                    <td colSpan={3}>运行查询后即可对照预测。</td>
                  </tr>
                ) : (
                  lesson.frames.map((frame) => (
                    <tr key={frame.index}>
                      <th scope="row">{queryTitle(frame.queryId)}</th>
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
    <LabShell
      eyebrow="关系数据"
      title="关系数据"
      subtitle="表如何回答查询（tables answer queries）"
    >
      <RelationalContent dispatch={dispatch} lesson={lesson} />
    </LabShell>
  );
}
