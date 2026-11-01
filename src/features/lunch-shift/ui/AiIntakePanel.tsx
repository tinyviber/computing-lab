/**
 * Stage 4 · 智能接单: the vendored BGE model runs in the browser and
 * proposes a ticket per hidden order, reporting a similarity and a
 * margin per order. The student's need_confirm(similarity, margin) —
 * evaluated in the shared Pyodide worker — decides which orders the
 * simulated customer restates. Confirmed orders always record right
 * but stall intake one tick; unconfirmed ones keep the AI's ticket.
 * The submission is normalized rows only — no model, no vectors.
 */

import { useEffect, useState } from "react";
import { AI_CONFIRM_BUDGET, AI_CONFIRM_MIN, AI_PASS_CORRECT } from "../domain/stages.ts";
import {
  predictTicket,
  textsToEmbed,
  type TicketPrediction,
  type Vector,
} from "../domain/aiIntake.ts";
import type { AiDraft, AiOrderResult, LunchTestSummary } from "../domain/protocol.ts";
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

export function AiIntakePanel({
  draft,
  orders,
  submitting,
  result,
  onChange,
  onSubmit,
}: {
  draft: AiDraft;
  orders: { id: string; request: string }[];
  submitting: boolean;
  result: LunchTestSummary | null;
  onChange: (draft: AiDraft) => void;
  onSubmit: () => void;
}) {
  const [modelStatus, setModelStatus] = useState<"loading" | "ready" | "error">("loading");
  const [modelInfo, setModelInfo] = useState<EmbedInfo | null>(null);
  const [modelError, setModelError] = useState<string | null>(null);
  const [progress, setProgress] = useState<EmbedProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);

  const confirmSource = draft.confirmCode.trim() ? draft.confirmCode : NEED_CONFIRM_STARTER;
  const queueSource = draft.queueCode.trim() ? draft.queueCode : QUEUE_STARTER;
  const ready = draft.results !== null && draft.priority !== null;

  const finalResult = result?.kind === "final" ? result : null;

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

  const run = async () => {
    setRunning(true);
    setError(null);
    try {
      const punct =
        describeFullWidthPunctuation(confirmSource) ?? describeFullWidthPunctuation(queueSource);
      if (punct) throw new Error(punct);
      const texts = textsToEmbed(orders.map((order) => order.request));
      const { vectors } = await embedTexts(texts);
      const embedOf = (text: string): Vector => vectors[texts.indexOf(text)];
      const predictions = orders.map((order) => predictTicket(order.request, embedOf));
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
      const priority = checkPriorityTable(await runPriorityTable(queueSource));
      if (priority.errors.length > 0 || priority.table === null) {
        throw new Error(priority.errors[0] ?? "priority 结果表不合法");
      }
      const rows = orders.map((order, index) => ({
        id: order.id,
        request: order.request,
        prediction: predictions[index],
        confirmed: confirms[index],
      }));
      setPreview(rows);
      onChange({
        confirmCode: confirmSource,
        queueCode: queueSource,
        priority: priority.table,
        results: rows.map((row) => ({
          id: row.id,
          ticket: row.prediction.ticket,
          confirmed: row.confirmed,
        })),
      });
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="lunch-challenge">
      <p>
        AI 接单模型就在浏览器里跑，不上服务器。它给每张订单记一张小票，并报告{" "}
        <code>similarity</code>（最有把握的候选有多像）和 <code>margin</code>
        （第一名领先第二名多少）。你的 need_confirm 决定哪几单让顾客再确认一遍，确认必对，但接单台停
        1 拍。
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

      <p className="eyebrow">排队的函数（沿用第三关，照样跑正式订单）</p>
      <CodeEditor
        ariaLabel="priority 函数代码"
        disabled={running}
        onChange={(queueCode) => onChange({ ...draft, queueCode, priority: null })}
        value={queueSource}
      />

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
          {submitting ? "判定中…" : "提交智能接单"}
        </button>
        {ready ? null : <span className="submit-note">还没有运行结果，先运行一次。</span>}
      </div>

      {error ? (
        <p className="test-error" role="alert">
          {error}
        </p>
      ) : null}

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
              次确认（{AI_CONFIRM_MIN}～{AI_CONFIRM_BUDGET} 次内）
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
              finalResult.confirmed >= AI_CONFIRM_MIN &&
              finalResult.confirmed <= AI_CONFIRM_BUDGET
                ? "lunch-feedback success"
                : "lunch-feedback"
            }
          >
            {finalResult.correct >= AI_PASS_CORRECT &&
            finalResult.confirmed >= AI_CONFIRM_MIN &&
            finalResult.confirmed <= AI_CONFIRM_BUDGET
              ? "压线过关：AI 接单加上挑出来的确认，小票够用。"
              : finalResult.confirmed < AI_CONFIRM_MIN
                ? "一次都没确认，至少让最没把握的单再问一遍。"
                : finalResult.confirmed > AI_CONFIRM_BUDGET
                  ? `确认 ${finalResult.confirmed} 次超了 ${AI_CONFIRM_BUDGET} 次上限，只挑最没把握的问。`
                  : `只记对 ${finalResult.correct} 张，把确认留给 AI 最没把握的那几单。`}
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
