/**
 * Stage 4 · 智能接单: the AI intake panel. The vendored BGE model runs
 * in the browser and proposes a ticket per order, reporting a similarity
 * and a margin. The student's need_confirm(similarity, margin) —
 * evaluated in the shared Pyodide worker — decides which orders the
 * simulated customer restates. Confirmed orders always record right but
 * stall intake one tick; unconfirmed ones keep the AI's ticket.
 *
 * The stage teaches need_confirm itself: a practice run on the 12 public
 * orders (expected tickets visible) shows which predictions the model
 * gets wrong or unsure about, then the same function runs the 12 hidden
 * orders together with the carried-over stage-3 priority table. The
 * submission is normalized rows only — no model, no vectors.
 *
 * Predictions are cached per order set: re-running after an edit to
 * need_confirm only re-evaluates the Python function, not the model —
 * the classroom feedback loop stays near-instant.
 */

import { useEffect, useRef, useState } from "react";
import { AI_CONFIRM_BUDGET, AI_PASS_CORRECT, AI_SERVED_MIN } from "../domain/stages.ts";
import {
  PRACTICE_ORDERS,
  predictTicket,
  textsToEmbed,
  type TicketPrediction,
  type Vector,
} from "../domain/aiIntake.ts";
import { sameTicket } from "../domain/contracts.ts";
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

type PracticeRow = PreviewRow & {
  expected: { item: string; note: string; table: string; urgent: boolean };
};

function ticketText(prediction: TicketPrediction): string {
  const t = prediction.ticket;
  return `${t.item || "?"} · 「${t.note}」 · ${t.table || "?"}号桌 · ${t.urgent ? "加急" : "普通"}`;
}

function expectedText(ticket: PracticeRow["expected"]): string {
  return `${ticket.item} · 「${ticket.note}」 · ${ticket.table}号桌 · ${ticket.urgent ? "加急" : "普通"}`;
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

/** need_confirm verdicts must be strict booleans, one per order. */
function checkConfirms(raw: unknown, count: number): boolean[] {
  const confirms = Array.isArray(raw) ? raw : [];
  if (confirms.length !== count || confirms.some((value) => typeof value !== "boolean")) {
    throw new Error("need_confirm 要对每张订单返回 True 或 False。");
  }
  return confirms as boolean[];
}

/** Round the scores fed to the student's function — stable, readable. */
function confirmCases(predictions: TicketPrediction[]): [number, number][] {
  return predictions.map((prediction) => [
    Math.round(prediction.similarity * 10000) / 10000,
    Math.round(prediction.margin * 10000) / 10000,
  ]);
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
  /** The hidden final orders — ids and wording only, no answers. */
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
  const [practicing, setPracticing] = useState(false);
  const [runNote, setRunNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [practiceRows, setPracticeRows] = useState<PracticeRow[] | null>(null);

  // Model predictions keyed by the order set — an edit to need_confirm
  // or priority does not re-embed 300+ texts, so a rerun is Python-fast.
  const predictionCache = useRef<Map<string, TicketPrediction[]> | null>(null);

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

  const predict = async (
    list: { id: string; request: string }[],
  ): Promise<{ predictions: TicketPrediction[]; cached: boolean }> => {
    const key = list.map((order) => `${order.id}${order.request}`).join("");
    const cache = (predictionCache.current ??= new Map());
    const cached = cache.get(key);
    if (cached) return { predictions: cached, cached: true };
    const texts = textsToEmbed(list.map((order) => order.request));
    const { vectors } = await embedTexts(texts);
    const embedOf = (text: string): Vector => vectors[texts.indexOf(text)];
    const predictions = list.map((order) => predictTicket(order.request, embedOf));
    cache.set(key, predictions);
    return { predictions, cached: false };
  };

  /** Practice pass — the public orders with answers, for tuning only. */
  const runPractice = async () => {
    setPracticing(true);
    setError(null);
    try {
      const punct = describeFullWidthPunctuation(confirmSource);
      if (punct) throw new Error(punct);
      const { predictions, cached } = await predict(PRACTICE_ORDERS);
      const confirms = checkConfirms(
        await runNeedConfirm(confirmSource, confirmCases(predictions)),
        PRACTICE_ORDERS.length,
      );
      setPracticeRows(
        PRACTICE_ORDERS.map((order, index) => ({
          id: order.id,
          request: order.request,
          prediction: predictions[index],
          expected: order.expected,
          confirmed: confirms[index],
        })),
      );
      setRunNote(cached ? "只用了缓存的预测，很快吧。" : null);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setPracticing(false);
    }
  };

  /** Graded pass — hidden orders, AI ticket + confirm verdict + priority. */
  const run = async () => {
    setRunning(true);
    setError(null);
    setRunNote(null);
    try {
      const punct =
        describeFullWidthPunctuation(confirmSource) ?? describeFullWidthPunctuation(queueSource);
      if (punct) throw new Error(punct);
      const { predictions, cached } = await predict(orders);
      const confirms = checkConfirms(
        await runNeedConfirm(confirmSource, confirmCases(predictions)),
        orders.length,
      );
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
      });
      setRunNote(cached ? "只用了缓存的预测，很快吧。" : null);
    } catch (err) {
      setError(friendlyRunError(err instanceof Error ? err.message : String(err)));
    } finally {
      setRunning(false);
    }
  };

  const aiCorrect = practiceRows?.filter(
    (row) => !row.confirmed && sameTicket(row.prediction.ticket, row.expected),
  ).length;
  const practiceConfirmed = practiceRows?.filter((row) => row.confirmed).length ?? 0;
  const practiceCorrect = practiceRows?.filter(
    (row) => row.confirmed || sameTicket(row.prediction.ticket, row.expected),
  ).length;

  return (
    <section className="lunch-challenge">
      <p>
        第二关的词表只会认写过的词；这台 AI
        接单台在浏览器里用语义模型直接听顾客的话，没见过的说法也能猜。 但它会拿不准：每张订单附{" "}
        <code>similarity</code>（最有把握的候选有多像）和 <code>margin</code>
        （第一名领先第二名多少）。你的 need_confirm 决定哪几单让顾客再确认一遍，确认必对，但接单台停
        1 拍。{AI_PASS_CORRECT} 张小票全对、确认 ≤{AI_CONFIRM_BUDGET} 次、记对且准时 ≥
        {AI_SERVED_MIN} 张过关。
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
        disabled={running || practicing}
        onChange={(confirmCode) => {
          setPreview(null);
          setPracticeRows(null);
          onChange({ ...draft, confirmCode, results: null });
        }}
        value={confirmSource}
      />

      <div className="lunch-practice">
        <p>
          先拿 12 张带标准答案的练习订单试手：看看 AI 把哪几张记错了、哪几张拿不准。调好的
          need_confirm 会直接用到正式订单上。
        </p>
        <div className="submit-row">
          <button
            className="button button-secondary"
            disabled={practicing || running || modelStatus !== "ready"}
            onClick={() => void runPractice()}
            type="button"
          >
            {practicing ? "推理中…" : "在练习订单上试一遍"}
          </button>
        </div>

        {practiceRows ? (
          <>
            <p className="lunch-note" role="status">
              AI 直接记对 <b>{aiCorrect}</b> / {practiceRows.length}；need_confirm 标记了{" "}
              <b>{practiceConfirmed}</b> 张确认
              {practiceConfirmed > AI_CONFIRM_BUDGET
                ? `（超过正式关 ${AI_CONFIRM_BUDGET} 次预算——把门槛收紧一点）`
                : ""}
              ，确认后共记对 <b>{practiceCorrect}</b> / {practiceRows.length}。
            </p>
            <div className="lunch-table-wrap">
              <table className="lunch-orders-table">
                <thead>
                  <tr>
                    <th>订单</th>
                    <th>顾客说</th>
                    <th>AI 记的小票</th>
                    <th>应记小票</th>
                    <th>similarity</th>
                    <th>margin</th>
                    <th>处理</th>
                  </tr>
                </thead>
                <tbody>
                  {practiceRows.map((row) => {
                    const wrong =
                      !row.confirmed && !sameTicket(row.prediction.ticket, row.expected);
                    return (
                      <tr key={row.id}>
                        <td>
                          <b>{row.id}</b>
                        </td>
                        <td>
                          <small>{row.request}</small>
                        </td>
                        <td>{ticketText(row.prediction)}</td>
                        <td>
                          <small>{expectedText(row.expected)}</small>
                        </td>
                        <td>
                          {fmt(row.prediction.similarity)}
                          <br />
                          <small>较弱：{weakestField(row.prediction)}</small>
                        </td>
                        <td>{fmt(row.prediction.margin)}</td>
                        <td>
                          {row.confirmed
                            ? "再确认 → 记对"
                            : wrong
                              ? "直接记 → 记错"
                              : "直接记 → 记对"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>

      <p className="eyebrow">正式挑战：12 张陌生订单，接单和排队一起扛</p>
      <p>排队沿用第三关写好的 priority，确认停过的单别让它在队列里饿死。</p>
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
          {running ? "推理中…" : "运行，听 12 张正式订单"}
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
