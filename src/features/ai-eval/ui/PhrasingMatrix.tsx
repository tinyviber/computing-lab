/**
 * PhrasingMatrix — C2's predict-first bench. Step 1: record a per-dim
 * prediction (答案会变吗) and persist it — the server refuses draws until
 * predictions are on file. Step 2: each matrix column (原句 + 5 变体) runs
 * 3 draws; cells show the drawn answers so the sensitive dim is visible.
 */

import { PHRASING_DIMS, type MatrixColumn, type PhrasingDim } from "../domain/probe.ts";
import type { AiEvalQuestionBrief, DrawPayload } from "../domain/protocol.ts";
import { AnswerCard } from "./AnswerCard.tsx";

const COLUMN_LABELS: Record<MatrixColumn, string> = {
  base: "原句",
  ...(Object.fromEntries(PHRASING_DIMS.map((d) => [d.id, d.label])) as Record<PhrasingDim, string>),
};

export function PhrasingMatrix(props: {
  question: AiEvalQuestionBrief;
  predictions: Partial<Record<PhrasingDim, boolean>>;
  onPredict: (dim: PhrasingDim, value: boolean) => void;
  /** Persist predictions; must resolve before draws are enabled. */
  onSavePredictions: () => Promise<boolean>;
  /** Clear saved predictions (only legal before the first draw). */
  onResetPredictions: () => void;
  predictionsLocked: boolean;
  /** Sealed predictions may still be reset — no draws issued yet. */
  predictionsResettable: boolean;
  matrix: Record<string, string[]>;
  drawsById: Record<string, DrawPayload>;
  onRunColumn: (column: MatrixColumn) => void;
  busy: boolean;
}) {
  const {
    question,
    predictions,
    onPredict,
    onSavePredictions,
    onResetPredictions,
    predictionsLocked,
    predictionsResettable,
    matrix,
    drawsById,
    onRunColumn,
    busy,
  } = props;

  const allPredicted = PHRASING_DIMS.every((d) => predictions[d.id] !== undefined);
  const columns: MatrixColumn[] = ["base", ...PHRASING_DIMS.map((d) => d.id)];

  return (
    <section aria-label="问法矩阵" className="ae-panel">
      <p className="eyebrow">第一步 · 先预测</p>
      <p className="ae-hint">
        问题：{question.text}。对每种变体勾一个判断：换一种问法，答案里的硬信息会不会变？
        {predictionsLocked
          ? predictionsResettable
            ? "（预测已保存。想改可以清空重填——一旦开始探测就封存了。）"
            : "（已开始探测——预测已封存，再改判分不认。）"
          : ""}
      </p>
      <div className="ae-pred-row" role="group" aria-label="变体预测">
        {PHRASING_DIMS.map((d) => (
          <span className="ae-pred-item" key={d.id}>
            {d.label}
            <span className="ae-rating">
              <button
                className={predictions[d.id] === true ? "is-active" : ""}
                disabled={predictionsLocked}
                onClick={() => onPredict(d.id, true)}
                type="button"
              >
                会变
              </button>
              <button
                className={predictions[d.id] === false ? "is-active" : ""}
                disabled={predictionsLocked}
                onClick={() => onPredict(d.id, false)}
                type="button"
              >
                不变
              </button>
            </span>
          </span>
        ))}
      </div>
      {!predictionsLocked ? (
        <div className="ae-row">
          <button
            className="button button-primary"
            disabled={!allPredicted || busy}
            onClick={() => void onSavePredictions()}
            type="button"
          >
            保存预测并开始探测
          </button>
          {!allPredicted ? <span className="ae-hint">五种变体都要先表态。</span> : null}
        </div>
      ) : null}
      {predictionsResettable ? (
        <div className="ae-row">
          <button
            className="button button-secondary"
            disabled={busy}
            onClick={onResetPredictions}
            type="button"
          >
            重新填写预测
          </button>
        </div>
      ) : null}

      <p className="eyebrow">第二步 · 跑矩阵</p>
      <table className="ae-matrix">
        <thead>
          <tr>
            <th scope="col">变体</th>
            <th scope="col">探测</th>
            <th scope="col">回答</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => {
            const cells = (matrix[col] ?? []).map((id) => drawsById[id]).filter(Boolean);
            return (
              <tr key={col}>
                <th scope="row">{COLUMN_LABELS[col]}</th>
                <td>
                  <button
                    className="button button-secondary"
                    disabled={!predictionsLocked || busy || cells.length >= 3}
                    onClick={() => onRunColumn(col)}
                    type="button"
                  >
                    {cells.length === 0 ? "连跑 3 次" : `已跑 ${cells.length}/3`}
                  </button>
                </td>
                <td>
                  {cells.map((d) => (
                    <AnswerCard draw={d} key={d.drawId} />
                  ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
