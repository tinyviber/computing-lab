/**
 * AI intake panel, shared by stage 2 (智能接单, practice orders) and
 * stage 4 (晚餐高峰, hidden orders plus the carried-over priority
 * function). The vendored BGE model runs in the browser and proposes a
 * ticket per order, reporting a similarity and a margin. The student's
 * need_confirm(similarity, margin) — evaluated in the shared Pyodide
 * worker — decides which orders the simulated customer restates.
 * Confirmed orders always record right but stall intake one tick;
 * unconfirmed ones keep the AI's ticket. The submission is normalized
 * rows only — no model, no vectors.
 *
 * Predictions are cached per order set: re-running after an edit to
 * need_confirm only re-evaluates the Python function, not the model —
 * the classroom feedback loop stays near-instant.
 */

import { useEffect, useRef, useState } from "react";
import { AI_CONFIRM_BUDGET, AI_PASS_CORRECT, AI_SERVED_MIN } from "../domain/stages.ts";
import {
  predictTicket,
  textsToEmbed,
  type TicketPrediction,
  type Vector,
} from "../domain/aiIntake.ts";
import type {
  AiDraft,
  AiIntakeDraft,
  AiIntakeOrderResult,
  AiOrderResult,
  LunchTestSummary,
} from "../domain/protocol.ts";
import { checkPriorityTable } from "../domain/priority.ts";
import { describeFullWidthPunctuation, friendlyRunError } from "../domain/runErrors.ts";
import { CodeEditor } from "./CodeEditor.tsx";
import { QUEUE_STARTER } from "./QueuePanel.tsx";
import { embedTexts, loadEmbedder, type EmbedInfo, type EmbedProgress } from "./embedRunner.ts";
import { runNeedConfirm, runPriorityTable } from "./pyodideRunner.ts";

export const NEED_CONFIRM_STARTER = `def need_confirm(similarity, margin):
    if similarity < 0.85:
        return True
    if margin < 0.10:
        return True
    return False
`;

type PreviewRow = {
  id: string;
  request: string;
  prediction: TicketPrediction;
  confirmed: boolean;
};

function ticketText(prediction: TicketPrediction): string {
  const t = prediction.ticket;
  return `${t.item || "?"} · 「${t.note}」 · ${t.table || "?"}号桌 · ${t.urgent ? "加急" : "普通"}`;
}

/** The field dragging the order's confidence down — the one worth a second look. */
function weakestField(prediction: TicketPrediction): string {
  const fields: [string, number][] = [
    ["菜品", prediction.item.margin],
    ["备注", prediction.note.margin],
    ["桌号", prediction.table.margin],
    ["时效", prediction.urgent.margin],
  ];
  fields.sort((a, b) => a[1] - b[1]);
  return fields[0][0];
}

function fmt(score: number): string {
  return score.toFixed(3);
}

export function AiIntakePanel<D extends AiIntakeDraft>({
  variant,
  draft,
  orders,
  submitting,
  result,
  onChange,
  onSubmit,
}: {
  /** "practice" = stage 2 (public orders, intake only); "final" = stage 4. */
  variant: "practice" | "final";
  draft: D;
  orders: { id: string; request: string }[];
  submitting: boolean;
  result: LunchTestSummary | null;
  onChange: (draft: D) => void;
  onSubmit: () => void;
}) {
  const isFinal = variant === "final";
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modelInfo, setModelInfo] = useState<EmbedInfo | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [progress, setProgress] = useState<EmbedProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [runNote, setRunNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  // Model predictions keyed by the order set — an edit to need_confirm
  // or priority does not re-embed 300+ texts, so a rerun is Python-fast.
  const predictionCache = useRef<{
    key: string;
    predictions: TicketPrediction[];
  } | null>(null);

  const confirmSource = draft.confirmCode.trim() ? draft.confirmCode : NEED_CONFIRM_STARTER;
  const finalDraft = draft as unknown as AiDraft;
  const queueSource = isFinal
    ? finalDraft.queueCode?.trim()
      ? finalDraft.queueCode
      : QUEUE_STARTER
    : "";
  const ready = isFinal
    ? draft.results !== null && finalDraft.priority !== null
    : draft.results !== null;

  const intakeResult = !isFinal && result?.kind === "ai-intake" ? result : null;
  const finalResult = isFinal && result?.kind === "final" ? result : null;

  // Start the model download as soon as the stage opens — it's vendored
  // locally and warm by the time the student finishes reading the task.
  useEffect(() => {
    let cancelled = false;
    loadEmbedder(setProgress).then(
      (info) => {
        if (cancelled) return;
        setModelInfo(info);
        setModelStatus("ready");
      },
      (loadError: unknown) => {
        if (cancelled) return;
        setModelError(loadError instanceof Error ? loadError.message : String(loadError));
        setModelStatus("error");
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const predict = async (): Promise<{ predictions: TicketPrediction[]; cached: boolean }> => {
    const key = orders.map((order) => `${order.id}${order.request}`).join("");
    if (predictionCache.current?.key === key) {
      return { predictions: predictionCache.current.predictions, cached: true };
    }
    const texts = textsToEmbed(orders.map((order) => order.request));
    const { vectors } = await embedTexts(texts);
    const embedOf = (text: string): Vector => vectors[texts.indexOf(text)];
    const predictions = orders.map((order) => predictTicket(order.request, embedOf));
    predictionCache.current = { key, predictions };
    return { predictions, cached: false };
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setRunNote(null);
    try {
      const punct =
        describeFullWidthPunctuation(confirmSource) ??
        (isFinal ? describeFullWidthPunctuation(queueSource) : null);
      if (punct) throw new Error(punct);
      const { predictions, cached } = await predict();
      const cases: [number, number][] = predictions.map((prediction) => [
        Math.round(prediction.similarity * 10000) / 10000,
        Math.round(prediction.margin * 10000) / 10000,
      ]);
      const rawConfirms = await runNeedConfirm(confirmSource, cases);
      const confirms = Array.isArray(rawConfirms) ? rawConfirms : [];
      if (
        confirms.length !== orders.length ||
        confirms.some((value) => typeof value !== "boolean")
      ) {
        throw new Error("need_confirm 要对每张订单返回 True 或 False。");
      }
      const rows = orders.map((order, index) => ({
        id: order.id,
        request: order.request,
        prediction: predictions[index],
        confirmed: confirms[index],
      }));
      setPreview(rows);
      const results = rows.map((row) => ({
        id: row.id,
        ticket: row.prediction.ticket,
        confirmed: row.confirmed,
      }));
      if (isFinal) {
        const priority = checkPriorityTable(await runPriorityTable(queueSource));
        if (priority.errors.length > 0 || priority.table === null) {
          throw new Error(priority.errors[0] ?? "priority 结果表不合法");
        }
        onChange({
          ...draft,
          confirmCode: confirmSource,
          queueCode: queueSource,
          priority: priority.table,
          results,
        } as D);
      } else {
        onChange({ ...draft, confirmCode: confirmSource, results });
      }
      setRunNote(cached ? "只用了缓存的预测，很快吧。" : null);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  const passText = isFinal
    ? `${AI_PASS_CORRECT} 张小票全对、确认 ≤${AI_CONFIRM_BUDGET} 次、记对且准时 ≥${AI_SERVED_MIN} 张过关`
    : `${AI_PASS_CORRECT} 张小票全对、确认 ≤${AI_CONFIRM_BUDGET} 次过关`;

  return (
    <section className="lunch-challenge">
      <p>
        AI 接单模型就在浏览器里跑，不上服务器。它给每张订单记一张小票，并报告{" "}
        <code>similarity</code>（最有把握的候选有多像）和 <code>margin</code>
        （第一名领先第二名多少）。你的 need_confirm 决定哪几单让顾客再确认一遍，确认必对，但接单台停
        1 拍。{passText}。
      </p>

      <p className="lunch-note" role="status">
        模型 <code>bge-small-zh-v1.5</code>：
        {modelStatus === "loading"
          ? "加载中…"
          : modelStatus === "ready"
            ? `已就绪（${modelInfo?.device === "webgpu" ? "WebGPU" : "WASM"}）`
            : "加载失败"}
        {modelStatus === "loading" && progress
          ? ` · 下载 ${Math.round(progress.loaded / 1024 / 1024)}/${Math.round(progress.total / 1024 / 1024)} MB`
          : null}
      </p>
      {modelError ? (
        <p className="test-error" role="alert">
          {modelError}
        </p>
      ) : null}

      <p className="eyebrow">决定要不要确认的函数</p>
      <CodeEditor
        ariaLabel="need_confirm 函数代码"
        disabled={running}
        onChange={(confirmCode) => onChange({ ...draft, confirmCode, results: null })}
        value={confirmSource}
      />

      {isFinal ? (
        <>
          <p className="eyebrow">排队的函数（沿用第三关，照样跑正式订单）</p>
          <CodeEditor
            ariaLabel="priority 函数代码"
            disabled={running}
            onChange={(queueCode) => onChange({ ...draft, queueCode, priority: null } as D)}
            value={queueSource}
          />
        </>
      ) : null}

      <div className="submit-row">
        <button
          className="button button-secondary"
          disabled={running || modelStatus !== "ready" || orders.length === 0}
          onClick={() => void run()}
          type="button"
        >
          {running ? "推理中…" : "运行，听 12 张订单"}
        </button>
        <button
          className="button button-primary"
          disabled={submitting || !ready}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? "判定中…" : isFinal ? "提交晚餐高峰" : "提交智能接单"}
        </button>
        {ready ? null : <span className="submit-note">还没有运行结果，先运行一次。</span>}
      </div>

      {error ? (
        <p className="test-error" role="alert">
          {error}
        </p>
      ) : null}
      {runNote ? <p className="lunch-note">{runNote}</p> : null}

      {preview ? (
        <div className="lunch-table-wrap">
          <table className="lunch-orders-table">
            <thead>
              <tr>
                <th>订单</th>
                <th>顾客说</th>
                <th>AI 记的小票</th>
                <th>similarity</th>
                <th>margin</th>
                <th>处理</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((row) => (
                <tr key={row.id}>
                  <td>
                    <b>{row.id}</b>
                  </td>
                  <td>
                    <small>{row.request}</small>
                  </td>
                  <td>{ticketText(row.prediction)}</td>
                  <td>
                    {fmt(row.prediction.similarity)}
                    <br />
                    <small>较弱：{weakestField(row.prediction)}</small>
                  </td>
                  <td>{fmt(row.prediction.margin)}</td>
                  <td>{row.confirmed ? "再确认 +1 拍" : "直接记"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {intakeResult ? (
        <section className="lunch-result" role="status">
          <p className="eyebrow">练习成绩</p>
          <div className="lunch-stat-row">
            <span>
              <b>
                {intakeResult.correct} / {intakeResult.total}
              </b>
              小票正确
            </span>
            <span>
              <b>{intakeResult.confirmed}</b>
              次确认（≤{AI_CONFIRM_BUDGET} 次内）
            </span>
          </div>
          <p
            className={
              intakeResult.correct === intakeResult.total &&
              intakeResult.confirmed <= AI_CONFIRM_BUDGET
                ? "lunch-feedback success"
                : "lunch-feedback"
            }
          >
            {intakeResult.correct === intakeResult.total &&
            intakeResult.confirmed <= AI_CONFIRM_BUDGET
              ? "过关：AI 记错的你都挑出来再确认了，预算也没超。"
              : intakeResult.confirmed > AI_CONFIRM_BUDGET
                ? `确认 ${intakeResult.confirmed} 次超了 ${AI_CONFIRM_BUDGET} 次上限，只挑最没把握的问。`
                : `记错 ${intakeResult.total - intakeResult.correct} 张——把确认留给 AI 真正听错的那几单。`}
          </p>
          <div className="lunch-table-wrap">
            <table className="lunch-orders-table">
              <thead>
                <tr>
                  <th>订单</th>
                  <th>顾客说</th>
                  <th>记的小票</th>
                  <th>正确小票</th>
                  <th>确认</th>
                </tr>
              </thead>
              <tbody>
                {(intakeResult.orders ?? []).map((order: AiIntakeOrderResult) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.id}</b>
                    </td>
                    <td>
                      <small>{order.request}</small>
                    </td>
                    <td>
                      {order.correct ? "✓ " : "✗ "}
                      {`${order.produced.item}·${order.produced.note}·${order.produced.table}号·${order.produced.urgent ? "加急" : "普通"}`}
                    </td>
                    <td>
                      <small>{`${order.expected.item}·${order.expected.note}·${order.expected.table}号·${order.expected.urgent ? "加急" : "普通"}`}</small>
                    </td>
                    <td>{order.confirmed ? "已确认" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {finalResult ? (
        <section className="lunch-result" role="status">
          <p className="eyebrow">正式成绩</p>
          <div className="lunch-stat-row">
            <span>
              <b>
                {finalResult.correct} / {finalResult.total}
              </b>
              小票正确
            </span>
            <span>
              <b>{finalResult.confirmed}</b>
              次确认（≤{AI_CONFIRM_BUDGET} 次内）
            </span>
            <span>
              <b>
                {finalResult.served} / {finalResult.total}
              </b>
              记对且准时
            </span>
          </div>
          <p
            className={
              finalResult.correct >= AI_PASS_CORRECT &&
              finalResult.confirmed <= AI_CONFIRM_BUDGET &&
              finalResult.served >= AI_SERVED_MIN
                ? "lunch-feedback success"
                : "lunch-feedback"
            }
          >
            {finalResult.correct >= AI_PASS_CORRECT &&
            finalResult.confirmed <= AI_CONFIRM_BUDGET &&
            finalResult.served >= AI_SERVED_MIN
              ? "过关：接单和高峰排队一起扛住了。"
              : finalResult.correct < AI_PASS_CORRECT
                ? `记错 ${finalResult.total - finalResult.correct} 张，把确认留给 AI 真正听错的那几单。`
                : finalResult.confirmed > AI_CONFIRM_BUDGET
                  ? `确认 ${finalResult.confirmed} 次超了 ${AI_CONFIRM_BUDGET} 次上限，只挑最没把握的问。`
                  : `小票都对了但只 ${finalResult.served} 张记对且准时，确认停拍拖慢了出餐，把确认再省一点，或让 priority 多拉等太久的单。`}
          </p>
          <div className="lunch-table-wrap">
            <table className="lunch-orders-table">
              <thead>
                <tr>
                  <th>订单</th>
                  <th>小票</th>
                  <th>确认</th>
                  <th>送达</th>
                </tr>
              </thead>
              <tbody>
                {(finalResult.orders ?? []).map((order: AiOrderResult) => (
                  <tr key={order.id}>
                    <td>
                      <b>{order.id}</b>
                    </td>
                    <td>{order.correct ? "记对了" : "记错了"}</td>
                    <td>{order.confirmed ? "已确认" : "—"}</td>
                    <td>{order.onTime ? "记对且准时" : "没算分"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </section>
  );
}
